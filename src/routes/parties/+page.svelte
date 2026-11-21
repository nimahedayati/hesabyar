<script>
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NumInput from '$lib/components/NumInput.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, faDate, faDigits } from '$lib/format.js';

	const PAGE_SIZE = 25;

	let rows = $state([]);
	let total = $state(0);
	let page = $state(1);
	let pages = $state(1);
	let loading = $state(true);
	let tab = $state('all');
	let q = $state('');
	let summary = $state({ debtors: 0, creditors: 0 });
	let editOpen = $state(false);
	let form = $state({});
	let ledgerOpen = $state(false);
	let ledger = $state(null);

	const KIND = {
		customer: { label: 'مشتری', cls: 'tag-pos' },
		supplier: { label: 'تأمین‌کننده', cls: 'tag-gold' },
		both: { label: 'مشتری و تأمین‌کننده', cls: 'tag-neutral' }
	};

	const cur = $derived(session.settings?.currency || 'تومان');

	async function load() {
		loading = true;
		try {
			const result = await api('parties.list', {
				kind: tab === 'all' ? null : tab,
				q,
				limit: PAGE_SIZE,
				offset: (page - 1) * PAGE_SIZE
			});
			rows = result.rows;
			total = result.total;
			pages = Math.max(Math.ceil(result.total / PAGE_SIZE), 1);
			summary = await api('parties.summary');
		} catch (error) {
			toast(error.message, 'err');
		} finally {
			loading = false;
		}
	}

	function reload() {
		page = 1;
		load();
	}

	onMount(load);
	$effect(() => {
		tab;
		q;
		const timer = setTimeout(reload, 160);
		return () => clearTimeout(timer);
	});

	function openNew() {
		form = { name: '', kind: 'customer', phone: '', address: '', creditLimit: 0, note: '' };
		editOpen = true;
	}

	function openEdit(party) {
		form = {
			id: party.id,
			name: party.name,
			kind: party.kind,
			phone: party.phone || '',
			address: party.address || '',
			creditLimit: party.credit_limit,
			note: party.note || ''
		};
		editOpen = true;
	}

	async function save() {
		try {
			if (!form.name?.trim()) return toast('نام شخص را وارد کنید', 'warn');
			await api('parties.save', form);
			toast('اطلاعات شخص ذخیره شد');
			editOpen = false;
			await load();
		} catch (error) {
			toast(error.message, 'err');
		}
	}

	async function openLedger(party) {
		try {
			ledger = await api('parties.ledger', { id: party.id });
			ledgerOpen = true;
		} catch (error) {
			toast(error.message, 'err');
		}
	}
</script>

