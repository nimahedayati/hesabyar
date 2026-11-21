<script>
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { fmt, compact, faDate, methodLabel, addDays, todayISO } from '$lib/format.js';

	let d = $state(null);
	let loading = $state(true);

	onMount(async () => {
		try {
			d = await api('reports.dashboard');
		} finally {
			loading = false;
		}
	});

	const cur = $derived(session.settings?.currency || 'تومان');

	// پر کردن روزهای بدون فروش برای نمودار
	const chart = $derived.by(() => {
		if (!d) return [];
		const map = new Map(d.series.map((s) => [s.d, s]));
		const out = [];
		const t = todayISO();
		for (let i = 13; i >= 0; i--) {
			const day = addDays(t, -i);
			const s = map.get(day);
			out.push({ day, total: s?.total || 0, profit: s?.profit || 0, count: s?.c || 0 });
		}
		return out;
	});

	const maxV = $derived(Math.max(...chart.map((c) => c.total), 1));

	const kpis = $derived(
		d
			? [
					{
						label: 'فروش امروز',
						value: d.salesToday,
						icon: 'cart',
						sub: `${fmt(d.invoiceCount)} فاکتور`,
						tone: 'ink'
					},
					{
						label: 'سود ناخالص امروز',
						value: d.profitToday,
						icon: 'trending',
						sub: d.salesToday > 0 ? `حاشیه ${fmt((d.profitToday / d.salesToday) * 100, 1)}٪` : 'بدون فروش',
						tone: 'pos'
					},
					{
						label: 'دریافت‌های امروز',
						value: d.receiptsToday,
						icon: 'download',
						sub: 'وجه نقد و بانک',
						tone: 'ink'
					},
					{
						label: 'خرید امروز',
						value: d.purchaseToday,
						icon: 'box',
						sub: 'فاکتورهای خرید',
						tone: 'ink'
					}
				]
			: []
	);

	const methodTotal = $derived(d ? d.methods.reduce((s, m) => s + m.amount, 0) : 0);
	const methodColors = {
		cash: '#1f8a5b',
		terminal: '#b98e1d',
		card_to_card: '#476054',
		bank: '#3c4a5e',
		check: '#8a6a12',
		credit: '#d43f3f'
	};
</script>

