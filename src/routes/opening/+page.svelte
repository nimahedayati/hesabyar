<script>
	/**
	 * موجودی اولیه: کالا، خزانه و مانده اشخاص در یک سند.
	 * مابه‌التفاوت بدهکار/بستانکار به‌صورت خودکار «سرمایه اولیه» ثبت می‌شود.
	 */
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NumInput from '$lib/components/NumInput.svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import QuantityInput from '$lib/components/QuantityInput.svelte';
	import PartyPicker from '$lib/components/PartyPicker.svelte';
	import ProductSearch from '$lib/components/ProductSearch.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, faDate, todayISO } from '$lib/format.js';

	let sequence = 0;
	const nextKey = () => {
		sequence += 1;
		return sequence;
	};

	let date = $state(todayISO());
	let warehouseId = $state(null);
	let note = $state('');
	let items = $state([]);
	let cash = $state([]);
	let parties = $state([]);
	let saving = $state(false);

	const currency = $derived(session.settings?.currency || 'تومان');
	const treasuries = $derived(session.treasuries || []);
	const inventoryValue = $derived(
		items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitCost) || 0), 0)
	);
	const cashTotal = $derived(cash.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
	const receivable = $derived(
		parties.reduce((sum, row) => sum + (row.side === 'debit' ? Number(row.amount) || 0 : 0), 0)
	);
	const payable = $derived(
		parties.reduce((sum, row) => sum + (row.side === 'credit' ? Number(row.amount) || 0 : 0), 0)
	);
	const debitTotal = $derived(inventoryValue + cashTotal + receivable);
	const creditTotal = $derived(payable);
	const capital = $derived(debitTotal - creditTotal);
	const hasData = $derived(items.length > 0 || cash.length > 0 || parties.length > 0);

	onMount(() => {
		warehouseId = session.warehouses?.[0]?.id ?? null;
	});

	function addProduct(product) {
		const existing = items.find((item) => item.productId === product.id);
		if (existing) {
			existing.qty = Number(existing.qty) + 1;
			return;
		}
		items = [
			...items,
			{
				key: nextKey(),
				productId: product.id,
				name: product.name,
				unit: product.unit,
				qty: 1,
				unitCost: product.purchase_price || product.avg_cost || 0
			}
		];
	}

	function addCashRow() {
		cash = [...cash, { key: nextKey(), treasuryId: treasuries[0]?.id ?? '', amount: 0 }];
	}

	function addPartyRow() {
		parties = [...parties, { key: nextKey(), partyId: null, side: 'debit', amount: 0 }];
	}

	function reset() {
		items = [];
		cash = [];
		parties = [];
		note = '';
	}

	async function submit() {
		if (!hasData) return toast('حداقل یک ردیف کالا، خزانه یا شخص وارد کنید', 'warn');

		const payload = {
			date,
			warehouseId,
			note: note.trim() || 'ثبت موجودی اولیه',
			items: items
				.filter((item) => Number(item.qty) > 0)
				.map((item) => ({ productId: item.productId, qty: Number(item.qty), unitCost: Number(item.unitCost) || 0 })),
			cash: cash
				.filter((row) => row.treasuryId && Number(row.amount) > 0)
				.map((row) => ({ treasuryId: row.treasuryId, amount: Number(row.amount) })),
			parties: parties
				.filter((row) => row.partyId && Number(row.amount) > 0)
				.map((row) => ({ partyId: row.partyId, amount: row.side === 'debit' ? Number(row.amount) : -Number(row.amount) }))
		};

		saving = true;
		try {
			const result = await api('docs.opening', payload);
			toast(`موجودی اولیه ثبت شد — ارزش کالا ${fmt(result.inventoryValue)} ${currency}`);
			reset();
		} catch (error) {
			toast(error.message, 'err', 6000);
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-[1180px] px-6 py-5">
	<div class="mb-3 flex gap-2 rounded-xl border border-[#f0e3c4] bg-[#fdfaf1] px-4 py-3 text-[11.5px] leading-6 text-ink2">
		<span class="shrink-0 text-gold"><Icon name="info" size={15} /></span>
		<p>
			موجودی اولیه را فقط یک‌بار و پیش از شروع کار روزمره ثبت کنید. کالاها با «بهای تمام‌شده» وارد انبار می‌شوند،
			مانده خزانه و اشخاص در حساب‌هایشان می‌نشیند و مابه‌التفاوت به‌طور خودکار به حساب «سرمایه اولیه» منتقل می‌شود.
			اگر بعداً اشتباهی رخ داد، سند را از صفحه اسناد ابطال کنید (سند معکوس ثبت می‌شود).
		</p>
	</div>

	<div class="card card-pad mb-3">
		<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
			<div>
				<label class="label" for="op-date">تاریخ موجودی اولیه</label>
				<DateInput id="op-date" bind:value={date} />
				<div class="mt-1 text-center text-[10px] text-muted2">{faDate(date, 'full')}</div>
			</div>
			<div>
				<label class="label" for="op-wh">انبار</label>
				<select id="op-wh" class="input" bind:value={warehouseId}>
					{#each session.warehouses as warehouse (warehouse.id)}
						<option value={warehouse.id}>{warehouse.name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="label" for="op-note">توضیحات</label>
				<input id="op-note" class="input" bind:value={note} placeholder="مثلاً موجودی ابتدای سال" />
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-3">
		<div class="space-y-3 xl:col-span-2">
			<div class="card overflow-hidden">
				<div class="border-b border-line px-4 py-3">
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-[12.5px] font-medium text-ink">۱. موجودی کالاها</h3>
						<span class="text-[10.5px] text-muted">تعداد × بهای تمام‌شده</span>
					</div>
					<ProductSearch onselect={addProduct} placeholder="کالا را جست‌وجو یا بارکد را اسکن کنید…" />
				</div>

				<table class="table">
					<thead>
						<tr>
							<th>کالا</th>
							<th class="!w-[110px]">تعداد</th>
							<th class="!w-[140px]">بهای واحد</th>
							<th class="!text-left">ارزش</th>
							<th class="!w-[36px]"></th>
						</tr>
					</thead>
					<tbody>
						{#each items as item (item.key)}
							<tr>
								<td>
									<div class="text-[12.5px] font-medium text-ink">{item.name}</div>
									<div class="text-[10px] text-muted2">{item.unit}</div>
								</td>
								<td>
									<QuantityInput bind:value={item.qty} unit={item.unit} class="input !h-8 !px-2 !text-[12px]" />
								</td>
								<td>
									<NumInput bind:value={item.unitCost} class="input !h-8 !px-2 !text-[12px]" align="left" />
								</td>
								<td class="!text-left num text-ink">{fmt((Number(item.qty) || 0) * (Number(item.unitCost) || 0))}</td>
								<td>
									<button
										class="text-muted2 transition hover:text-neg"
										onclick={() => (items = items.filter((row) => row.key !== item.key))}
										aria-label="حذف"
									>
										<Icon name="x" size={13} />
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if !items.length}
					<p class="py-8 text-center text-[12px] text-muted2">کالایی اضافه نشده است</p>
				{/if}
			</div>

			<div class="card overflow-hidden">
				<div class="flex items-center justify-between border-b border-line px-4 py-2.5">
					<h3 class="text-[12.5px] font-medium text-ink">۲. موجودی صندوق و بانک</h3>
					<button class="btn btn-soft btn-sm" onclick={addCashRow} disabled={!treasuries.length}>
						<Icon name="plus" size={13} />
						افزودن حساب
					</button>
				</div>

				{#if !treasuries.length}
					<p class="px-4 py-6 text-center text-[12px] text-muted2">
						ابتدا در تنظیمات، صندوق یا حساب بانکی تعریف کنید
					</p>
				{:else if !cash.length}
					<p class="px-4 py-6 text-center text-[12px] text-muted2">حسابی اضافه نشده است</p>
				{:else}
					<div class="space-y-2 px-4 py-3">
						{#each cash as row (row.key)}
							<div class="flex items-center gap-2">
								<select class="input !h-9 flex-1 !text-[12px]" bind:value={row.treasuryId}>
									{#each treasuries as treasury (treasury.id)}
										<option value={treasury.id}>{treasury.name}</option>
									{/each}
								</select>
								<NumInput bind:value={row.amount} class="input !h-9 w-[150px] !text-[12px]" align="left" />
								<button
									class="text-muted2 transition hover:text-neg"
									onclick={() => (cash = cash.filter((item) => item.key !== row.key))}
									aria-label="حذف"
								>
									<Icon name="x" size={13} />
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="card overflow-hidden">
				<div class="flex items-center justify-between border-b border-line px-4 py-2.5">
					<div>
						<h3 class="text-[12.5px] font-medium text-ink">۳. مانده اشخاص (اختیاری)</h3>
						<p class="text-[10.5px] text-muted">طلب ما از مشتری = بدهکار · بدهی ما به تأمین‌کننده = بستانکار</p>
					</div>
					<button class="btn btn-soft btn-sm" onclick={addPartyRow}>
						<Icon name="plus" size={13} />
						افزودن شخص
					</button>
				</div>

				{#if !parties.length}
					<p class="px-4 py-6 text-center text-[12px] text-muted2">مانده‌ای ثبت نشده است</p>
				{:else}
					<div class="space-y-2 px-4 py-3">
						{#each parties as row (row.key)}
							<div class="flex items-center gap-2">
								<div class="min-w-0 flex-1">
									<PartyPicker bind:value={row.partyId} placeholder="انتخاب شخص…" />
								</div>
								<select class="input !h-9 w-[120px] !text-[12px]" bind:value={row.side}>
									<option value="debit">بدهکار</option>
									<option value="credit">بستانکار</option>
								</select>
								<NumInput bind:value={row.amount} class="input !h-9 w-[140px] !text-[12px]" align="left" />
								<button
									class="text-muted2 transition hover:text-neg"
									onclick={() => (parties = parties.filter((item) => item.key !== row.key))}
									aria-label="حذف"
								>
									<Icon name="x" size={13} />
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="space-y-3">
			<div class="card card-pad">
				<h3 class="mb-3 text-[13px] font-bold text-ink">خلاصه سند</h3>

				<div class="space-y-2 text-[12px]">
					<div class="flex items-center justify-between">
						<span class="text-muted">ارزش موجودی کالا</span>
						<span class="num text-ink2">{fmt(inventoryValue)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-muted">صندوق و بانک</span>
						<span class="num text-ink2">{fmt(cashTotal)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-muted">طلب از اشخاص</span>
						<span class="num text-ink2">{fmt(receivable)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-muted">بدهی به اشخاص</span>
						<span class="num text-ink2">{fmt(payable)}</span>
					</div>
				</div>

				<div class="mt-3 space-y-2 border-t border-dashed border-line2 pt-2.5 text-[12px]">
					<div class="flex items-center justify-between">
						<span class="text-muted">جمع بدهکار</span>
						<span class="num text-ink">{fmt(debitTotal)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-muted">جمع بستانکار</span>
						<span class="num text-ink">{fmt(creditTotal)}</span>
					</div>
					<div class="flex items-center justify-between rounded-lg bg-paper px-2.5 py-2">
						<span class="text-ink2">{capital >= 0 ? 'سرمایه اولیه (بستانکار)' : 'سرمایه اولیه (بدهکار)'}</span>
						<span class="num text-[14px] text-ink">{fmt(Math.abs(capital))}</span>
					</div>
				</div>

				<p class="mt-2 text-[10px] leading-5 text-muted2">
					این مبلغ به‌صورت خودکار در سند ثبت می‌شود تا سند تراز بماند.
				</p>
			</div>

			<button class="btn btn-primary btn-lg w-full" onclick={submit} disabled={saving || !hasData}>
				<Icon name="save" size={16} />
				{saving ? 'در حال ثبت…' : 'ثبت موجودی اولیه'}
			</button>

			<div class="card card-pad text-[11px] leading-6 text-muted">
				<div class="mb-1 font-medium text-ink2">پس از ثبت چه می‌شود؟</div>
				<ul class="list-inside list-disc space-y-1">
					<li>برای هر کالا یک گردش ورودی در کاردکس ثبت می‌شود.</li>
					<li>بهای تمام‌شده کالا روی مبلغ واردشده تنظیم می‌شود.</li>
					<li>مانده صندوق/بانک و اشخاص در دفتر کل می‌نشیند.</li>
					<li>سود و زیان تحت تأثیر قرار نمی‌گیرد (سند افتتاحیه است).</li>
				</ul>
			</div>
		</div>
	</div>
</div>