<div class="mx-auto max-w-[1320px] px-6 py-5">
	<div class="mb-4 grid grid-cols-2 gap-3">
		<div class="card card-pad">
			<div class="text-[11.5px] text-muted">جمع طلب از مشتریان (بدهکاران)</div>
			<div class="num mt-1.5 text-[21px] text-pos">{fmt(summary.debtors)} <span class="text-[11px] text-muted">{cur}</span></div>
		</div>
		<div class="card card-pad">
			<div class="text-[11.5px] text-muted">جمع بدهی به تأمین‌کنندگان (بستانکاران)</div>
			<div class="num mt-1.5 text-[21px] text-neg">{fmt(summary.creditors)} <span class="text-[11px] text-muted">{cur}</span></div>
		</div>
	</div>

	<div class="card overflow-hidden">
		<div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
			<div class="flex gap-1">
				{#each [['all', 'همه'], ['customer', 'مشتریان'], ['supplier', 'تأمین‌کنندگان']] as [key, label]}
					<button class="chip {tab === key ? 'active' : ''}" onclick={() => (tab = key)}>{label}</button>
				{/each}
			</div>
			<div class="relative w-[240px]">
				<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" size={15} /></span>
				<input class="input !h-9 !pr-9 !text-[12.5px]" placeholder="جست‌وجوی نام یا تلفن" bind:value={q} />
			</div>
			<div class="flex-1"></div>
			<span class="text-[11.5px] text-muted">{fmt(total)} شخص</span>
			<button class="btn btn-primary btn-sm" onclick={openNew}>
				<Icon name="plus" size={14} />
				شخص جدید
			</button>
		</div>

		<table class="table">
			<thead>
				<tr>
					<th>نام</th>
					<th>نوع</th>
					<th>تلفن</th>
					<th class="!text-left">مانده حساب</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					{#each [1, 2, 3, 4, 5] as _row}
						<tr><td colspan="5"><div class="skeleton h-6 w-full"></div></td></tr>
					{/each}
				{:else}
					{#each rows as party (party.id)}
						<tr>
							<td>
								<div class="font-medium text-ink">{party.name}</div>
								{#if party.address}<div class="text-[10.5px] text-muted2">{party.address}</div>{/if}
							</td>
							<td><span class="tag {KIND[party.kind]?.cls}">{KIND[party.kind]?.label}</span></td>
							<td class="mono-num text-[12px]">{faDigits(party.phone) || '—'}</td>
							<td class="!text-left">
								{#if Math.abs(party.balance) < 1}
									<span class="text-[11.5px] text-muted2">تسویه</span>
								{:else if party.balance > 0}
									<span class="num text-pos">{fmt(party.balance)}</span>
									<span class="text-[10px] text-muted"> بدهکار</span>
								{:else}
									<span class="num text-neg">{fmt(-party.balance)}</span>
									<span class="text-[10px] text-muted"> بستانکار</span>
								{/if}
							</td>
							<td class="!text-left">
								<div class="flex items-center gap-1">
									<button class="btn btn-soft btn-sm" onclick={() => openLedger(party)}>
										<Icon name="receipt" size={13} /> گردش
									</button>
									<button class="btn btn-soft btn-sm !px-2" onclick={() => openEdit(party)}>
										<Icon name="edit" size={13} />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
		{#if !loading && !rows.length}
			<p class="py-10 text-center text-[12.5px] text-muted2">شخصی یافت نشد</p>
		{/if}

		<Pagination {page} {pages} {total} pageSize={PAGE_SIZE} onchange={(target) => { page = target; load(); }} />
	</div>
</div>

<Modal open={editOpen} title={form.id ? 'ویرایش شخص' : 'شخص جدید'} onclose={() => (editOpen = false)} size="md">
	<div class="grid grid-cols-2 gap-3">
		<div class="col-span-2">
			<label class="label" for="pa-name">نام / نام شرکت</label>
			<input id="pa-name" class="input" bind:value={form.name} />
		</div>
		<div>
			<label class="label" for="pa-kind">نوع</label>
			<select id="pa-kind" class="input" bind:value={form.kind}>
				<option value="customer">مشتری</option>
				<option value="supplier">تأمین‌کننده</option>
				<option value="both">مشتری و تأمین‌کننده</option>
			</select>
		</div>
		<div>
			<label class="label" for="pa-phone">شماره تماس</label>
			<input id="pa-phone" class="input" bind:value={form.phone} />
		</div>
		<div class="col-span-2">
			<label class="label" for="pa-addr">آدرس</label>
			<input id="pa-addr" class="input" bind:value={form.address} />
		</div>
		<div>
			<label class="label" for="pa-credit">سقف اعتبار</label>
			<NumInput id="pa-credit" class="input" bind:value={form.creditLimit} />
		</div>
		<div>
			<label class="label" for="pa-note">توضیحات</label>
			<input id="pa-note" class="input" bind:value={form.note} />
		</div>
	</div>

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (editOpen = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={save}>ذخیره</button>
	{/snippet}
</Modal>

<Modal open={ledgerOpen} title="گردش حساب {ledger?.party?.name || ''}" onclose={() => (ledgerOpen = false)} size="lg">
	{#if ledger}
		<div class="mb-3 flex items-center justify-between rounded-lg bg-paper px-3 py-2.5 text-[12px]">
			<span class="text-muted">مانده اولیه دوره</span>
			<span class="num text-ink">{fmt(ledger.opening)}</span>
		</div>
		<table class="table">
			<thead>
				<tr>
					<th>تاریخ</th>
					<th>شرح</th>
					<th class="!text-left">بدهکار</th>
					<th class="!text-left">بستانکار</th>
					<th class="!text-left">مانده</th>
				</tr>
			</thead>
			<tbody>
				{#each ledger.rows as row}
					<tr>
						<td class="whitespace-nowrap">{faDate(row.entry_date)}</td>
						<td class="text-[12px]">
							{row.description}
							{#if row.doc_number}<span class="mr-1 text-[10.5px] text-muted2">({faDigits(row.doc_number)})</span>{/if}
						</td>
						<td class="!text-left num">{row.debit ? fmt(row.debit) : '—'}</td>
						<td class="!text-left num">{row.credit ? fmt(row.credit) : '—'}</td>
						<td class="!text-left num text-ink">{fmt(row.balance)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if !ledger.rows.length}<p class="py-8 text-center text-[12px] text-muted2">گردشی ثبت نشده</p>{/if}
		<div class="mt-3 flex items-center justify-between rounded-lg bg-ink px-3 py-2.5 text-[12px] text-white">
			<span class="text-white/60">مانده پایان دوره</span>
			<span class="num">{fmt(ledger.closing)}</span>
		</div>
	{/if}
</Modal>
