<script>
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NumInput from '$lib/components/NumInput.svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import PartyPicker from '$lib/components/PartyPicker.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, faDate, faDigits, DOC_LABELS, methodLabel, monthStart, todayISO } from '$lib/format.js';

	const PAGE_SIZE = 25;
	const TABS = [
		['sale', 'فروش'],
		['purchase', 'خرید'],
		['sale_return', 'برگشت از فروش'],
		['purchase_return', 'برگشت از خرید'],
		['cash', 'دریافت و پرداخت'],
		['journal', 'سند دستی'],
		['all', 'همه اسناد']
	];
	const CASH_TYPES = ['receipt', 'payment', 'expense', 'income', 'transfer'];

	let tab = $state('sale');
	let from = $state(monthStart());
	let to = $state(todayISO());
	let query = $state('');
	let page = $state(1);
	let list = $state({ rows: [], total: 0, pages: 1, pageSize: PAGE_SIZE });
	let loading = $state(true);

	let detail = $state(null);
	let detailOpen = $state(false);
	let voidOpen = $state(false);
	let voidReason = $state('');

	let voucherOpen = $state(false);
	let voucherType = $state('receipt');
	let voucherForm = $state({});

	const expenseAccounts = $derived(session.accounts.find((group) => group.key === 'expense')?.accounts || []);
	const incomeAccounts = $derived(
		(session.accounts.find((group) => group.key === 'income')?.accounts || []).filter(
			(account) => account.subgroup === 'other'
		)
	);

	const typesFor = (value) => (value === 'all' ? null : value === 'cash' ? CASH_TYPES : [value]);

	async function load() {
		loading = true;
		try {
			list = await api('docs.list', { type: typesFor(tab), from, to, q: query, page, pageSize: PAGE_SIZE });
		} finally {
			loading = false;
		}
	}

	onMount(load);

	// با تغییر هر فیلتر، از صفحهٔ اول شروع کن
	$effect(() => {
		tab;
		from;
		to;
		query;
		page = 1;
	});

	$effect(() => {
		tab;
		from;
		to;
		query;
		page;
		const timer = setTimeout(load, 200);
		return () => clearTimeout(timer);
	});

	function changeTab(value) {
		if (tab === value) return;
		tab = value;
		page = 1;
	}

	async function openDetail(row) {
		detail = await api('docs.get', { id: row.id });
		detailOpen = true;
	}

	async function confirmVoid() {
		try {
			await api('docs.void', { id: detail.id, reason: voidReason || 'ابطال توسط کاربر' });
			toast('سند ابطال شد و آثار مالی و انباری آن برگشت خورد');
			voidOpen = false;
			detailOpen = false;
			voidReason = '';
			await load();
		} catch (error) {
			toast(error.message, 'err');
		}
	}

	function openVoucher(type) {
		voucherType = type;
		voucherForm = {
			date: todayISO(),
			partyId: '',
			treasuryId: session.treasuries[0]?.id || '',
			amount: 0,
			accountId: type === 'expense' ? expenseAccounts[0]?.id : incomeAccounts[0]?.id,
			note: ''
		};
		voucherOpen = true;
	}

	async function saveVoucher() {
		if (!(Number(voucherForm.amount) > 0)) return toast('مبلغ را وارد کنید', 'warn');
		try {
			const method = {
				receipt: 'docs.receipt',
				payment: 'docs.payment',
				expense: 'docs.expense',
				income: 'docs.income'
			}[voucherType];
			await api(method, {
				date: voucherForm.date,
				amount: Number(voucherForm.amount),
				treasuryId: voucherForm.treasuryId,
				partyId: voucherForm.partyId || null,
				accountId: voucherForm.accountId,
				note: voucherForm.note
			});
			toast('سند ثبت شد');
			voucherOpen = false;
			await load();
		} catch (error) {
			toast(error.message, 'err');
		}
	}

	const VOUCHER_LABEL = { receipt: 'سند دریافت', payment: 'سند پرداخت', expense: 'ثبت هزینه', income: 'ثبت درآمد' };
