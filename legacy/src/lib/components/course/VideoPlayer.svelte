<script lang="ts">
	interface Props {
		embedUrl: string | null;
		title?: string;
		class?: string;
	}

	let {
		embedUrl,
		title = 'Video',
		class: className = ''
	}: Props = $props();
</script>

<div class="aspect-video w-full overflow-hidden rounded-core bg-charcoal-950 {className}">
	{#if embedUrl}
		<iframe
			src={embedUrl}
			{title}
			loading="lazy"
			allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
			allowfullscreen
			class="h-full w-full"
		></iframe>
	{:else}
		<div class="flex h-full items-center justify-center text-charcoal-400">
			<p>Video unavailable</p>
		</div>
	{/if}
</div>
