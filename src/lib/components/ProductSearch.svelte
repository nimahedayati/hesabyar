<script>
	import { onMount, tick } from 'svelte';
	import Icon from './Icon.svelte';
	import { api } from '$lib/api.js';
	import { fmt } from '$lib/format.js';

	let {
		onselect = () => {},
		placeholder = 'جست‌وجوی کالا یا بارکد…',
		autofocus = false,
		limit = 8
	} = $props();

	const DEBOUNCE = 200;

	let query = $state('');
	let results = $state([]);
	let open = $state(false);
	let input;

	onMount(async () => {
		if (!autofocus) return;
		await tick();
		input?.focus();
	});

	$effect(() => {
		const text = query.trim();
		if (!text) {
			results = [];
			return;
		}
		const timer = setTimeout(async () => {
			try {
				results = await api('products.search', { q: text, limit });
			} catch {
				results = [];
			}
		}, DEBOUNCE);
		return () => clearTimeout(timer);
	});

	function choose(product) {
		onselect(product);
		query = '';
		results = [];
		open = false;
		input?.focus();
	}

	async function handleKey(event) {
		if (event.key !== 'Enter' || !query.trim()) return;
		const scanned = await api('products.byBarcode', { barcode: query.trim() });
		if (scanned) return choose(scanned);
		if (results.length) choose(results[0]);
	}

	const closeLater = () => setTimeout(() => (open = false), 160);
</script>

<div class="relative">
	<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
		<Icon name="search" size={15} />
	</span>
	<input
		bind:this={input}
		bind:value={query}
		onkeydown={handleKey}
		onfocus={() => (open = true)}
		onblur={closeLater}
		class="input !pr-9"
		{placeholder}
		autocomplete="off"
	/>

	{#if open && query.trim()}
		<div
			class="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[260px] overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-[0_16px_40px_-16px_rgba(13,21,34,.35)] scroll-thin"
		>
			{#if results.length === 0}
				<div class="px-3 py-3 text-center text-[12px] text-muted2">کالایی یافت نشد</div>
			{:else}
				{#each results as product (product.id)}
					<button
						class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right transition hover:bg-paper2"
						onmousedown={(event) => event.preventDefault()}
						onclick={() => choose(product)}
					>
						<span class="min-w-0">
							<span class="block truncate text-[12.5px] text-ink">{product.name}</span>
							<span class="block text-[10px] text-muted2">موجودی {fmt(product.stock_qty)} {product.unit}</span>
						</span>
						<span class="num shrink-0 text-[11.5px] text-ink2">{fmt(product.sale_price)}</span>
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
