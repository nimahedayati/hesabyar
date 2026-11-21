<script>
	import { onMount } from 'svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, faDate, monthStart, todayISO } from '$lib/format.js';

	let tab = $state('profit');
	let from = $state(monthStart());
	let to = $state(todayISO());
	let groupBy = $state('product');

	let profit = $state(null);
	let sales = $state([]);
	let stock = $state(null);
	let cash = $state(null);
	let balance = $state(null);

	const cur = $derived(session.settings?.currency || 'تومان');
	const TABS = [
		['profit', 'سود و زیان'],
		['sales', 'فروش'],
		['stock', 'انبار'],
		['cash', 'جریان نقدی'],
		['balance', 'ترازنامه']
	];

	async function load() {
		try {
			if (tab === 'profit') profit = await api('reports.profit', { from, to });
			else if (tab === 'sales') sales = await api('reports.sales', { from, to, groupBy });
			else if (tab === 'stock') stock = await api('reports.stock');
			else if (tab === 'cash') cash = await api('reports.cashflow', { from, to });
			else if (tab === 'balance') balance = await api('reports.balance');
		} catch (error) {
			toast(error.message, 'err');
		}
	}

	onMount(load);
	$effect(() => {
		tab;
		from;
		to;
		groupBy;
		const t = setTimeout(load, 150);
		return () => clearTimeout(t);
	});
</script>