</script>

<div class="mx-auto max-w-[1320px] px-6 py-5">
	<div class="card overflow-hidden">
		<div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
			<div class="flex flex-wrap gap-1">
				{#each TABS as [key, label] (key)}
					<button class="chip {tab === key ? 'active' : ''}" onclick={() => changeTab(key)}>{label}</button>
				{/each}
			</div>
			<div class="flex-1"></div>
			<DateInput class="!h-9 w-[120px] !text-[12px]" bind:value={from} />
			<span class="text-[11px] text-muted">تا</span>
			<DateInput class="!h-9 w-[120px] !text-[12px]" bind:value={to} />
			<div class="relative w-[180px]">
				<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" size={14} /></span>
				<input
					class="input !h-9 !pr-8 !text-[12px]"
					placeholder="شماره یا نام"
					bind:value={query}
					oninput={() => (page = 1)}
				/>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-1.5 border-b border-line bg-paper/50 px-4 py-2">
			<a href="/purchases" class="btn btn-soft btn-sm"><Icon name="box" size={13} /> فاکتور خرید</a>
			<a href="/returns" class="btn btn-soft btn-sm"><Icon name="refresh" size={13} /> برگشت</a>
			<button class="btn btn-soft btn-sm" onclick={() => openVoucher('receipt')}>
				<Icon name="download" size={13} /> دریافت
			</button>
			<button class="btn btn-soft btn-sm" onclick={() => openVoucher('payment')}>
				<Icon name="arrowUp" size={13} /> پرداخت
			</button>
			<button class="btn btn-soft btn-sm" onclick={() => openVoucher('expense')}>
				<Icon name="file" size={13} /> هزینه
			</button>
			<div class="flex-1"></div>
			<span class="text-[11px] text-muted2">{fmt(list.total)} سند در این بازه</span>
		</div>

		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						<th>شماره</th>
						<th>تاریخ</th>
						<th>نوع</th>
						<th>طرف حساب</th>
						<th class="!text-left">مبلغ</th>
						<th class="!text-left">پرداخت</th>
						<th class="!text-left">مانده</th>
						<th>وضعیت</th>
					</tr>
				</thead>
				<tbody>
					{#if loading}
						{#each [1, 2, 3, 4, 5] as row (row)}
							<tr><td colspan="8"><div class="skeleton h-6 w-full"></div></td></tr>
						{/each}
					{:else}
						{#each list.rows as row (row.id)}
							<tr class="cursor-pointer" onclick={() => openDetail(row)}>
								<td class="mono-num font-medium text-ink">{faDigits(row.number)}</td>
								<td class="whitespace-nowrap text-[12px]">{faDate(row.doc_date)}</td>
								<td>
									<span
										class="tag {['sale', 'receipt', 'income'].includes(row.type)
											? 'tag-pos'
											: ['purchase', 'payment', 'expense'].includes(row.type)
												? 'tag-neg'
												: 'tag-neutral'}"
									>
										{DOC_LABELS[row.type] || row.type}
									</span>
								</td>
								<td class="max-w-[180px] truncate text-[12.5px]">{row.party_label}</td>
								<td class="!text-left num text-ink">{fmt(row.total)}</td>
								<td class="!text-left num">{fmt(row.paid)}</td>
								<td class="!text-left num {row.due > 0 ? 'text-neg' : 'text-muted2'}">{fmt(row.due)}</td>
								<td>
									{#if row.status === 'voided'}
										<span class="tag tag-neg">ابطال شده</span>
									{:else}
										<span class="tag tag-neutral">ثبت شده</span>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
			{#if !loading && !list.rows.length}
				<p class="py-10 text-center text-[12.5px] text-muted2">سندی در این بازه یافت نشد</p>
			{/if}
		</div>

		<Pagination
			page={list.page}
			pages={list.pages}
			total={list.total}
			pageSize={PAGE_SIZE}
			onchange={(value) => (page = value)}
		/>
	</div>
</div>

<Modal
	open={detailOpen}
	title="سند {detail?.number || ''}"
	subtitle="{DOC_LABELS[detail?.type] || ''} · {detail ? faDate(detail.doc_date, 'long') : ''}"
	onclose={() => (detailOpen = false)}
	size="lg"
>
	{#if detail}
		<div class="mb-4 grid grid-cols-4 gap-2.5">
			<div class="rounded-lg bg-paper px-3 py-2">
				<div class="text-[10.5px] text-muted">طرف حساب</div>
				<div class="mt-0.5 truncate text-[12.5px] font-medium text-ink">
					{detail.party?.name || detail.party_name || 'مشتری متفرقه'}
				</div>
			</div>
			<div class="rounded-lg bg-paper px-3 py-2">
				<div class="text-[10.5px] text-muted">مبلغ کل</div>
				<div class="num mt-0.5 text-[13px] text-ink">{fmt(detail.total)}</div>
			</div>
			{#if detail.type === 'journal'}
				<div class="col-span-2 rounded-lg bg-paper px-3 py-2">
					<div class="text-[10.5px] text-muted">ردیف‌های سند</div>
					<div class="num mt-0.5 text-[13px] text-ink">{fmt(detail.journal?.length || 0)}</div>
				</div>
			{:else}
				<div class="rounded-lg bg-paper px-3 py-2">
					<div class="text-[10.5px] text-muted">پرداخت‌شده</div>
					<div class="num mt-0.5 text-[13px] text-pos">{fmt(detail.paid)}</div>
				</div>
				<div class="rounded-lg bg-paper px-3 py-2">
					<div class="text-[10.5px] text-muted">مانده</div>
					<div class="num mt-0.5 text-[13px] {detail.due > 0 ? 'text-neg' : 'text-muted'}">{fmt(detail.due)}</div>
				</div>
			{/if}
		</div>

		{#if detail.lines.length}
			<table class="table mb-4">
				<thead>
					<tr>
						<th>کالا</th>
						<th class="!text-left">تعداد</th>
						<th class="!text-left">قیمت واحد</th>
						<th class="!text-left">جمع</th>
						<th class="!text-left">بهای تمام‌شده</th>
					</tr>
				</thead>
				<tbody>
					{#each detail.lines as line (line.id)}
						<tr>
							<td class="text-ink">{line.product_name || line.description}</td>
							<td class="!text-left num">{fmt(line.qty)}</td>
							<td class="!text-left num">{fmt(line.unit_price)}</td>
							<td class="!text-left num text-ink">{fmt(line.line_total)}</td>
							<td class="!text-left num text-muted">{fmt(line.cost_total)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}

		{#if detail.payments.length}
			<div class="mb-4">
				<div class="mb-1.5 text-[11.5px] font-medium text-muted">روش‌های پرداخت</div>
				<div class="flex flex-wrap gap-1.5">
					{#each detail.payments as payment (payment.id)}
						<span class="tag tag-neutral">
							{methodLabel(payment.method)} · <b class="num">{fmt(payment.amount)}</b>
							{#if payment.treasury_name}<span class="text-muted2">({payment.treasury_name})</span>{/if}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		{#if detail.journal?.length}
			<div>
				<div class="mb-1.5 text-[11.5px] font-medium text-muted">
					{detail.type === 'journal' ? 'ردیف‌های سند' : 'سند حسابداری خودکار'}
				</div>
				<table class="table">
					<thead>
						<tr>
							<th>حساب</th>
							<th class="!text-left">بدهکار</th>
							<th class="!text-left">بستانکار</th>
						</tr>
					</thead>
					<tbody>
						{#each detail.journal as line (line.id)}
							<tr>
								<td class="text-[12px] text-ink2">{line.account_name}</td>
								<td class="!text-left num">{line.debit ? fmt(line.debit) : '—'}</td>
								<td class="!text-left num">{line.credit ? fmt(line.credit) : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if detail.status === 'voided'}
			<div class="mt-4 rounded-lg border border-[#f3c9c9] bg-[#fff5f5] px-3 py-2 text-[12px] text-[#a12c2c]">
				این سند ابطال شده است. دلیل: {detail.void_reason || '—'}
			</div>
		{/if}
	{/if}

	{#snippet footer()}
		{#if detail && detail.status === 'posted' && detail.type !== 'opening'}
			<button class="btn btn-danger" onclick={() => (voidOpen = true)}>
				<Icon name="trash" size={14} /> ابطال سند
			</button>
		{/if}
		<button class="btn btn-ghost" onclick={() => (detailOpen = false)}>بستن</button>
	{/snippet}
</Modal>

<Modal
	open={voidOpen}
	title="ابطال سند"
	subtitle="آثار مالی و انباری سند به‌صورت خودکار برگشت می‌خورد"
	onclose={() => (voidOpen = false)}
	size="sm"
>
	<label class="label" for="void-reason">دلیل ابطال</label>
	<textarea
		id="void-reason"
		class="input !h-20 resize-none py-2"
		bind:value={voidReason}
		placeholder="مثلاً اشتباه در ثبت مبلغ"
	></textarea>
	<p class="mt-2 text-[11px] leading-5 text-muted">
		سند حذف نمی‌شود؛ یک سند معکوس ثبت و وضعیت آن «ابطال‌شده» می‌شود تا سابقه عملیات باقی بماند.
	</p>

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (voidOpen = false)}>انصراف</button>
		<button class="btn btn-danger" onclick={confirmVoid}>تأیید ابطال</button>
	{/snippet}
</Modal>

<Modal open={voucherOpen} title={VOUCHER_LABEL[voucherType]} onclose={() => (voucherOpen = false)} size="md">
	<div class="grid grid-cols-2 gap-3">
		<div>
			<label class="label" for="v-date">تاریخ</label>
			<DateInput id="v-date" bind:value={voucherForm.date} />
		</div>
		<div>
			<label class="label" for="v-amount">مبلغ</label>
			<NumInput id="v-amount" class="input" bind:value={voucherForm.amount} />
		</div>

		{#if voucherType === 'expense' || voucherType === 'income'}
			<div class="col-span-2">
				<label class="label" for="v-account">{voucherType === 'expense' ? 'نوع هزینه' : 'نوع درآمد'}</label>
				<select id="v-account" class="input" bind:value={voucherForm.accountId}>
					{#each voucherType === 'expense' ? expenseAccounts : incomeAccounts as account (account.id)}
						<option value={account.id}>{account.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if voucherType === 'receipt' || voucherType === 'payment'}
			<div class="col-span-2">
				<label class="label" for="v-party">
					{voucherType === 'receipt' ? 'دریافت از' : 'پرداخت به'}
				</label>
				<PartyPicker id="v-party" bind:value={voucherForm.partyId} placeholder="— بدون طرف حساب —" />
			</div>
		{/if}

		<div class="col-span-2">
			<label class="label" for="v-treasury">حساب خزانه</label>
			<select id="v-treasury" class="input" bind:value={voucherForm.treasuryId}>
				{#each session.treasuries as treasury (treasury.id)}
					<option value={treasury.id}>{treasury.name}</option>
				{/each}
			</select>
		</div>

		<div class="col-span-2">
			<label class="label" for="v-note">توضیحات</label>
			<input id="v-note" class="input" bind:value={voucherForm.note} />
		</div>
	</div>

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (voucherOpen = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={saveVoucher}>ثبت سند</button>
	{/snippet}
</Modal>
