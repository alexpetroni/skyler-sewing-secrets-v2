<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		/** The textarea's form field name. */
		name: string;
		label: string;
		/** The saved Markdown. */
		value?: string;
		/** The saved, sanitised `*_html` for that Markdown, shown until the first edit. */
		html?: string;
		error?: string;
		rows?: number;
		/** Renders Markdown through the server's sanitiser; never in the browser. */
		previewUrl?: string;
	}

	let {
		name,
		label,
		value = '',
		html = '',
		error,
		rows = 14,
		previewUrl = '/admin/api/markdown-preview'
	}: Props = $props();

	const id = $props.id();
	let markdown = $state(untrack(() => value));
	let previewHtml = $state(untrack(() => html));
	let previewError = $state<string | null>(null);
	let loading = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;

	async function refresh() {
		controller?.abort();
		controller = new AbortController();
		loading = true;
		try {
			const response = await fetch(previewUrl, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ markdown }),
				signal: controller.signal
			});
			if (!response.ok) throw new Error(`Preview failed (${response.status})`);
			const body: { html: string } = await response.json();
			previewHtml = body.html;
			previewError = null;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			previewError = 'The preview could not be rendered; your text is unchanged.';
		} finally {
			loading = false;
		}
	}

	function oninput() {
		clearTimeout(timer);
		timer = setTimeout(refresh, 500);
	}
</script>

<div>
	<div class="mb-2 flex items-center justify-between">
		<label for="{id}-input" class="label mb-0">{label}</label>
		<span class="text-[13px] text-charcoal-500">Markdown</span>
	</div>
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<textarea
			id="{id}-input"
			{name}
			{rows}
			class="textarea font-mono text-sm {error
				? 'text-red-900 ring-red-300 placeholder:text-red-300 focus:ring-red-500'
				: ''}"
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${id}-error` : undefined}
			bind:value={markdown}
			{oninput}></textarea>
		<section
			class="min-h-40 overflow-auto rounded-xl bg-white p-4 ring-1 ring-charcoal-900/[0.08]"
			aria-label="Preview"
			aria-live="polite"
			aria-busy={loading}
			data-markdown-preview
		>
			{#if previewError}
				<p class="text-[13px] text-red-700">{previewError}</p>
			{:else if previewHtml}
				<div class="prose-editorial">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised HTML from the server's renderMarkdown (content_html or the preview endpoint) -->
					{@html previewHtml}
				</div>
			{:else}
				<p class="text-sm text-charcoal-500">The preview appears here as you type.</p>
			{/if}
		</section>
	</div>
	{#if error}
		<p class="mt-2 text-[13px] text-red-700" id="{id}-error">{error}</p>
	{/if}
</div>
