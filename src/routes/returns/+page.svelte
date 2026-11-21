<script>
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import QuantityInput from '$lib/components/QuantityInput.svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, faDate, todayISO } from '$lib/format.js';

	const PAGE_SIZE = 8;

	let kind = $state('sale_return');
	let query = $state('');
	let page = $state(1);
	let list = $state({ rows: [], total: 0, pages: 1, pageSize: PAGE_SIZE });
	let loading = $state(false);
	let source = $state(null);
	let picks = $state({});
	let settle = $state('cash');
	let treasuryId = $state('');
	let returnDate = $state(todayISO());
	let note = $state('');
	let saving = $state(false);

	const currency = $derived(session.settings?.currency || 'تومان');
	const isSale = $derived(kind === 'sale_return');
	const sourceType = $derived(isSale ? 'sale' : 'purchase');
	const treasuries = $derived(session.treasuries || []);
	const returnTotal = $derived(
		source
			? source.lines.reduce((sum, line) => sum + (picks[line.id] || 0) * line.unit_price, 0)
			: 0
	);
	const pickedCount = $derived(Object.values(picks).filter((qty) => qty > 0).length);

	onMount(() => {
		treasuryId = treasuries[0]?.id ?? '';
	});

	$effect(() => {
		kind;
		query;
		page;
		const timer = setTimeout(loadList, 180);
		return () => clearTimeout(timer);
	});

	async function loadList() {
		loading = true;
		try {
			list = await api('docs.list', { type: sourceType, q: query, page, pageSize: PAGE_SIZE });
		} finally {
			loading = false;
		}
	}

	async function selectInvoice(row) {
		source = await api('docs.get', { id: row.id });
		picks = Object.fromEntries(source.lines.map((line) => [line.id, 0]));
	}

	function setPick(lineId, qty, max) {
		picks[lineId] = Math.min(Math.max(qty || 0, 0), max);
	}

	function switchKind(value) {
		if (kind === value) return;
		kind = value;
		source = null;
		picks = {};
		page = 1;
	}

	async function submit() {
		const lines = Object.entries(picks)
			.filter(([, qty]) => qty > 0)
			.map(([lineId, qty]) => ({ lineId: Number(lineId), qty }));

		if (!lines.length) return toast('تعداد برگشتی را برای حداقل یک کالا وارد کنید', 'warn');
		if (settle === 'cash' && !treasuryId) return toast('حساب تسویه را انتخاب کنید', 'warn');

		saving = true;
		try {
			const method = isSale ? 'docs.saleReturn' : 'docs.purchaseReturn';
			await api(method, {
				refId: source.id,
				date: returnDate,
				lines,
				settle,
				treasuryId: settle === 'cash' ? treasuryId : null,
				note
			});
			toast(`برگشت به مبلغ ${fmt(returnTotal)} ${currency} ثبت شد`);
			source = null;
			picks = {};
			note = '';
			await loadList();
		} catch (error) {
			toast(error.message, 'err', 5000);
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-[1320px] px-6 py-5">
	<div class="mb-3 flex flex-wrap items-center gap-2">
		<div class="flex gap-1">
			<button class="chip {kind === 'sale_return' ? 'active' : ''}" onclick={() => switchKind('sale_return')}>
				برگشت از فروش
			</button>
			<button class="chip {kind === 'purchase_return' ? 'active' : ''}" onclick={() => switchKind('purchase_return')}>
				برگشت از خرید
			</button>
		</div>
		<div class="relative w-[280px]">
			<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" size={15} /></span>
			<input
				class="input !h-9 !pr-9 !text-[12.5px]"
				placeholder="شماره فاکتور یا نام طرف حساب"
				bind:value={query}
				oninput={() => (page = 1)}
			/>
		</div>
		<div class="flex-1"></div>
		<a href="/invoices" class="btn btn-ghost btn-sm">مشاهده همه اسناد</a>
	</div>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-3">
		<div class="card overflow-hidden">
			<div class="border-b border-line px-4 py-2.5 text-[12px] font-medium text-ink">
				{isSale ? 'انتخاب فاکتور فروش' : 'انتخاب فاکتور خرید'}
			</div>

			<div class="max-h-[520px] overflow-y-auto scroll-thin">
				{#if loading}
					{#each [1, 2, 3, 4] as row (row)}
						<div class="border-b border-line px-4 py-3"><div class="skeleton h-8"></div></div>
					{/each}
				{:else if list.rows.length === 0}
					<p class="py-10 text-center text-[12px] text-muted2">فاکتوری یافت نشد</p>
				{:else}
					{#each list.rows as row (row.id)}
						<button
							class="flex w-full items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-right transition hover:bg-paper/60
							{source?.id === row.id ? 'bg-paper' : ''}"
							onclick={() => selectInvoice(row)}
						>
							<div class="min-w-0">
								<div class="mono-num text-[12px] font-medium text-ink">{row.number}</div>
								<div class="truncate text-[11px] text-muted">{row.party_label}</div>
							</div>
							<div class="shrink-0 text-left">
								<div class="num text-[12px] text-ink">{fmt(row.total)}</div>
								<div class="text-[10px] text-muted2">{faDate(row.doc_date)}</div>
							</div>
						</button>
					{/each}
				{/if}
			</div>

			<Pagination page={list.page} pages={list.pages} total={list.total} pageSize={PAGE_SIZE} onchange={(p) => (page = p)} />
		</div>

		<div class="space-y-3 xl:col-span-2">
			{#if !source}
				<div class="card flex h-[280px] flex-col items-center justify-center gap-2 text-muted2">
					<Icon name="receipt" size={28} />
					<p class="text-[12.5px]">یک فاکتور را از فهرست انتخاب کنید</p>
				</div>
			{:else}
				<div class="card overflow-hidden">
					<div class="flex items-center justify-between border-b border-line bg-paper/50 px-4 py-2.5">
						<div>
							<div class="mono-num text-[12.5px] font-medium text-ink">{source.number}</div>
							<div class="text-[11px] text-muted">
								{source.party?.name || source.party_name || 'مشتری متفرقه'} · {faDate(source.doc_date, 'long')}
							</div>
						</div>
						<span class="tag tag-neutral">مبلغ {fmt(source.total)}</span>
					</div>

					<table class="table">
						<thead>
							<tr>
								<th>کالا</th>
								<th class="!text-left">تعداد فاکتور</th>
								<th class="!text-left">قیمت واحد</th>
								<th class="!w-[110px]">تعداد برگشتی</th>
								<th class="!text-left">مبلغ برگشت</th>
							</tr>
						</thead>
						<tbody>
							{#each source.lines as line (line.id)}
								<tr>
									<td class="text-[12.5px] text-ink">{line.product_name || line.description}</td>
									<td class="!text-left num">{fmt(line.qty)}</td>
									<td class="!text-left num">{fmt(line.unit_price)}</td>
									<td>
										<QuantityInput
											value={picks[line.id] || 0}
											unit={line.unit}
											allowZero
											max={line.qty}
											onchange={(value) => setPick(line.id, value, line.qty)}
											class="input !h-8 !px-2 !text-[12px]"
										/>
									</td>
									<td class="!text-left num text-ink">{fmt((picks[line.id] || 0) * line.unit_price)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="card card-pad">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<span class="label">نحوه تسویه</span>
							<div class="flex gap-1.5">
								<button class="chip {settle === 'cash' ? 'active' : ''}" onclick={() => (settle = 'cash')}>
									{isSale ? 'بازپرداخت نقدی' : 'دریافت نقدی'}
								</button>
								<button class="chip {settle === 'credit' ? 'active' : ''}" onclick={() => (settle = 'credit')}>
									تسویه اعتباری (روی حساب شخص)
								</button>
							</div>

							{#if settle === 'cash'}
								<div class="mt-2">
									<label class="label" for="ret-tr">حساب خزانه</label>
									<select id="ret-tr" class="input" bind:value={treasuryId}>
										{#each treasuries as treasury (treasury.id)}
											<option value={treasury.id}>{treasury.name}</option>
										{/each}
									</select>
								</div>
							{/if}
						</div>

						<div>
							<label class="label" for="ret-date">تاریخ برگشت</label>
							<DateInput id="ret-date" bind:value={returnDate} />
						</div>
						<div class="col-span-2">
							<label class="label" for="ret-note">توضیحات</label>
							<input id="ret-note" class="input" bind:value={note} placeholder="اختیاری" />
							<div class="mt-3 flex items-end justify-between rounded-lg bg-paper px-3 py-2">
								<span class="text-[11.5px] text-muted">{fmt(pickedCount)} قلم انتخاب شده</span>
								<span class="num text-[16px] text-ink">{fmt(returnTotal)}</span>
							</div>
						</div>
					</div>

					<button class="btn btn-primary btn-lg mt-4 w-full" onclick={submit} disabled={saving || !pickedCount}>
						<Icon name="refresh" size={16} />
						{saving ? 'در حال ثبت…' : isSale ? 'ثبت برگشت از فروش' : 'ثبت برگشت از خرید'}
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
