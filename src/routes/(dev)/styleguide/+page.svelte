<script lang="ts">
	import { asset } from '$app/paths';
	import {
		Alert,
		Avatar,
		Badge,
		Button,
		Card,
		Input,
		Modal,
		OptimizedImage,
		Select,
		Spinner,
		Textarea,
		Toggle
	} from '#lib/components/ui/index.ts';
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import { reveal } from '#lib/actions/reveal.ts';

	const buttonVariants = [
		'primary',
		'secondary',
		'ghost',
		'accent',
		'sage',
		'danger',
		'success'
	] as const;
	const buttonSizes = ['sm', 'md', 'lg'] as const;
	const badgeVariants = [
		'gray',
		'red',
		'yellow',
		'green',
		'blue',
		'indigo',
		'purple',
		'pink',
		'brand',
		'primary',
		'secondary',
		'success',
		'warning',
		'error',
		'sage'
	] as const;
	const alertVariants = ['info', 'success', 'warning', 'error'] as const;
	const avatarSizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
	const spinnerSizes = ['sm', 'md', 'lg'] as const;
	const cardPaddings = ['none', 'sm', 'md', 'lg'] as const;
	const modalSizes = ['sm', 'md', 'lg', 'xl'] as const;

	let email = $state('');
	let level = $state('beginner');
	let notes = $state('');
	let newsletter = $state(true);
	let modalSize = $state<(typeof modalSizes)[number] | null>(null);
	let modalOpen = $state(false);
</script>

<svelte:head>
	<title>Styleguide - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<PageHeader
	eyebrow="Design system"
	title="Styleguide"
	lede="Every UI component in its variants, and the typographic classes ported from the legacy site."
>
	<Button arrow>Primary with orb</Button>
</PageHeader>