<div class="mx-auto max-w-[1320px] px-6 py-5">
	<!-- ردیف اول: شاخص‌ها -->
	<div class="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
		{#each loading ? [1, 2, 3, 4] : kpis as k, i}
			<div class="card card-pad card-hover rise" style="animation-delay:{i * 40}ms">
				{#if loading}
					<div class="skeleton mb-3 h-3 w-20"></div>
					<div class="skeleton mb-2 h-6 w-32"></div>
					<div class="skeleton h-3 w-16"></div>
				{:else}
					<div class="mb-2 flex items-center justify-between">
						<span class="text-[12px] text-muted">{k.label}</span>
						<span
							class="grid h-7 w-7 place-items-center rounded-lg"
							style="background:{k.tone === 'pos' ? 'rgba(31,138,91,.09)' : '#eef1f5'};color:{k.tone === 'pos'
								? '#1f8a5b'
								: '#78849a'}"
						>
							<Icon name={k.icon} size={14} />
						</span>
					</div>
					<div class="num text-[24px] leading-none text-ink">{fmt(k.value)}</div>
					<div class="mt-2 flex items-center gap-1.5">
						<span class="text-[10.5px] text-muted">{k.sub}</span>
						<span class="text-[10.5px] text-muted2">· {cur}</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-3">
		<!-- نمودار فروش -->
		<div class="card card-pad xl:col-span-2">
			<div class="mb-4 flex items-start justify-between">
				<div>
					<h2 class="text-[14px] font-bold text-ink">روند فروش دو هفته گذشته</h2>
					<p class="mt-0.5 text-[11.5px] text-muted">
						مجموع {fmt(chart.reduce((s, c) => s + c.total, 0))} {cur}
					</p>
				</div>
				<div class="flex items-center gap-3 text-[11px] text-muted">
					<span class="flex items-center gap-1.5"><i class="h-2 w-2 rounded-sm bg-ink"></i> فروش</span>
					<span class="flex items-center gap-1.5"><i class="h-2 w-2 rounded-sm bg-gold2"></i> سود</span>
				</div>
			</div>

			{#if loading}
				<div class="skeleton h-[168px] w-full"></div>
			{:else}
				<div class="flex h-[172px] items-end gap-[7px]">
					{#each chart as c}
						<div class="group relative flex h-full flex-1 flex-col justify-end">
							<div class="relative flex w-full flex-1 items-end">
								<div
									class="relative w-full overflow-hidden rounded-t-[5px] bg-paper2 transition-all duration-300 group-hover:bg-[#e7ebf1]"
									style="height:{Math.max((c.total / maxV) * 100, 1.5)}%"
								>
									<div
										class="absolute bottom-0 left-0 right-0 bg-ink transition-all duration-300"
										style="height:{c.total > 0 ? Math.max((c.profit / c.total) * 100, 0) : 0}%"
									></div>
								</div>
							</div>
							<div class="mt-1.5 h-[13px] text-center text-[9px] text-muted2">{faDate(c.day, 'day')}</div>
							<div
								class="pointer-events-none absolute -top-2 right-1/2 z-10 hidden translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[10px] text-white shadow-lg group-hover:block"
							>
								{fmt(c.total)} {cur}
								<div class="text-[9px] text-white/60">{fmt(c.count)} فاکتور</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- نقدینگی -->
		<div class="ink-band p-5">
			<div class="relative z-10">
				<div class="mb-1 flex items-center gap-1.5 text-[11.5px] text-white/55">
					<Icon name="wallet" size={13} />
					موجودی نقد و بانک
				</div>
				<div class="num text-[27px] leading-tight text-white">
					{fmt(loading ? 0 : d.liquidity)}
				</div>
				<div class="text-[11px] text-white/45">{cur} · به‌روزرسانی لحظه‌ای</div>

				<div class="mt-5 space-y-2.5">
					{#each loading ? [] : [['صندوق', d.cash, 'wallet'], ['بانک', d.bank, 'bank'], ['کارتخوان', d.terminal, 'creditCard']] as [label, val, ic]}
						<div class="flex items-center justify-between rounded-lg bg-white/[0.045] px-3 py-2">
							<span class="flex items-center gap-2 text-[12px] text-white/65">
								<Icon name={ic} size={13} />
								{label}
							</span>
							<span class="num text-[13px] text-white/90">{fmt(val)}</span>
						</div>
					{/each}
				</div>

				<div class="mt-4 grid grid-cols-2 gap-2.5 border-t border-white/10 pt-4">
					<div>
						<div class="text-[10.5px] text-white/45">طلب از مشتریان</div>
						<div class="num mt-0.5 text-[14px] text-gold2">{fmt(loading ? 0 : d.receivable)}</div>
					</div>
					<div>
						<div class="text-[10.5px] text-white/45">بدهی به تأمین‌کنندگان</div>
						<div class="num mt-0.5 text-[14px] text-white/85">{fmt(loading ? 0 : d.payable)}</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- ردیف سوم -->
	<div class="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
		<!-- روش‌های پرداخت -->
		<div class="card card-pad">
			<h2 class="mb-3.5 text-[14px] font-bold text-ink">ترکیب روش‌های پرداخت</h2>
			{#if loading}
				<div class="skeleton h-28"></div>
			{:else if !d.methods.length}
				<p class="py-6 text-center text-[12px] text-muted2">در این ماه فروشی ثبت نشده</p>
			{:else}
				<div class="mb-3 flex h-2.5 overflow-hidden rounded-full bg-paper2">
					{#each d.methods as m}
						<div
							style="width:{(m.amount / methodTotal) * 100}%;background:{methodColors[m.method] || '#98a2b3'}"
							title="{methodLabel(m.method)}: {fmt(m.amount)}"
						></div>
					{/each}
				</div>
				<div class="space-y-2">
					{#each d.methods as m}
						<div class="flex items-center justify-between text-[12px]">
							<span class="flex items-center gap-2 text-ink2">
								<i class="h-2 w-2 rounded-full" style="background:{methodColors[m.method] || '#98a2b3'}"></i>
								{methodLabel(m.method)}
							</span>
							<span class="flex items-center gap-2">
								<span class="num text-ink">{fmt(m.amount)}</span>
								<span class="text-[10.5px] text-muted2">{fmt((m.amount / methodTotal) * 100, 0)}٪</span>
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- کالاهای پرفروش -->
		<div class="card card-pad">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-[14px] font-bold text-ink">پرفروش‌های این ماه</h2>
				<a href="/reports" class="text-[11px] text-goldink hover:underline">گزارش کامل</a>
			</div>
			{#if loading}
				<div class="skeleton h-28"></div>
			{:else if !d.topProducts.length}
				<p class="py-6 text-center text-[12px] text-muted2">داده‌ای موجود نیست</p>
			{:else}
				<div class="space-y-2.5">
					{#each d.topProducts as p, i}
						<div class="flex items-center gap-2.5">
							<span class="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-paper2 text-[10px] font-bold text-muted"
								>{fmt(i + 1)}</span
							>
							<div class="min-w-0 flex-1">
								<div class="truncate text-[12.5px] text-ink">{p.name}</div>
								<div class="text-[10.5px] text-muted2">{fmt(p.qty)} عدد فروش</div>
							</div>
							<span class="num shrink-0 text-[12.5px] text-ink">{compact(p.total)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- هشدارها -->
		<div class="card card-pad">
			<h2 class="mb-3 text-[14px] font-bold text-ink">نیازمند توجه</h2>
			{#if loading}
				<div class="skeleton h-28"></div>
			{:else}
				<div class="space-y-2">
					{#each d.lowStock as p}
						<a
							href="/products"
							class="flex items-center justify-between rounded-lg border border-line bg-paper/60 px-2.5 py-2 transition hover:border-line2"
						>
							<span class="flex min-w-0 items-center gap-2">
								<span class="text-warn"><Icon name="alert" size={13} /></span>
								<span class="truncate text-[12px] text-ink2">{p.name}</span>
							</span>
							<span class="shrink-0 text-[10.5px] text-neg">{fmt(p.stock_qty)} {p.unit}</span>
						</a>
					{/each}
					{#each d.dueChecks as c}
						<a
							href="/treasury"
							class="flex items-center justify-between rounded-lg border border-line bg-paper/60 px-2.5 py-2 transition hover:border-line2"
						>
							<span class="flex min-w-0 items-center gap-2">
								<span class="text-goldink"><Icon name="file" size={13} /></span>
								<span class="truncate text-[12px] text-ink2">چک {c.party_name || '—'}</span>
							</span>
							<span class="shrink-0 text-[10.5px] text-muted">{faDate(c.due_date, 'month')}</span>
						</a>
					{/each}
					{#if !d.lowStock.length && !d.dueChecks.length}
						<div class="flex flex-col items-center gap-2 py-6 text-center">
							<span class="text-pos"><Icon name="checkCircle" size={22} /></span>
							<span class="text-[12px] text-muted">همه‌چیز مرتب است</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
