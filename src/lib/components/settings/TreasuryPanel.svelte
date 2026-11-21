<script>
	import Icon from '../Icon.svelte';
	import NumInput from '../NumInput.svelte';
	import Modal from '../Modal.svelte';
	import { api } from '$lib/api.js';
	import { session, refreshTreasuries } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, faDigits } from '$lib/format.js';

	let { kind = 'bank' } = $props();

	const META = {
		cash: { title: 'صندوق‌ها', add: 'صندوق جدید', icon: 'wallet' },
		bank: { title: 'حساب‌های بانکی', add: 'حساب بانکی جدید', icon: 'bank' },
		terminal: { title: 'کارتخوان‌ها', add: 'کارتخوان جدید', icon: 'creditCard' }
	};

	let open = $state(false);
	let form = $state({});
	let saving = $state(false);

	const rows = $derived((session.treasuries || []).filter((treasury) => treasury.kind === kind));
	const banks = $derived((session.treasuries || []).filter((treasury) => treasury.kind === 'bank'));
	const meta = $derived(META[kind]);

	function openNew() {
		form = {
			kind,
			name: '',
			bankName: '',
			accountNo: '',
			terminalNo: '',
			feePercent: 0,
			settleTreasuryId: banks[0]?.id ?? null
		};
		open = true;
	}

	function openEdit(treasury) {
		form = {
			id: treasury.id,
			kind: treasury.kind,
			name: treasury.name,
			bankName: treasury.bank_name || '',
			accountNo: treasury.account_no || '',
			terminalNo: treasury.terminal_no || '',
			feePercent: treasury.fee_percent || 0,
			settleTreasuryId: treasury.settle_treasury_id || null
		};
		open = true;
	}

	async function save() {
		saving = true;
		try {
			await api('treasuries.save', form);
			toast('ذخیره شد');
			open = false;
			await refreshTreasuries();
		} catch (error) {
			toast(error.message, 'err');
		} finally {
			saving = false;
		}
	}

	async function remove(treasury) {
		try {
			await api('treasuries.remove', { id: treasury.id });
			toast('حساب غیرفعال شد');
			await refreshTreasuries();
		} catch (error) {
			toast(error.message, 'err', 5000);
		}
	}
</script>

<div class="card overflow-hidden">
	<div class="flex items-center justify-between border-b border-line px-4 py-3">
		<h3 class="flex items-center gap-2 text-[13px] font-bold text-ink">
			<Icon name={meta.icon} size={15} class="text-muted" />
			{meta.title}
		</h3>
		<button class="btn btn-primary btn-sm" onclick={openNew}>
			<Icon name="plus" size={13} />
			{meta.add}
		</button>
	</div>

	<table class="table">
		<thead>
			<tr>
				<th>نام</th>
				{#if kind === 'bank'}<th>بانک</th><th>شماره حساب</th>{/if}
				{#if kind === 'terminal'}<th>شماره پایانه</th><th>بانک متصل</th><th class="!text-left">کارمزد</th>{/if}
				<th class="!text-left">موجودی</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as treasury (treasury.id)}
				<tr>
					<td class="font-medium text-ink">{treasury.name}</td>
					{#if kind === 'bank'}
						<td class="text-[12px] text-muted">{treasury.bank_name || '—'}</td>
						<td class="mono-num text-[12px]">{faDigits(treasury.account_no) || '—'}</td>
					{/if}
					{#if kind === 'terminal'}
						<td class="mono-num text-[12px]">{faDigits(treasury.terminal_no) || '—'}</td>
						<td class="text-[12px] text-muted">{treasury.settle_name || '—'}</td>
						<td class="!text-left num">{fmt(treasury.fee_percent, 2)}٪</td>
					{/if}
					<td class="!text-left num text-ink">{fmt(treasury.balance)}</td>
					<td class="!text-left">
						<div class="flex items-center gap-1">
							<button class="btn btn-soft btn-sm !px-2" onclick={() => openEdit(treasury)} aria-label="ویرایش">
								<Icon name="edit" size={13} />
							</button>
							<button class="btn btn-soft btn-sm !px-2" onclick={() => remove(treasury)} aria-label="حذف">
								<Icon name="trash" size={13} />
							</button>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if !rows.length}
		<p class="py-8 text-center text-[12px] text-muted2">موردی تعریف نشده است</p>
	{/if}
</div>

<Modal open={open} title={form.id ? 'ویرایش' : meta.add} onclose={() => (open = false)} size="sm">
	<div class="space-y-3">
		<div>
			<label class="label" for="tr-name">نام</label>
			<input id="tr-name" class="input" bind:value={form.name} />
		</div>

		{#if kind === 'bank'}
			<div>
				<label class="label" for="tr-bank">نام بانک</label>
				<input id="tr-bank" class="input" bind:value={form.bankName} />
			</div>
			<div>
				<label class="label" for="tr-acc">شماره حساب / شبا</label>
				<input id="tr-acc" class="input" bind:value={form.accountNo} />
			</div>
		{/if}

		{#if kind === 'terminal'}
			<div>
				<label class="label" for="tr-term">شماره پایانه</label>
				<input id="tr-term" class="input" bind:value={form.terminalNo} />
			</div>
			<div>
				<label class="label" for="tr-settle">بانک متصل (واریز تسویه)</label>
				<select id="tr-settle" class="input" bind:value={form.settleTreasuryId}>
					{#each banks as bank (bank.id)}
						<option value={bank.id}>{bank.name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="label" for="tr-fee">درصد کارمزد</label>
				<NumInput id="tr-fee" class="input" bind:value={form.feePercent} />
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (open = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={save} disabled={saving}>ذخیره</button>
	{/snippet}
</Modal>
