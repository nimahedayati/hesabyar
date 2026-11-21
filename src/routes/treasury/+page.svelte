<script>
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NumInput from '$lib/components/NumInput.svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import PartyPicker from '$lib/components/PartyPicker.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, faDate, faDigits, CHECK_STATUS, todayISO } from '$lib/format.js';

	let checks = $state([]);
	let tab = $state('accounts');
	let transferOpen = $state(false);
	let checkOpen = $state(false);
	let settleOpen = $state(false);
	let active = $state(null);
	let form = $state({});
	let cform = $state({});
	let sform = $state({});

	const cur = $derived(session.settings?.currency || 'تومان');
	const treasuries = $derived(session.treasuries || []);
	const total = $derived(treasuries.reduce((s, t) => s + t.balance, 0));
	const KIND_LABEL = { cash: 'صندوق', bank: 'بانک', terminal: 'کارتخوان' };

	async function load() {
		checks = await api('checks.list');
		session.treasuries = await api('treasuries.list');
	}
	onMount(load);

	function openTransfer() {
		form = { fromTreasuryId: treasuries[0]?.id, toTreasuryId: treasuries[1]?.id, amount: 0, date: todayISO(), note: '' };
		transferOpen = true;
	}

	async function doTransfer() {
		try {
			await api('docs.transfer', { ...form, amount: Number(form.amount) });
			toast('انتقال وجه ثبت شد');
			transferOpen = false;
			await load();
		} catch (e) {
			toast(e.message, 'err');
		}
	}

	function openCheck() {
		cform = { direction: 'received', partyId: '', serial: '', amount: 0, dueDate: todayISO(), bankName: '', note: '' };
		checkOpen = true;
	}

	async function saveCheck() {
		try {
			await api('docs.check', { ...cform, amount: Number(cform.amount) });
			toast('چک ثبت شد');
			checkOpen = false;
			await load();
		} catch (e) {
			toast(e.message, 'err');
		}
	}

	function openSettle(c) {
		active = c;
		sform = {
			action: c.direction === 'received' ? 'collected' : 'cleared',
			treasuryId: treasuries.find((t) => t.kind === 'bank')?.id || treasuries[0]?.id,
			partyId: ''
		};
		settleOpen = true;
	}

	async function doSettle() {
		try {
			await api('docs.settleCheck', { id: active.id, ...sform });
			toast('وضعیت چک به‌روزرسانی شد');
			settleOpen = false;
			await load();
		} catch (e) {
			toast(e.message, 'err');
		}
	}
</script>

