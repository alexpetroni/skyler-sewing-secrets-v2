<script lang="ts">
	import { UPLOAD_MAX_BYTES } from '#lib/shared/uploads.ts';

	interface Props {
		/** The `accept` attribute of the file input. */
		accept: string;
		/** Receives the CDN URL of the stored file. */
		onUploaded: (url: string) => void;
		label?: string;
		endpoint?: string;
	}

	let { accept, onUploaded, label = 'Upload', endpoint = '/admin/api/upload' }: Props = $props();

	let uploading = $state(false);
	let error = $state<string | null>(null);

	async function onchange(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		error = null;
		if (file.size > UPLOAD_MAX_BYTES) {
			error = 'That file is larger than 25 MB.';
			input.value = '';
			return;
		}
		uploading = true;
		try {
			const body = new FormData();
			body.set('file', file);
			const response = await fetch(endpoint, { method: 'POST', body });
			const json = (await response.json()) as { url?: string; error?: string };
			if (!response.ok || !json.url) throw new Error(json.error ?? 'Upload failed');
			onUploaded(json.url);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

<div>
	<label
		class="btn-ghost btn-sm cursor-pointer {uploading ? 'pointer-events-none opacity-60' : ''}"
	>
		<input type="file" class="sr-only" {accept} disabled={uploading} {onchange} />
		{uploading ? 'Uploading…' : label}
	</label>
	{#if error}
		<p class="mt-2 text-[13px] text-red-700">{error}</p>
	{/if}
</div>