<section class="section">
	<div class="container-default space-y-20">
		<div class="section-header">
			<span class="eyebrow">Typography</span>
			<h2 class="section-title mt-6">Section title</h2>
			<p class="section-description mt-6">Section description in the reading measure.</p>
		</div>

		<div class="space-y-6">
			<p class="display">Display</p>
			<h1 class="page-title">Page title</h1>
			<h2 class="section-heading">Section heading</h2>
			<h3 class="subsection-heading">Subsection heading</h3>
			<h3 class="card-title">Card title</h3>
			<span class="eyebrow-sage">Eyebrow sage</span>
			<p class="body-lg">Body large — professional sewing methods, taught slowly and in order.</p>
			<p class="body-base text-pretty">
				Body base — from the first straight seam to couture finishing.
			</p>
			<p class="meta">Meta text · 12 minutes</p>
			<p><a href="#typography" class="link">Inline link</a></p>
			<hr class="divider" />
			<div class="rule"></div>
			<div class="hairline-b pb-4 text-balance">Hairline bottom, balanced text</div>
			<div class="prose-editorial">
				<h2>Editorial prose</h2>
				<p>Long-form content with <strong>emphasis</strong> and <a href="#prose">links</a>.</p>
				<ul>
					<li>French seams</li>
					<li>Hong Kong binding</li>
				</ul>
			</div>
		</div>

		<div class="space-y-6">
			<h2 class="section-heading">Buttons</h2>
			{#each buttonSizes as size (size)}
				<div class="flex flex-wrap items-center gap-4">
					{#each buttonVariants as variant (variant)}
						<Button {variant} {size}>{variant} {size}</Button>
					{/each}
				</div>
			{/each}
			<div class="flex flex-wrap items-center gap-4">
				<Button loading>Loading</Button>
				<Button disabled>Disabled</Button>
				<Button fullWidth arrow>Full width</Button>
			</div>
		</div>

		<div class="space-y-6">
			<h2 class="section-heading">Badges</h2>
			<div class="flex flex-wrap gap-3">
				{#each badgeVariants as variant (variant)}
					<Badge {variant}>{variant}</Badge>
				{/each}
			</div>
			<div class="flex flex-wrap gap-3">
				<Badge size="md" dot variant="sage">Dot, medium</Badge>
				<Badge removable variant="brand">Removable</Badge>
			</div>
		</div>

		<div class="space-y-4">
			<h2 class="section-heading">Alerts</h2>
			{#each alertVariants as variant (variant)}
				<Alert {variant} title="{variant} title">An {variant} message.</Alert>
			{/each}
			<Alert dismissible>Dismissible, no title.</Alert>
		</div>

		<div class="space-y-6">
			<h2 class="section-heading">Avatars and spinners</h2>
			<div class="flex items-center gap-4">
				{#each avatarSizes as size (size)}
					<Avatar name="Skyler Sewing" {size} />
				{/each}
				<Avatar src={asset('images/skyler-avatar.jpg')} alt="Skyler" size="lg" />
			</div>
			<div class="flex items-center gap-4">
				{#each spinnerSizes as size (size)}
					<Spinner {size} />
				{/each}
			</div>
		</div>

		<div class="space-y-6">
			<h2 class="section-heading">Cards</h2>
			<div class="grid gap-6 md:grid-cols-2">
				{#each cardPaddings as padding (padding)}
					<Card {padding}><p class="body-base">Padding {padding}</p></Card>
				{/each}
				<Card tone="sage" interactive>
					{#snippet header()}<h3 class="card-title">Header snippet</h3>{/snippet}
					<p class="body-base">Sage tone, interactive.</p>
					{#snippet footer()}<p class="meta">Footer snippet</p>{/snippet}
				</Card>
			</div>
			<div class="grid gap-6 md:grid-cols-3">
				<div class="shell"><div class="core p-6">shell / core</div></div>
				<div class="shell-lg"><div class="core-lg p-6">shell-lg / core-lg</div></div>
				<div class="shell-sage"><div class="core p-6">shell-sage</div></div>
				<div class="plate"><div class="plate-inner p-6">plate / plate-inner</div></div>
				<div class="card p-6">card</div>
				<div class="mask-fade-b mask-fade-r h-24 bg-brand-200">masks</div>
			</div>
		</div>

		<div class="grid gap-6 md:grid-cols-2">
			<h2 class="section-heading md:col-span-2">Form fields</h2>
			<Input label="Email" name="email" type="email" bind:value={email} hint="We never share it." />
			<Input label="With error" name="broken" error="This field is required" />
			<Select label="Level" name="level" bind:value={level}>
				<option value="beginner">Beginner</option>
				<option value="advanced">Advanced</option>
			</Select>
			<Select label="Select with error" name="level-error" error="Choose one">
				<option value="">—</option>
			</Select>
			<Textarea label="Notes" name="notes" bind:value={notes} hint="Markdown welcome." />
			<Textarea label="Textarea with error" name="notes-error" error="Too short" />
			<Toggle label="Newsletter" description="Monthly, never more." bind:checked={newsletter} />
			<Toggle label="Disabled" disabled />
			<div>
				<label for="raw-input" class="label">Raw classes</label>
				<input id="raw-input" class="input" placeholder=".input" />
				<select class="select mt-3" aria-label=".select"><option>.select</option></select>
				<textarea class="textarea mt-3" aria-label=".textarea" placeholder=".textarea"></textarea>
			</div>
		</div>

		<div class="space-y-6">
			<h2 class="section-heading">Modal</h2>
			<div class="flex flex-wrap gap-4">
				{#each modalSizes as size (size)}
					<Button
						variant="secondary"
						onclick={() => {
							modalSize = size;
							modalOpen = true;
						}}>Open {size}</Button
					>
				{/each}
			</div>
			<Modal bind:open={modalOpen} title="Modal {modalSize}" size={modalSize ?? 'md'}>
				<p class="body-base">Modal body.</p>
				{#snippet footer()}
					<Button variant="ghost" onclick={() => (modalOpen = false)}>Close</Button>
				{/snippet}
			</Modal>
		</div>

		<div class="space-y-6">
			<h2 class="section-heading">Images and reveal</h2>
			<div class="grid gap-6 md:grid-cols-2">
				<OptimizedImage src="/images/hero-sewing.jpg" alt="Hero" width={800} class="rounded-2xl" />
				<div class="reveal" use:reveal={{ delay: 120 }}>
					<p class="body-lg">This block arrives with the reveal action.</p>
				</div>
			</div>
		</div>
	</div>
</section>

<section class="section-alt section-tight">
	<div class="container-narrow"><p class="body-base">container-narrow in section-alt</p></div>
	<div class="container-wide mt-6"><p class="body-base">container-wide</p></div>
</section>

<section class="relative isolate overflow-hidden py-24">
	<div class="aurora -top-24 left-1/4 h-80 w-80 bg-brand-200/40" aria-hidden="true"></div>
	<div class="container-default"><p class="body-base">aurora</p></div>
</section>