<div class="mx-auto max-w-[1320px] px-6 py-5">
	<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
		{#each treasuries as t (t.id)}
			<div class="card card-pad">
				<div class="flex items-center justify-between">
					<span class="flex items-center gap-2 text-[12px] text-muted">
						<Icon name={t.kind === 'cash' ? 'wallet' : t.kind === 'bank' ? 'bank' : 'creditCard'} size={14} />
						{KIND_LABEL[t.kind]}
					</span>
					<span class="tag tag-neutral">{t.bank_name || faDigits(t.terminal_no) || '—'}</span>
				</div>
				<div class="mt-2 truncate text-[13px] font-medium text-ink">{t.name}</div>
				<div class="num mt-1 text-[20px] text-ink">{fmt(t.balance)}</div>
			</div>
		{/each}
	</div>

	<div class="mb-3 flex items-center justify-between">
		<div class="flex gap-1">
			<button class="chip {tab === 'accounts' ? 'active' : ''}" onclick={() => (tab = 'accounts')}>گردش حساب‌ها</button>
			<button class="chip {tab === 'checks' ? 'active' : ''}" onclick={() => (tab = 'checks')}>چک‌ها</button>
		</div>
		<div class="flex gap-1.5">
			<button class="btn btn-soft btn-sm" onclick={openTransfer}><Icon name="arrows" size={13} /> انتقال وجه</button>
			<button class="btn btn-primary btn-sm" onclick={openCheck}><Icon name="plus" size={13} /> ثبت چک</button>
		</div>
	</div>

	{#if tab === 'accounts'}
		<div class="card overflow-hidden">
			<div class="flex items-center justify-between border-b border-line bg-paper/60 px-4 py-2.5">
				<span class="text-[12px] text-muted">جمع موجودی نقد و بانک</span>
				<span class="num text-[15px] text-ink">{fmt(total)} {cur}</span>
			</div>
			<table class="table">
				<thead>
					<tr>
						<th>حساب</th>
						<th>نوع</th>
						<th>شناسه</th>
						<th class="!text-left">موجودی</th>
					</tr>
				</thead>
				<tbody>
					{#each treasuries as t (t.id)}
						<tr>
							<td class="font-medium text-ink">{t.name}</td>
							<td><span class="tag tag-neutral">{KIND_LABEL[t.kind]}</span></td>
							<td class="mono-num text-[11.5px] text-muted">{faDigits(t.account_no || t.terminal_no) || '—'}</td>
							<td class="!text-left num text-ink">{fmt(t.balance)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="card overflow-hidden">
			<table class="table">
				<thead>
					<tr>
						<th>جهت</th>
						<th>طرف حساب</th>
						<th>شماره چک</th>
						<th>سررسید</th>
						<th class="!text-left">مبلغ</th>
						<th>وضعیت</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each checks as c (c.id)}
						<tr>
							<td>
								<span class="tag {c.direction === 'received' ? 'tag-pos' : 'tag-neg'}">
									{c.direction === 'received' ? 'دریافتی' : 'پرداختی'}
								</span>
							</td>
							<td class="text-ink">{c.party_name || '—'}</td>
							<td class="mono-num text-[12px]">{c.serial || '—'}</td>
							<td class="whitespace-nowrap text-[12px]">{faDate(c.due_date)}</td>
							<td class="!text-left num text-ink">{fmt(c.amount)}</td>
							<td><span class="tag {CHECK_STATUS[c.status]?.cls}">{CHECK_STATUS[c.status]?.label}</span></td>
							<td class="!text-left">
								{#if ['in_hand', 'endorsed'].includes(c.status)}
									<button class="btn btn-soft btn-sm" onclick={() => openSettle(c)}>تغییر وضعیت</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if !checks.length}<p class="py-10 text-center text-[12.5px] text-muted2">چکی ثبت نشده است</p>{/if}
		</div>
	{/if}
</div>

<Modal open={transferOpen} title="انتقال وجه بین حساب‌ها" subtitle="انتقال، درآمد یا هزینه محسوب نمی‌شود" onclose={() => (transferOpen = false)} size="sm">
	<div class="space-y-3">
		<div>
			<label class="label" for="t-from">از حساب</label>
			<select id="t-from" class="input" bind:value={form.fromTreasuryId}>
				{#each treasuries as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
			</select>
		</div>
		<div>
			<label class="label" for="t-to">به حساب</label>
			<select id="t-to" class="input" bind:value={form.toTreasuryId}>
				{#each treasuries as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
			</select>
		</div>
		<div>
			<label class="label" for="t-amt">مبلغ</label>
			<NumInput id="t-amt" class="input" bind:value={form.amount} />
		</div>
		<div>
			<label class="label" for="t-note">توضیحات</label>
			<input id="t-note" class="input" bind:value={form.note} />
		</div>
	</div>
	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (transferOpen = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={doTransfer}>ثبت انتقال</button>
	{/snippet}
</Modal>

<Modal open={checkOpen} title="ثبت چک" onclose={() => (checkOpen = false)} size="md">
	<div class="grid grid-cols-2 gap-3">
		<div class="col-span-2">
			<label class="label" for="c-dir">نوع چک</label>
			<select id="c-dir" class="input" bind:value={cform.direction}>
				<option value="received">چک دریافتی از مشتری</option>
				<option value="paid">چک پرداختی به تأمین‌کننده</option>
			</select>
		</div>
		<div class="col-span-2">
			<label class="label" for="c-party">طرف حساب</label>
			<PartyPicker id="c-party" bind:value={cform.partyId} placeholder="جست‌وجوی نام شخص…" />
		</div>
		<div>
			<label class="label" for="c-serial">شماره چک</label>
			<input id="c-serial" class="input" bind:value={cform.serial} />
		</div>
		<div>
			<label class="label" for="c-amt">مبلغ</label>
			<NumInput id="c-amt" class="input" bind:value={cform.amount} />
		</div>
		<div>
			<label class="label" for="c-due">تاریخ سررسید</label>
			<DateInput id="c-due" bind:value={cform.dueDate} />
		</div>
		<div>
			<label class="label" for="c-bank">بانک</label>
			<input id="c-bank" class="input" bind:value={cform.bankName} />
		</div>
	</div>
	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (checkOpen = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={saveCheck}>ثبت چک</button>
	{/snippet}
</Modal>

<Modal open={settleOpen} title="تغییر وضعیت چک" onclose={() => (settleOpen = false)} size="sm">
	<div class="space-y-3">
		<div class="rounded-lg bg-paper px-3 py-2 text-[12px]">
			<div class="flex justify-between"><span class="text-muted">طرف حساب</span><span class="text-ink">{active?.party_name}</span></div>
			<div class="mt-1 flex justify-between"><span class="text-muted">مبلغ</span><span class="num text-ink">{fmt(active?.amount || 0)}</span></div>
		</div>
		{#if active?.direction === 'received'}
			<div>
				<label class="label" for="s-act">عملیات</label>
				<select id="s-act" class="input" bind:value={sform.action}>
					<option value="collected">وصول شد (واریز به بانک)</option>
					<option value="endorsed">واگذار به شخص دیگر</option>
					<option value="returned">برگشت خورد</option>
				</select>
			</div>
			{#if sform.action === 'collected'}
				<div>
					<label class="label" for="s-tr">حساب بانکی</label>
					<select id="s-tr" class="input" bind:value={sform.treasuryId}>
						{#each treasuries.filter((t) => t.kind !== 'cash') as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
					</select>
				</div>
			{:else if sform.action === 'endorsed'}
				<div>
					<label class="label" for="s-p">شخص واگذارگیرنده</label>
					<PartyPicker id="s-p" bind:value={sform.partyId} placeholder="جست‌وجوی نام شخص…" />
				</div>
			{/if}
		{:else}
			<div>
				<label class="label" for="s-act">عملیات</label>
				<select id="s-act" class="input" bind:value={sform.action}>
					<option value="cleared">تسویه شد (برداشت از بانک)</option>
					<option value="cancelled">ابطال چک</option>
				</select>
			</div>
			{#if sform.action === 'cleared'}
				<div>
					<label class="label" for="s-tr">حساب بانکی</label>
					<select id="s-tr" class="input" bind:value={sform.treasuryId}>
						{#each treasuries.filter((t) => t.kind !== 'cash') as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
					</select>
				</div>
			{/if}
		{/if}
	</div>
	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (settleOpen = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={doSettle}>تأیید</button>
	{/snippet}
</Modal>
