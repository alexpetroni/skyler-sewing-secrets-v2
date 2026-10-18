<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import LessonView from '#lib/components/course/LessonView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Seo
	title="{data.lesson.title} - Skyler's Sewing Secrets"
	description={data.lesson.description || `Watch ${data.lesson.title}.`}
/>

<LessonView {data} />
