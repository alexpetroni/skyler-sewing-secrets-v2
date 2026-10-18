<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import type { Upload } from 'tus-js-client';
	import Alert from '#lib/components/ui/Alert.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';

	/** What `/admin/api/upload-ticket` (and `/reissue`) return: presigned headers, never a key. */
	interface Ticket {
		assetId: string;
		endpoint: string;
		headers: Record<string, string>;
		metadata?: Record<string, string>;
	}

	type Phase = 'idle' | 'starting' | 'uploading' | 'paused' | 'processing' | 'ready' | 'failed';

	interface Props {
		ticketUrl?: string;
		reissueUrl?: string;
		/** `${statusUrl}/${assetId}` answers `{ status }`. */
		statusUrl?: string;
	}

	let {
		ticketUrl = '/admin/api/upload-ticket',
		reissueUrl = '/admin/api/upload-ticket/reissue',
		statusUrl = '/admin/api/media'
	}: Props = $props();

	const CHUNK_SIZE = 5 * 1024 * 1024;
	const RETRY_DELAYS = [0, 3000, 10000];
	const POLL_MS = 5000;

	let file = $state<File | null>(null);
	let title = $state('');
	let phase = $state<Phase>('idle');
	let progress = $state(0);
	let errorMessage = $state<string | null>(null);
	let assetId = $state<string | null>(null);
	/** An unfinished upload of the chosen file from before a reload. */
	let resumableAssetId = $state<string | null>(null);
	let upload: Upload | null = null;
	let pollTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(pollTimer));

	/** The browser remembers which asset an interrupted file belongs to (tus keeps the upload URL). */
	const storageKey = (f: File) => `bunny-upload:${f.name}:${f.size}:${f.lastModified}`;

	function onfile(event: Event & { currentTarget: HTMLInputElement }) {
		file = event.currentTarget.files?.[0] ?? null;
		errorMessage = null;
		resumableAssetId = file ? localStorage.getItem(storageKey(file)) : null;
		if (file && !title) title = file.name.replace(/\.[^.]+$/, '');
	}

	async function postJson(url: string, body: unknown): Promise<Ticket> {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) {
			const failure: { error?: string } = await response.json().catch(() => ({}));
			throw new Error(failure.error ?? `Request failed (${response.status})`);
		}
		return response.json();
	}

	async function run(ticket: Ticket, resume: boolean) {
		if (!file) return;
		const { Upload } = await import('tus-js-client');
		const current = file;
		assetId = ticket.assetId;
		localStorage.setItem(storageKey(current), ticket.assetId);
		upload = new Upload(current, {
			endpoint: ticket.endpoint,
			headers: ticket.headers,
			metadata: ticket.metadata ?? { title, filetype: current.type },
			chunkSize: CHUNK_SIZE,
			retryDelays: RETRY_DELAYS,
			onProgress(sent, total) {
				progress = total > 0 ? Math.round((sent / total) * 100) : 0;
			},
			onError(err) {
				phase = 'paused';
				errorMessage = `The upload stopped: ${err.message}. Resume to continue.`;
			},
			onSuccess() {
				localStorage.removeItem(storageKey(current));
				resumableAssetId = null;
				progress = 100;
				phase = 'processing';
				poll();
			}
		});
		if (resume) {
			const previous = await upload.findPreviousUploads();
			if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
		}
		phase = 'uploading';
		upload.start();
	}

	async function start() {
		if (!file || !title.trim()) {
			errorMessage = 'Choose a video file and give it a title.';
			return;
		}
		phase = 'starting';
		errorMessage = null;
		try {
			await run(await postJson(ticketUrl, { title: title.trim(), filetype: file.type }), false);
		} catch (err) {
			phase = 'idle';
			errorMessage = err instanceof Error ? err.message : 'The upload could not start.';
		}
	}

	/** After a reload: a fresh ticket for the same Bunny video, then tus continues where it stopped. */
	async function resumeAfterReload() {
		if (!file || !resumableAssetId) return;
		phase = 'starting';
		errorMessage = null;
		try {
			await run(await postJson(reissueUrl, { assetId: resumableAssetId }), true);
		} catch (err) {
			phase = 'idle';
			errorMessage = err instanceof Error ? err.message : 'The upload could not resume.';
		}
	}

	async function pause() {
		await upload?.abort();
		phase = 'paused';
	}

	function resume() {
		errorMessage = null;
		phase = 'uploading';
		upload?.start();
	}

	async function poll() {
		if (!assetId) return;
		try {
			const response = await fetch(`${statusUrl}/${assetId}`);
			if (response.ok) {
				const body: { status: string } = await response.json();
				if (body.status === 'ready' || body.status === 'failed') {
					phase = body.status;
					return;
				}
			}
		} catch {
			// A dropped poll is retried on the next tick.
		}
		pollTimer = setTimeout(poll, POLL_MS);
	}
</script>

<div class="space-y-6">
	{#if errorMessage}
		<Alert variant="error">{errorMessage}</Alert>
	{/if}

	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<div>
			<label for="upload-file" class="label">Video file</label>
			<input
				id="upload-file"
				type="file"
				accept="video/*"
				class="block w-full text-sm text-charcoal-600 file:mr-4 file:rounded-full file:border-0 file:bg-charcoal-900/[0.04] file:px-4 file:py-2 file:text-sm file:font-medium"
				disabled={phase !== 'idle'}
				onchange={onfile}
			/>
		</div>
		<Input label="Title" name="title" bind:value={title} disabled={phase !== 'idle'} />
	</div>

	{#if phase !== 'idle' && phase !== 'starting'}
		<div>
			<div class="mb-1 flex justify-between text-sm text-charcoal-600">
				<span>
					{#if phase === 'uploading'}Uploading…
					{:else if phase === 'paused'}Paused
					{:else if phase === 'processing'}Uploaded; Bunny is encoding the video…
					{:else if phase === 'ready'}Ready
					{:else}Encoding failed{/if}
				</span>
				<span>{progress}%</span>
			</div>
			<div
				class="h-2 overflow-hidden rounded-full bg-charcoal-900/[0.06]"
				role="progressbar"
				aria-label="Upload progress"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={progress}
			>
				<div class="h-full bg-sage-600 transition-all" style="width: {progress}%"></div>
			</div>
		</div>
	{/if}

	<div class="flex flex-wrap gap-3">
		{#if phase === 'idle' || phase === 'starting'}
			{#if resumableAssetId}
				<Button onclick={resumeAfterReload} loading={phase === 'starting'}>Resume</Button>
				<Button variant="secondary" onclick={start} disabled={phase === 'starting'}>
					Start over
				</Button>
			{:else}
				<Button onclick={start} loading={phase === 'starting'} disabled={!file}>Upload</Button>
			{/if}
		{:else if phase === 'uploading'}
			<Button variant="secondary" onclick={pause}>Pause</Button>
		{:else if phase === 'paused'}
			<Button onclick={resume}>Resume</Button>
		{:else if (phase === 'ready' || phase === 'failed') && assetId}
			<a href="/admin/media/{assetId}" class="btn-primary">View the video</a>
		{/if}
	</div>
</div>
