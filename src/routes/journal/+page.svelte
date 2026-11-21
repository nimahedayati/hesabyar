<script>
	/**
	 * سند حسابداری دستی: چند ردیف بدهکار/بستانکار با کنترل تراز.
	 * ثبت نهایی سمت سرویس هم اعتبارسنجی می‌شود؛ اینجا فقط تجربه کاربری بهتر است.
	 */
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NumInput from '$lib/components/NumInput.svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import PartyPicker from '$lib/components/PartyPicker.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, faDate, faDigits, todayISO } from '$lib/format.js';

	const PAGE_SIZE = 8;
	const BALANCE_EPSILON = 0.01;

	let sequence = 0;
	const blankRow = () => {
		sequence += 1;
		return { key: sequence, accountId: '', partyId: null, description: '', debit: 0, credit: 0 };
	};

	let date = $state(todayISO());
	let description = $state('');
	let rows = $state([blankRow(), blankRow()]);
	let saving = $state(false);

	let history = $state({ rows: [], total: 0, page: 1, pages: 1 });
	let historyPage = $state(1);
	let historyLoading = $state(true);

	const groups = $derived(session.accounts || []);
	const currency = $derived(session.settings?.currency || 'تومان');
	const debitTotal = $derived(rows.reduce((sum, row) => sum + (Number(row.debit) || 0), 0));
	const creditTotal = $derived(rows.reduce((sum, row) => sum + (Number(row.credit) || 0), 0));
	const difference = $derived(debitTotal - creditTotal);
	const balanced = $derived(debitTotal > 0 && Math.abs(difference) < BALANCE_EPSILON);
	const filledCount = $derived(rows.filter(isFilled).length);

	function isFilled(row) {
		return Boolean(row.accountId) && (Number(row.debit) > 0 || Number(row.credit) > 0);
	}

	async function loadHistory() {
		historyLoading = true;
		try {
			history = await api('docs.list', { type: 'journal', page: historyPage, pageSize: PAGE_SIZE });
		} catch (error) {
			toast(error.message, 'err');
		} finally {
			historyLoading = false;
		}
	}

	onMount(loadHistory);

	function addRow() {
		rows = [...rows, blankRow()];
	}

	function removeRow(key) {
		if (rows.length <= 2) return toast('سند باید حداقل دو ردیف داشته باشد', 'warn');
		rows = rows.filter((row) => row.key !== key);
	}

	/** هر ردیف یا بدهکار است یا بستانکار؛ پر کردن یکی، دیگری را صفر می‌کند */
	function setAmount(row, side, value) {
		const amount = Math.max(Number(value) || 0, 0);
		row[side] = amount;
		row[side === 'debit' ? 'credit' : 'debit'] = 0;
	}

	/** مغایرت را روی یک ردیف خالیِ دارای حساب می‌نشاند */
	function fillDifference() {
		const gap = Math.abs(difference);
		if (gap < BALANCE_EPSILON) return;
		const target = rows.find((row) => row.accountId && !Number(row.debit) && !Number(row.credit));
		if (!target) return toast('یک ردیف خالی با حساب انتخاب‌شده اضافه کنید', 'warn');
		setAmount(target, difference > 0 ? 'credit' : 'debit', gap);
	}

	function resetForm() {
		description = '';
		rows = [blankRow(), blankRow()];
	}

	async function submit() {
		const lines = rows.filter(isFilled).map((row) => ({
			accountId: row.accountId,
			partyId: row.partyId || null,
			description: row.description,
			debit: Number(row.debit) || 0,
			credit: Number(row.credit) || 0
		}));

		if (!description.trim()) return toast('شرح سند را وارد کنید', 'warn');
		if (lines.length < 2) return toast('حداقل دو ردیف با حساب و مبلغ لازم است', 'warn');
		if (!balanced) return toast('جمع بدهکار و بستانکار برابر نیست', 'err');

		saving = true;
		try {
			const result = await api('docs.journal', { date, description: description.trim(), lines });
			toast(`سند ${faDigits(result.number)} به مبلغ ${fmt(result.total)} ${currency} ثبت شد`);
			resetForm();
			historyPage = 1;
			await loadHistory();
		} catch (error) {
			toast(error.message, 'err', 6000);
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-[1180px] px-6 py-5">
	<div class="card card-pad mb-3">
		<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
			<div>
				<label class="label" for="jv-date">تاریخ سند</label>
				<DateInput id="jv-date" bind:value={date} />
				<div class="mt-1 text-center text-[10px] text-muted2">{faDate(date, 'full')}</div>
			</div>
			<div class="md:col-span-2">
				<label class="label" for="jv-desc">شرح سند</label>
				<input id="jv-desc" class="input" bind:value={description} placeholder="مثلاً اصلاح مانده حساب بانک ملت" />
			</div>
		</div>
	</div>

	<div class="card overflow-hidden">
		<div class="flex items-center justify-between border-b border-line px-4 py-2.5">
			<div class="text-[12.5px] font-medium text-ink">ردیف‌های سند</div>
			<button class="btn btn-soft btn-sm" onclick={addRow}>
				<Icon name="plus" size={13} />
				ردیف جدید
			</button>
		</div>

		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						<th class="!w-[34px]">#</th>
						<th class="!w-[230px]">حساب</th>
						<th class="!w-[170px]">طرف حساب (اختیاری)</th>
						<th>شرح ردیف</th>
						<th class="!w-[130px]">بدهکار</th>
						<th class="!w-[130px]">بستانکار</th>
						<th class="!w-[36px]"></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row, index (row.key)}
						<tr>
							<td class="num text-[11px] text-muted2">{fmt(index + 1)}</td>
							<td>
								<select class="input !h-8 !px-2 !text-[12px]" bind:value={row.accountId}>
									<option value="">انتخاب حساب…</option>
									{#each groups as group (group.key)}
										<optgroup label={group.label}>
											{#each group.accounts as account (account.id)}
												<option value={account.id}>{faDigits(account.code)} — {account.name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</td>
							<td>
								<PartyPicker bind:value={row.partyId} placeholder="بدون شخص" />
							</td>
							<td>
								<input class="input !h-8 !text-[12px]" bind:value={row.description} placeholder="اختیاری" />
							</td>
							<td>
								<NumInput
									value={row.debit}
									onchange={(value) => setAmount(row, 'debit', value)}
									class="input !h-8 !px-2 !text-[12px]"
									align="left"
								/>
							</td>
							<td>
								<NumInput
									value={row.credit}
									onchange={(value) => setAmount(row, 'credit', value)}
									class="input !h-8 !px-2 !text-[12px]"
									align="left"
								/>
							</td>
							<td>
								<button
									class="text-muted2 transition hover:text-neg"
									onclick={() => removeRow(row.key)}
									aria-label="حذف ردیف"
								>
									<Icon name="x" size={13} />
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr class="bg-paper/60">
						<td colspan="4" class="text-[12px] text-muted">
							{fmt(filledCount)} ردیف مؤثر از {fmt(rows.length)} ردیف
						</td>
						<td class="num text-[12.5px] text-ink">{fmt(debitTotal)}</td>
						<td class="num text-[12.5px] text-ink">{fmt(creditTotal)}</td>
						<td></td>
					</tr>
				</tfoot>
			</table>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/40 px-4 py-3">
			<div class="flex items-center gap-2 text-[12px]">
				{#if balanced}
					<span class="tag tag-pos">سند تراز است</span>
				{:else if debitTotal === 0 && creditTotal === 0}
					<span class="tag tag-neutral">مبالغ وارد نشده</span>
				{:else}
					<span class="tag tag-neg">مغایرت {fmt(Math.abs(difference))} {currency}</span>
					<button class="btn btn-ghost btn-sm" onclick={fillDifference}>پر کردن مغایرت</button>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<button class="btn btn-ghost" onclick={resetForm}>پاک کردن فرم</button>
				<button class="btn btn-primary" onclick={submit} disabled={saving || !balanced}>
					<Icon name="save" size={15} />
					{saving ? 'در حال ثبت…' : 'ثبت سند'}
				</button>
			</div>
		</div>
	</div>

	<div class="mt-3 card overflow-hidden">
		<div class="flex items-center justify-between border-b border-line px-4 py-2.5">
			<div>
				<div class="text-[12.5px] font-medium text-ink">سندهای دستی ثبت‌شده</div>
				<div class="text-[10.5px] text-muted">برای مشاهده ردیف‌ها و ابطال، از صفحه «اسناد و فاکتورها» استفاده کنید</div>
			</div>
			<a href="/invoices" class="btn btn-soft btn-sm">همه اسناد</a>
		</div>

		<table class="table">
			<thead>
				<tr>
					<th>شماره</th>
					<th>تاریخ</th>
					<th>شرح</th>
					<th class="!text-left">مبلغ</th>
				</tr>
			</thead>
			<tbody>
				{#if historyLoading}
					{#each [1, 2, 3] as skeleton (skeleton)}
						<tr><td colspan="4"><div class="skeleton h-5 w-full"></div></td></tr>
					{/each}
				{:else if !history.rows.length}
					<tr><td colspan="4" class="py-8 text-center text-[12px] text-muted2">سندی ثبت نشده است</td></tr>
				{:else}
					{#each history.rows as row (row.id)}
						<tr>
							<td class="mono-num text-[12px] text-ink">{faDigits(row.number)}</td>
							<td class="text-[11.5px] text-muted">{faDate(row.doc_date)}</td>
							<td class="text-[12px] text-ink2">{row.note || '—'}</td>
							<td class="!text-left num">{fmt(row.total)}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>

		<Pagination
			page={history.page}
			pages={history.pages}
			total={history.total}
			pageSize={PAGE_SIZE}
			onchange={(target) => {
				historyPage = target;
				loadHistory();
			}}
		/>
	</div>
</div>
