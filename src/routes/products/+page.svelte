<script>
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NumInput from '$lib/components/NumInput.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { api } from '$lib/api.js';
	import { session, refreshCategories } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, faDate, faDigits } from '$lib/format.js';
	import { UNITS, allowsFraction } from '$lib/domain/units.js';

	const PAGE_SIZE = 25;

	let rows = $state([]);
	let total = $state(0);
	let page = $state(1);
	let pages = $state(1);
	let loading = $state(true);
	let q = $state('');
	let cat = $state(null);
	let onlyLow = $state(false);

	let editOpen = $state(false);
	let form = $state({});
	let kardexOpen = $state(false);
	let kardexRows = $state([]);
	let kardexProduct = $state(null);

	const cur = $derived(session.settings?.currency || 'تومان');
	const totalValue = $derived(rows.reduce((sum, row) => sum + (row.stock_value || 0), 0));
	const lowCount = $derived(rows.filter((row) => row.min_stock > 0 && row.stock_qty <= row.min_stock).length);
	// واحدهای قدیمی خارج از فهرست استاندارد هم قابل نمایش و حفظ هستند
	const unitOptions = $derived(
		!form.unit || UNITS.some((unit) => unit.key === form.unit) ? UNITS : [{ key: form.unit }, ...UNITS]
	);

	async function load() {
		loading = true;
		try {
			const result = await api('products.list', {
				q,
				categoryId: cat,
				lowStock: onlyLow,
				limit: PAGE_SIZE,
				offset: (page - 1) * PAGE_SIZE
			});
			rows = result.rows;
			total = result.total;
			pages = Math.max(Math.ceil(result.total / PAGE_SIZE), 1);
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
		q;
		cat;
		onlyLow;
		const timer = setTimeout(reload, 180);
		return () => clearTimeout(timer);
	});

	function openNew() {
		form = {
			name: '',
			sku: '',
			categoryId: session.categories[0]?.id || null,
			unit: 'عدد',
			purchasePrice: 0,
			salePrice: 0,
			minStock: 0,
			barcodes: '',
			isFavorite: false,
			favoriteGroup: ''
		};
		editOpen = true;
	}

	function openEdit(product) {
		form = {
			id: product.id,
			name: product.name,
			sku: product.sku || '',
			categoryId: product.category_id,
			unit: product.unit,
			purchasePrice: product.purchase_price,
			salePrice: product.sale_price,
			minStock: product.min_stock,
			barcodes: product.barcode || '',
			isFavorite: !!product.is_favorite,
			favoriteGroup: product.favorite_group || ''
		};
		editOpen = true;
	}

	async function save() {
		try {
			if (!form.name?.trim()) return toast('نام کالا را وارد کنید', 'warn');
			await api('products.save', {
				...form,
				barcodes: String(form.barcodes || '')
					.split(/[,\s]+/)
					.filter(Boolean)
			});
			toast('کالا ذخیره شد');
			editOpen = false;
			await load();
		} catch (error) {
			toast(error.message, 'err');
		}
	}

	async function openKardex(product) {
		kardexProduct = product;
		kardexRows = await api('products.kardex', { id: product.id });
		kardexOpen = true;
	}

	async function toggleFav(product) {
		try {
			await api('products.favorite', { id: product.id, value: !product.is_favorite });
			await load();
		} catch (error) {
			toast(error.message, 'err');
		}
	}

	async function reloadCategories() {
		await refreshCategories();
	}
</script>