<div class="mx-auto max-w-[1320px] px-6 py-5">
	<div class="mb-4 flex flex-wrap items-center gap-2">
		<div class="flex flex-wrap gap-1">
			{#each TABS as [k, l]}
				<button class="chip {tab === k ? 'active' : ''}" onclick={() => (tab = k)}>{l}</button>
			{/each}
		</div>
		<div class="flex-1"></div>
		{#if ['profit', 'sales', 'cash'].includes(tab)}
			<DateInput class="!h-9 w-[120px] !text-[12px]" bind:value={from} />
			<span class="text-[11px] text-muted">تا</span>
			<DateInput class="!h-9 w-[120px] !text-[12px]" bind:value={to} />
		{/if}
		{#if tab === 'sales'}
			<select class="input !h-9 w-[140px] !text-[12px]" bind:value={groupBy}>
				<option value="product">به تفکیک کالا</option>
				<option value="category">به تفکیک گروه</option>
				<option value="customer">به تفکیک مشتری</option>
				<option value="day">به تفکیک روز</option>
			</select>
		{/if}
	</div>

	{#if tab === 'profit' && profit}
		<div class="grid grid-cols-1 gap-3 xl:grid-cols-3">
			<div class="card card-pad xl:col-span-2">
				<h2 class="mb-3 text-[14px] font-bold text-ink">صورت سود و زیان</h2>
				<table class="table">
					<tbody>
						{#each profit.revenue as r}
							<tr><td>{r.name}</td><td class="!text-left num">{fmt(r.amount)}</td></tr>
						{/each}
						{#each profit.salesReturns as r}
							<tr><td class="text-muted">کسر: {r.name}</td><td class="!text-left num text-neg">({fmt(r.amount)})</td></tr>
						{/each}
						{#each profit.discounts as r}
							<tr><td class="text-muted">کسر: {r.name}</td><td class="!text-left num text-neg">({fmt(r.amount)})</td></tr>
						{/each}
						<tr class="bg-paper">
							<td class="font-medium text-ink">فروش خالص</td>
							<td class="!text-left num font-bold text-ink">{fmt(profit.netSales)}</td>
						</tr>
						{#each profit.cogs as r}
							<tr><td class="text-muted">کسر: {r.name}</td><td class="!text-left num text-neg">({fmt(r.amount)})</td></tr>
						{/each}
						<tr class="bg-[#f3fbf6]">
							<td class="font-medium text-pos">سود ناخالص</td>
							<td class="!text-left num font-bold text-pos">{fmt(profit.grossProfit)}</td>
						</tr>
						{#each profit.operating as r}
							<tr><td class="text-muted">کسر: {r.name}</td><td class="!text-left num text-neg">({fmt(r.amount)})</td></tr>
						{/each}
						{#each profit.otherIncome as r}
							<tr><td class="text-muted">{r.name}</td><td class="!text-left num text-pos">{fmt(r.amount)}</td></tr>
						{/each}
						<tr class="bg-ink">
							<td class="font-bold text-white">سود عملیاتی</td>
							<td class="!text-left num text-[15px] font-bold text-gold2">{fmt(profit.operatingProfit)}</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="space-y-3">
				<div class="card card-pad">
					<div class="text-[11.5px] text-muted">حاشیه سود ناخالص</div>
					<div class="num mt-1 text-[24px] text-ink">{fmt(profit.margin, 1)}٪</div>
				</div>
				<div class="card card-pad">
					<div class="text-[11.5px] text-muted">سود ناخالص</div>
					<div class="num mt-1 text-[20px] text-pos">{fmt(profit.grossProfit)}</div>
					<div class="text-[10px] text-muted2">{cur}</div>
				</div>
				<div class="rounded-xl border border-[#f0dcb8] bg-[#fffaf0] p-3 text-[11.5px] leading-6 text-[#8a5c10]">
					<b>توجه:</b> سود و زیان با موجودی نقد تفاوت دارد. فروش نسیه سود ایجاد می‌کند اما پولی وارد صندوق نمی‌شود.
					برای دیدن پول واقعی، تب «جریان نقدی» را ببینید.
				</div>
			</div>
		</div>
	{:else if tab === 'sales'}
		<div class="card overflow-hidden">
			<table class="table">
				<thead>
					<tr>
						<th>{groupBy === 'day' ? 'تاریخ' : groupBy === 'customer' ? 'مشتری' : groupBy === 'category' ? 'گروه' : 'کالا'}</th>
						<th class="!text-left">تعداد</th>
						<th class="!text-left">مبلغ فروش</th>
						<th class="!text-left">سود</th>
						<th class="!text-left">حاشیه</th>
					</tr>
				</thead>
				<tbody>
					{#each sales as r}
						<tr>
							<td class="text-ink">{groupBy === 'day' ? faDate(r.k) : r.label}</td>
							<td class="!text-left num">{fmt(r.qty)}</td>
							<td class="!text-left num text-ink">{fmt(r.total)}</td>
							<td class="!text-left num text-pos">{fmt(r.profit)}</td>
							<td class="!text-left text-[11.5px] text-muted">{r.total > 0 ? fmt((r.profit / r.total) * 100, 1) : 0}٪</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if !sales.length}<p class="py-10 text-center text-[12.5px] text-muted2">داده‌ای در این بازه نیست</p>{/if}
		</div>
	{:else if tab === 'stock' && stock}
		<div class="card overflow-hidden">
			<div class="flex items-center justify-between border-b border-line bg-paper/60 px-4 py-2.5">
				<span class="text-[12px] text-muted">ارزش کل موجودی انبار</span>
				<span class="num text-[15px] text-ink">{fmt(stock.totalValue)} {cur}</span>
			</div>
			<table class="table">
				<thead>
					<tr>
						<th>کالا</th>
						<th>گروه</th>
						<th class="!text-left">موجودی</th>
						<th class="!text-left">بهای تمام‌شده</th>
						<th class="!text-left">ارزش</th>
						<th class="!text-left">حاشیه هر واحد</th>
					</tr>
				</thead>
				<tbody>
					{#each stock.rows as p}
						<tr>
							<td class="text-ink">{p.name}</td>
							<td class="text-[11.5px] text-muted">{p.category_name || '—'}</td>
							<td class="!text-left num">{fmt(p.stock_qty)}</td>
							<td class="!text-left num">{fmt(p.avg_cost)}</td>
							<td class="!text-left num text-ink">{fmt(p.value)}</td>
							<td class="!text-left num text-pos">{fmt(p.margin)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if tab === 'cash' && cash}
		<div class="grid grid-cols-1 gap-3 xl:grid-cols-3">
			<div class="card card-pad xl:col-span-2">
				<h2 class="mb-3 text-[14px] font-bold text-ink">گردش روزانه وجه نقد</h2>
				<table class="table">
					<thead>
						<tr>
							<th>تاریخ</th>
							<th class="!text-left">ورود</th>
							<th class="!text-left">خروج</th>
							<th class="!text-left">خالص</th>
						</tr>
					</thead>
					<tbody>
						{#each cash.byDay as r}
							<tr>
								<td>{faDate(r.d)}</td>
								<td class="!text-left num text-pos">{fmt(r.inflow)}</td>
								<td class="!text-left num text-neg">{fmt(r.outflow)}</td>
								<td class="!text-left num text-ink">{fmt(r.inflow - r.outflow)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if !cash.byDay.length}<p class="py-8 text-center text-[12px] text-muted2">گردشی در این بازه نیست</p>{/if}
			</div>
			<div class="space-y-3">
				<div class="card card-pad">
					<div class="text-[11.5px] text-muted">موجودی ابتدای دوره</div>
					<div class="num mt-1 text-[18px] text-ink">{fmt(cash.opening)}</div>
				</div>
				<div class="card card-pad">
					<div class="text-[11.5px] text-muted">جمع ورودی</div>
					<div class="num mt-1 text-[18px] text-pos">{fmt(cash.inflow)}</div>
				</div>
				<div class="card card-pad">
					<div class="text-[11.5px] text-muted">جمع خروجی</div>
					<div class="num mt-1 text-[18px] text-neg">{fmt(cash.outflow)}</div>
				</div>
				<div class="ink-band p-4">
					<div class="relative z-10">
						<div class="text-[11px] text-white/50">موجودی پایان دوره</div>
						<div class="num mt-1 text-[20px] text-white">{fmt(cash.closing)}</div>
					</div>
				</div>
			</div>
		</div>
	{:else if tab === 'balance' && balance}
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<div class="card card-pad">
				<h2 class="mb-3 text-[14px] font-bold text-ink">دارایی‌ها</h2>
				<div class="num text-[24px] text-ink">{fmt(balance.assets)}</div>
				<p class="mt-1 text-[11px] text-muted">صندوق، بانک (شامل کارتخوان)، انبار، طلب از مشتریان، چک‌های دریافتنی</p>
			</div>
			<div class="card card-pad">
				<h2 class="mb-3 text-[14px] font-bold text-ink">بدهی و سرمایه</h2>
				<div class="num text-[24px] text-ink">{fmt(balance.liabilities + balance.total)}</div>
				<div class="mt-2 space-y-1 text-[11.5px] text-muted">
					<div class="flex justify-between"><span>بدهی‌ها</span><span class="num">{fmt(balance.liabilities)}</span></div>
					<div class="flex justify-between"><span>سرمایه</span><span class="num">{fmt(balance.equity)}</span></div>
					<div class="flex justify-between"><span>سود انباشته</span><span class="num">{fmt(balance.profit)}</span></div>
				</div>
			</div>
		</div>
	{/if}
</div>
