<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import UploadForm from '#lib/components/admin/UploadForm.svelte';
	import Card from '#lib/components/ui/Card.svelte';
</script>

<AdminPage title="Upload a video" description="Uploads go straight to Bunny Stream and can resume.">
	{#snippet actions()}
		<a href="/admin/media" class="btn-ghost btn-sm">All videos</a>
	{/snippet}

	<Card>
		<UploadForm />
	</Card>
</AdminPage>
