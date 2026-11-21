<script>
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NumInput from '$lib/components/NumInput.svelte';
	import QuantityInput from '$lib/components/QuantityInput.svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import PartyPicker from '$lib/components/PartyPicker.svelte';
	import ProductSearch from '$lib/components/ProductSearch.svelte';
	import PaymentEditor from '$lib/components/PaymentEditor.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, todayISO, faDate } from '$lib/format.js';
	import { addLine, removeLine, cartTotals, lineNet } from '$lib/domain/cart.js';
	import { createPayment, validatePayments, toPayload } from '$lib/domain/payment.js';

	let partyId = $state(null);
	let date = $state(todayISO());
	let warehouseId = $state(null);
	let lines = $state([]);
	let discount = $state(0);
	let extraCost = $state(0);
	let note = $state('');
	let payments = $state([]);
	let saving = $state(false);

	const currency = $derived(session.settings?.currency || 'تومان');
	const treasuries = $derived(session.treasuries || []);
	const base = $derived(cartTotals(lines, discount));
	const total = $derived(base.total + extraCost);

	onMount(() => {
		warehouseId = session.warehouses?.[0]?.id ?? null;
		payments = [createPayment('cash', treasuries)];
	});

	function handleSelect(product) {
		lines = addLine(lines, product, { unitPrice: product.purchase_price || product.sale_price });
	}

	function reset() {
		lines = [];
		discount = 0;
		extraCost = 0;
		note = '';
		partyId = null;
		payments = [createPayment('cash', treasuries)];
	}

	async function submit() {
		if (!partyId) return toast('تأمین‌کننده را انتخاب کنید', 'warn');
		if (!lines.length) return toast('حداقل یک کالا اضافه کنید', 'warn');

		const paymentError = validatePayments(total, payments);
		if (paymentError) return toast(paymentError, 'err');

		saving = true;
		try {
			await api('docs.purchase', {
				date,
				partyId,
				warehouseId,
				discount,
				extraCost,
				note,
				lines: lines.map((line) => ({
					productId: line.productId,
					qty: line.qty,
					unitPrice: line.unitPrice,
					discount: line.discount || 0
				})),
				payments: toPayload(payments)
			});
			toast(`فاکتور خرید به مبلغ ${fmt(total)} ${currency} ثبت شد`);
			reset();
		} catch (error) {
			toast(error.message, 'err', 5000);
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-[1180px] px-6 py-5">
	<div class="mb-3 card card-pad">
		<div class="grid grid-cols-3 gap-3">
			<div>
				<label class="label" for="pur-party">تأمین‌کننده</label>
				<PartyPicker id="pur-party" bind:value={partyId} kind="supplier" placeholder="جست‌وجوی تأمین‌کننده…" />
			</div>
			<div>
				<label class="label" for="pur-date">تاریخ فاکتور</label>
				<DateInput id="pur-date" bind:value={date} />
				<div class="mt-1 text-center text-[10px] text-muted2">{faDate(date, 'full')}</div>
			</div>
			<div>
				<label class="label" for="pur-wh">انبار</label>
				<select id="pur-wh" class="input" bind:value={warehouseId}>
					{#each session.warehouses as warehouse (warehouse.id)}
						<option value={warehouse.id}>{warehouse.name}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-3">
		<div class="card overflow-hidden xl:col-span-2">
			<div class="border-b border-line px-4 py-3">
				<ProductSearch onselect={handleSelect} placeholder="افزودن کالا به فاکتور خرید (نام یا بارکد)…" />
			</div>

			<table class="table">
				<thead>
					<tr>
						<th>کالا</th>
						<th class="!w-[110px]">تعداد</th>
						<th class="!w-[130px]">قیمت خرید</th>
						<th class="!text-left">جمع</th>
						<th class="!w-[36px]"></th>
					</tr>
				</thead>
				<tbody>
					{#each lines as line (line.productId)}
						<tr>
							<td>
								<div class="text-[12.5px] font-medium text-ink">{line.name}</div>
								<div class="text-[10px] text-muted2">{line.unit}</div>
							</td>
							<td>
								<QuantityInput bind:value={line.qty} unit={line.unit} class="input !h-8 !px-2 !text-[12px]" />
							</td>
							<td>
								<NumInput bind:value={line.unitPrice} class="input !h-8 !px-2 !text-[12px]" />
							</td>
							<td class="!text-left num text-ink">{fmt(lineNet(line))}</td>
							<td>
								<button
									class="text-muted2 transition hover:text-neg"
									onclick={() => (lines = removeLine(lines, line.productId))}
									aria-label="حذف"
								>
									<Icon name="x" size={13} />
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if !lines.length}
				<p class="py-10 text-center text-[12.5px] text-muted2">کالایی به فاکتور اضافه نشده است</p>
			{/if}
		</div>

		<div class="space-y-3">
			<div class="card card-pad">
				<h3 class="mb-3 text-[13px] font-bold text-ink">جمع فاکتور</h3>

				<div class="space-y-2 text-[12px]">
					<div class="flex items-center justify-between">
						<span class="text-muted">جمع اقلام</span>
						<span class="num text-ink2">{fmt(base.subtotal)}</span>
					</div>
					<div class="flex items-center justify-between gap-2">
						<span class="text-muted">تخفیف</span>
						<NumInput bind:value={discount} class="input !h-8 w-[110px] !px-2 !text-[12px]" align="left" />
					</div>
					<div class="flex items-center justify-between gap-2">
						<span class="text-muted">هزینه جانبی (کرایه…)</span>
						<NumInput bind:value={extraCost} class="input !h-8 w-[110px] !px-2 !text-[12px]" align="left" />
					</div>
				</div>

				<div class="mt-3 flex items-end justify-between border-t border-dashed border-line2 pt-2.5">
					<span class="text-[12px] font-medium text-ink2">مبلغ فاکتور</span>
					<div class="text-left">
						<div class="num text-[20px] leading-none text-ink">{fmt(total)}</div>
						<div class="text-[10px] text-muted">{currency}</div>
					</div>
				</div>

				<p class="mt-2 text-[10px] leading-5 text-muted2">
					هزینه جانبی به نسبت ارزش ردیف‌ها در بهای تمام‌شده کالا تخصیص می‌یابد.
				</p>
			</div>

			<div class="card card-pad">
				<h3 class="mb-3 text-[13px] font-bold text-ink">پرداخت</h3>
				<PaymentEditor bind:payments {total} {treasuries} {currency} />
			</div>

			<div class="card card-pad">
				<label class="label" for="pur-note">توضیحات</label>
				<input id="pur-note" class="input" bind:value={note} placeholder="اختیاری" />
			</div>

			<button class="btn btn-primary btn-lg w-full" onclick={submit} disabled={saving}>
				<Icon name="save" size={16} />
				{saving ? 'در حال ثبت…' : 'ثبت فاکتور خرید'}
			</button>
		</div>
	</div>
</div>
