<script>
	import Icon from '../Icon.svelte';
	import Modal from '../Modal.svelte';
	import { api } from '$lib/api.js';
	import { session, refreshAccounts } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt } from '$lib/format.js';

	let open = $state(false);
	let form = $state({});
	let saving = $state(false);

	const groups = $derived(session.accounts || []);

	function openNew(groupKey = 'expense') {
		form = { groupKey, name: '', code: '', nature: groupKey === 'income' || groupKey === 'equity' ? 'credit' : 'debit' };
		open = true;
	}

	async function save() {
		saving = true;
		try {
			await api('accounts.save', form);
			toast('حساب ذخیره شد');
			open = false;
			await refreshAccounts();
		} catch (error) {
			toast(error.message, 'err');
		} finally {
			saving = false;
		}
	}
</script>

<div class="card overflow-hidden">
	<div class="flex items-center justify-between border-b border-line px-4 py-3">
		<h3 class="flex items-center gap-2 text-[13px] font-bold text-ink">
			<Icon name="layers" size={15} class="text-muted" />
			ساختار حساب‌ها
		</h3>
		<button class="btn btn-primary btn-sm" onclick={() => openNew('expense')}>
			<Icon name="plus" size={13} />
			حساب جدید
		</button>
	</div>

	<div class="divide-y divide-line">
		{#each groups as group (group.key)}
			<div class="px-4 py-3">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-[11.5px] font-medium text-muted">{group.label}</span>
					<button class="text-[10.5px] text-goldink hover:underline" onclick={() => openNew(group.key)}>
						افزودن حساب
					</button>
				</div>
				<div class="space-y-1">
					{#each group.accounts as account (account.id)}
						<div class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-paper/60">
							<span class="flex items-center gap-2 text-[12px] text-ink2">
								{#if account.code}<span class="mono-num text-[10px] text-muted2">{account.code}</span>{/if}
								{account.name}
							</span>
							<span class="num text-[11.5px] {account.signed < 0 ? 'text-neg' : 'text-ink'}">{fmt(account.signed)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>

<Modal open={open} title="حساب جدید" onclose={() => (open = false)} size="sm">
	<div class="space-y-3">
		<div>
			<label class="label" for="ac-name">نام حساب</label>
			<input id="ac-name" class="input" bind:value={form.name} placeholder="مثلاً هزینه تبلیغات" />
		</div>
		<div>
			<label class="label" for="ac-code">کد (اختیاری)</label>
			<input id="ac-code" class="input" bind:value={form.code} placeholder="۶۸۰۰" />
		</div>
		<div>
			<label class="label" for="ac-group">گروه</label>
			<select id="ac-group" class="input" bind:value={form.groupKey}>
				{#each groups as group (group.key)}
					<option value={group.key}>{group.label}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class="label" for="ac-nature">ماهیت</label>
			<select id="ac-nature" class="input" bind:value={form.nature}>
				<option value="debit">بدهکار</option>
				<option value="credit">بستانکار</option>
			</select>
		</div>
	</div>

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (open = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={save} disabled={saving}>ذخیره</button>
	{/snippet}
</Modal>
