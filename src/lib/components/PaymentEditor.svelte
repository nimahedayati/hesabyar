<script>
	import Icon from './Icon.svelte';
	import NumInput from './NumInput.svelte';
	import { fmt } from '$lib/format.js';
	import {
		PAY_METHODS,
		methodMeta,
		treasuriesFor,
		createPayment,
		sumPayments,
		remainingOf,
		suggestedAmount
	} from '$lib/domain/payment.js';

	let { payments = $bindable([]), total = 0, treasuries = [], currency = 'تومان' } = $props();

	const paid = $derived(sumPayments(payments));
	const remaining = $derived(remainingOf(total, payments));

	function addRow() {
		payments = [...payments, createPayment('cash', treasuries)];
	}

	function removeRow(index) {
		payments = payments.filter((_, i) => i !== index);
	}

	function changeMethod(row, method) {
		row.method = method;
		const options = treasuriesFor(method, treasuries);
		if (!options.some((treasury) => treasury.id === row.treasuryId)) {
			row.treasuryId = options[0]?.id ?? '';
		}
	}

	const fillRemaining = (row) => {
		row.amount = suggestedAmount(total, payments, row);
	};
</script>

<div class="space-y-2">
	{#each payments as row, index (index)}
		<div class="rounded-xl border border-line bg-paper/40 p-2.5">
			<div class="mb-2 flex items-center justify-between">
				<span class="flex items-center gap-1.5 text-[12px] font-medium text-ink2">
					<Icon name={methodMeta(row.method).icon} size={13} />
					پرداخت {fmt(index + 1)}
				</span>
				<div class="flex items-center gap-2">
					<button class="text-[10.5px] text-goldink hover:underline" onclick={() => fillRemaining(row)}>
						باقی مبلغ
					</button>
					{#if payments.length > 1}
						<button
							class="text-muted2 transition hover:text-neg"
							onclick={() => removeRow(index)}
							aria-label="حذف ردیف"
						>
							<Icon name="x" size={13} />
						</button>
					{/if}
				</div>
			</div>

			<div class="flex gap-2">
				<select
					class="input !h-9 w-[130px] !text-[12px]"
					value={row.method}
					onchange={(event) => changeMethod(row, event.target.value)}
				>
					{#each PAY_METHODS as method (method.key)}
						<option value={method.key}>{method.label}</option>
					{/each}
				</select>

				{#if methodMeta(row.method).treasuryKind}
					<select class="input !h-9 flex-1 !text-[11.5px]" bind:value={row.treasuryId}>
						{#each treasuriesFor(row.method, treasuries) as treasury (treasury.id)}
							<option value={treasury.id}>{treasury.name}</option>
						{/each}
					</select>
				{:else}
					<div class="flex flex-1 items-center rounded-lg bg-paper px-2.5 text-[11px] text-muted">
						مبلغ چک پس از ثبت در بخش چک‌ها پیگیری می‌شود
					</div>
				{/if}

				<NumInput bind:value={row.amount} class="input !h-9 w-[120px] !text-[12.5px]" align="left" />
			</div>
		</div>
	{/each}

	<button class="btn btn-soft btn-sm w-full" onclick={addRow}>
		<Icon name="plus" size={13} />
		افزودن ردیف پرداخت (مثلاً کارتخوان دوم)
	</button>

	<div class="mt-3 flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
		<div class="text-[11.5px]">
			<div class="text-muted">جمع پرداختی</div>
			<div class="num mt-0.5 text-[13px] text-ink">{fmt(paid)} <span class="text-[10px] text-muted2">{currency}</span></div>
		</div>
		<div class="text-left text-[11.5px]">
			<div class="text-muted">مانده</div>
			<div class="num mt-0.5 text-[13px] {remaining > 0.5 ? 'text-neg' : 'text-pos'}">{fmt(Math.max(remaining, 0))}</div>
		</div>
	</div>
</div>
