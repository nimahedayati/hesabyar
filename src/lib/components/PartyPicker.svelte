<script>
	import Icon from './Icon.svelte';
	import { api } from '$lib/api.js';
	import { faDigits } from '$lib/format.js';

	let {
		id = '',
		value = $bindable(null),
		kind = null,
		placeholder = 'مشتری متفرقه',
		onselect = () => {}
	} = $props();

	let open = $state(false);
	let query = $state('');
	let results = $state([]);
	let loading = $state(false);
	let selectedName = $state('');
	let timer = null;

	async function loadSelected() {
		if (!value) {
			selectedName = '';
			return;
		}
		try {
			const party = await api('parties.get', { id: value });
			selectedName = party.name;
		} catch {
			selectedName = '';
		}
	}

	$effect(() => {
		value;
		loadSelected();
	});

	async function search(text) {
		loading = true;
		try {
			results = await api('parties.search', { q: text, kind, limit: 8 });
		} catch {
			results = [];
		} finally {
			loading = false;
		}
	}

	function handleInput(event) {
		query = event.target.value;
		open = true;
		clearTimeout(timer);
		timer = setTimeout(() => search(query), 200);
	}

	function choose(party) {
		value = party.id;
		selectedName = party.name;
		query = '';
		open = false;
		onselect(party);
	}

	function clear(event) {
		event?.stopPropagation();
		value = null;
		selectedName = '';
		query = '';
		onselect(null);
	}

	function openSearch() {
		open = true;
		query = '';
		search('');
	}

	const closeLater = () => setTimeout(() => (open = false), 160);
</script>

<div class="relative">
	{#if value && !open}
		<div class="input flex items-center justify-between gap-2 !pr-2">
			<button class="flex min-w-0 flex-1 items-center gap-1.5 text-right" onclick={openSearch}>
				<Icon name="users" size={14} class="shrink-0 text-muted" />
				<span class="truncate text-[13px] text-ink">{selectedName || '…'}</span>
			</button>
			<button
				class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition hover:bg-paper2 hover:text-neg"
				onclick={clear}
				aria-label="حذف انتخاب"
			>
				<Icon name="x" size={13} />
			</button>
		</div>
	{:else}
		<div class="relative">
			<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
				<Icon name="search" size={14} />
			</span>
			<input
				{id}
				class="input !pr-9"
				{placeholder}
				bind:value={query}
				oninput={handleInput}
				onfocus={openSearch}
				onblur={closeLater}
				autocomplete="off"
			/>
		</div>
	{/if}

	{#if open}
		<div
			class="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[240px] overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-[0_16px_40px_-16px_rgba(13,21,34,.35)] scroll-thin"
		>
			{#if loading}
				<div class="px-3 py-3 text-center text-[12px] text-muted">در حال جست‌وجو…</div>
			{:else if results.length === 0}
				<div class="px-3 py-3 text-center text-[12px] text-muted2">نتیجه‌ای یافت نشد</div>
			{:else}
				{#each results as party (party.id)}
					<button
						class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right transition hover:bg-paper2"
						onmousedown={(event) => event.preventDefault()}
						onclick={() => choose(party)}
					>
						<span class="min-w-0">
							<span class="block truncate text-[12.5px] text-ink">{party.name}</span>
							<span class="block text-[10px] text-muted2">{faDigits(party.phone) || '—'}</span>
						</span>
						{#if Math.abs(party.balance) >= 1}
							<span class="num shrink-0 text-[10.5px] {party.balance > 0 ? 'text-pos' : 'text-neg'}">
								{party.balance > 0 ? 'بدهکار' : 'بستانکار'}
							</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