<div class="mx-auto max-w-[1320px] px-6 py-5">
	<div class="mb-4 grid grid-cols-3 gap-3">
		<div class="card card-pad">
			<div class="text-[11.5px] text-muted">تعداد کالا (کل)</div>
			<div class="num mt-1.5 text-[21px] text-ink">{fmt(total)}</div>
		</div>
		<div class="card card-pad">
			<div class="text-[11.5px] text-muted">ارزش موجودی این صفحه</div>
			<div class="num mt-1.5 text-[21px] text-ink">{fmt(totalValue)}</div>
			<div class="text-[10px] text-muted2">{cur} — بر پایه بهای تمام‌شده</div>
		</div>
		<div class="card card-pad">
			<div class="text-[11.5px] text-muted">کالاهای رو به اتمام (این صفحه)</div>
			<div class="num mt-1.5 text-[21px] {lowCount ? 'text-neg' : 'text-ink'}">{fmt(lowCount)}</div>
		</div>
	</div>

	<div class="card overflow-hidden">
		<div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
			<div class="relative w-[260px]">
				<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" size={15} /></span>
				<input class="input !h-9 !pr-9 !text-[12.5px]" placeholder="جست‌وجوی نام، کد یا بارکد" bind:value={q} />
			</div>
			<select class="input !h-9 w-[150px] !text-[12.5px]" bind:value={cat}>
				<option value={null}>همه گروه‌ها</option>
				{#each session.categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
			<button class="chip {onlyLow ? 'active' : ''}" onclick={() => (onlyLow = !onlyLow)}>کم‌موجود</button>
			<div class="flex-1"></div>
			<button class="btn btn-soft btn-sm" onclick={reloadCategories} title="به‌روزرسانی گروه‌ها">
				<Icon name="refresh" size={13} />
			</button>
			<button class="btn btn-primary btn-sm" onclick={openNew}>
				<Icon name="plus" size={14} />
				کالای جدید
			</button>
		</div>

		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						<th>کالا</th>
						<th>گروه</th>
						<th class="!text-left">موجودی</th>
						<th class="!text-left">بهای تمام‌شده</th>
						<th class="!text-left">قیمت فروش</th>
						<th class="!text-left">ارزش</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#if loading}
						{#each [1, 2, 3, 4, 5] as _row}
							<tr><td colspan="7"><div class="skeleton h-6 w-full"></div></td></tr>
						{/each}
					{:else}
						{#each rows as product (product.id)}
							<tr>
								<td>
									<div class="flex items-center gap-2">
										<button
											class="shrink-0 transition {product.is_favorite ? 'text-gold' : 'text-line2 hover:text-muted'}"
											onclick={() => toggleFav(product)}
											title="افزودن به منوی سریع"
										>
											<svg width="15" height="15" viewBox="0 0 24 24" fill={product.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.6">
												<path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.5l-5.4 2.9 1-6.1L3.2 10l6.1-.9z" />
											</svg>
										</button>
										<div class="min-w-0">
											<div class="truncate font-medium text-ink">{product.name}</div>
											<div class="text-[10.5px] text-muted2">{faDigits(product.barcode || product.sku) || '—'}</div>
										</div>
									</div>
								</td>
								<td><span class="tag tag-neutral">{product.category_name || '—'}</span></td>
								<td class="!text-left">
									<span class="num {product.stock_qty <= product.min_stock ? 'text-neg' : 'text-ink'}">{fmt(product.stock_qty)}</span>
									<span class="text-[10.5px] text-muted2"> {product.unit}</span>
								</td>
								<td class="!text-left num">{fmt(product.avg_cost)}</td>
								<td class="!text-left num">{fmt(product.sale_price)}</td>
								<td class="!text-left num text-ink">{fmt(product.stock_value)}</td>
								<td class="!text-left">
									<div class="flex items-center gap-1">
										<button class="btn btn-soft btn-sm !px-2" onclick={() => openKardex(product)} title="کاردکس">
											<Icon name="layers" size={13} />
										</button>
										<button class="btn btn-soft btn-sm !px-2" onclick={() => openEdit(product)} title="ویرایش">
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
				<p class="py-10 text-center text-[12.5px] text-muted2">کالایی یافت نشد</p>
			{/if}
		</div>

		<Pagination {page} {pages} {total} pageSize={PAGE_SIZE} onchange={(target) => { page = target; load(); }} />
	</div>
</div>

<Modal open={editOpen} title={form.id ? 'ویرایش کالا' : 'کالای جدید'} onclose={() => (editOpen = false)} size="md">
	<div class="grid grid-cols-2 gap-3">
		<div class="col-span-2">
			<label class="label" for="p-name">نام کالا</label>
			<input id="p-name" class="input" bind:value={form.name} placeholder="مثلاً شیر پرچرب ۱ لیتری" />
		</div>
		<div>
			<label class="label" for="p-cat">گروه کالا</label>
			<select id="p-cat" class="input" bind:value={form.categoryId}>
				{#each session.categories as category (category.id)}<option value={category.id}>{category.name}</option>{/each}
			</select>
		</div>
		<div>
			<label class="label" for="p-unit">واحد شمارش</label>
			<select id="p-unit" class="input" bind:value={form.unit}>
				{#each unitOptions as unit (unit.key)}
					<option value={unit.key}>{unit.key}</option>
				{/each}
			</select>
			<p class="mt-1 text-[10.5px] text-muted2">
				{allowsFraction(form.unit)
					? 'در فروش و خرید، مقدار اعشاری (تا ۳ رقم) مجاز است'
					: 'در فروش و خرید، فقط عدد صحیح مجاز است'}
			</p>
		</div>
		<div>
			<label class="label" for="p-buy">قیمت خرید</label>
			<NumInput id="p-buy" class="input" bind:value={form.purchasePrice} />
		</div>
		<div>
			<label class="label" for="p-sell">قیمت فروش</label>
			<NumInput id="p-sell" class="input" bind:value={form.salePrice} />
		</div>
		<div>
			<label class="label" for="p-min">حداقل موجودی (هشدار)</label>
			<NumInput id="p-min" class="input" bind:value={form.minStock} />
		</div>
		<div>
			<label class="label" for="p-bc">بارکد</label>
			<input id="p-bc" class="input" bind:value={form.barcodes} placeholder="چند بارکد با فاصله" />
		</div>
		<div class="col-span-2 flex items-center gap-2 rounded-lg bg-paper px-3 py-2.5">
			<input id="p-fav" type="checkbox" bind:checked={form.isFavorite} class="h-4 w-4 accent-[#b98e1d]" />
			<label for="p-fav" class="text-[12.5px] text-ink2">نمایش در منوی دسترسی سریع صفحه فروش</label>
		</div>
	</div>

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (editOpen = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={save}>ذخیره</button>
	{/snippet}
</Modal>

<Modal
	open={kardexOpen}
	title="کاردکس {kardexProduct?.name || ''}"
	subtitle="گردش موجودی و بهای تمام‌شده"
	onclose={() => (kardexOpen = false)}
	size="lg"
>
	<table class="table">
		<thead>
			<tr>
				<th>تاریخ</th>
				<th>سند</th>
				<th class="!text-left">ورود</th>
				<th class="!text-left">خروج</th>
				<th class="!text-left">بهای واحد</th>
				<th class="!text-left">موجودی</th>
			</tr>
		</thead>
		<tbody>
			{#each kardexRows as move}
				<tr>
					<td>{faDate(move.move_date)}</td>
					<td class="text-[11.5px] text-muted">{faDigits(move.doc_number) || move.doc_type}</td>
					<td class="!text-left num text-pos">{move.qty > 0 ? fmt(move.qty) : '—'}</td>
					<td class="!text-left num text-neg">{move.qty < 0 ? fmt(-move.qty) : '—'}</td>
					<td class="!text-left num">{fmt(move.unit_cost)}</td>
					<td class="!text-left num text-ink">{fmt(move.balance_qty)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if !kardexRows.length}<p class="py-8 text-center text-[12px] text-muted2">گردشی ثبت نشده</p>{/if}
</Modal>
