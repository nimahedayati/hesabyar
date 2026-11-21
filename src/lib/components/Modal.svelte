<script>
	import Icon from './Icon.svelte';

	let { open = false, title = '', subtitle = '', onclose = () => {}, children, footer, size = 'md' } = $props();

	const W = { sm: 'max-w-[420px]', md: 'max-w-[600px]', lg: 'max-w-[820px]', xl: 'max-w-[1040px]' };

	function esc(e) {
		if (e.key === 'Escape' && open) onclose();
	}
</script>

<svelte:window onkeydown={esc} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="absolute inset-0 bg-[#0d1522]/35 backdrop-blur-[2px]"
			onclick={onclose}
			role="presentation"
		></div>
		<div
			class="relative flex max-h-[92vh] w-full {W[size]} flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_70px_-20px_rgba(13,21,34,.45)] rise"
		>
			<header class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
				<div>
					<h3 class="text-[15px] font-bold text-ink">{title}</h3>
					{#if subtitle}<p class="mt-0.5 text-[12px] text-muted">{subtitle}</p>{/if}
				</div>
				<button
					class="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-paper2 hover:text-ink"
					onclick={onclose}
					aria-label="بستن"
				>
					<Icon name="x" size={16} />
				</button>
			</header>

			<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin">
				{@render children?.()}
			</div>

			{#if footer}
				<footer class="flex items-center justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</div>
{/if}
