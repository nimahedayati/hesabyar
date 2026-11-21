<script>
	/**
	 * صفحه فروش: شبکه کالاها بخش اصلی صفحه است و «دسترسی سریع» فقط یک نوار باریک.
	 * تعداد هر ردیف با قواعد واحد کالا کنترل می‌شود (عدد صحیح یا اعشاری).
	 */
	import { onMount, tick } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NumInput from '$lib/components/NumInput.svelte';
	import QuantityInput from '$lib/components/QuantityInput.svelte';
	import PartyPicker from '$lib/components/PartyPicker.svelte';
	import PaymentEditor from '$lib/components/PaymentEditor.svelte';
	import { api } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, todayISO } from '$lib/format.js';
	import {
		addLine,
		removeLine,
		changeQty,
		setQty,
		cartTotals,
		totalQuantity,
		lineNet
	} from '$lib/domain/cart.js';
	import { createPayment, remainingOf, validatePayments, toPayload } from '$lib/domain/payment.js';

	const PAGE_SIZE = 60;
	const SEARCH_DEBOUNCE = 200;

	let query = $state('');
	let categoryId = $state(null);
	let favoritesOnly = $state(true);
	let products = $state([]);
	let total = $state(0);
	let loading = $state(true);

	let cart = $state([]);
	let partyId = $state(null);
	let discount = $state(0);
	let note = $state('');
	let payOpen = $state(false);
	let payments = $state([]);
	let saving = $state(false);
	let searchInput;

	const currency = $derived(session.settings?.currency || 'تومان');
	const treasuries = $derived(session.treasuries || []);
	const totals = $derived(cartTotals(cart, discount));
	const remaining = $derived(remainingOf(totals.total, payments));
	const cartCount = $derived(cart.length);
	const hasMore = $derived(products.length < total);

	async function loadProducts({ append = false } = {}) {
		loading = !append;
		try {
			const result = await api('products.list', {
				q: query.trim(),
				categoryId,
				favorites: favoritesOnly,
				limit: PAGE_SIZE,
				offset: append ? products.length : 0
			});
			products = append ? [...products, ...result.rows] : result.rows;
			total = result.total;
		} catch (error) {
			toast(error.message, 'err');
			products = [];
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		await loadProducts();
		await tick();
		searchInput?.focus();
	});

	$effect(() => {
		query;
		categoryId;
		favoritesOnly;
		const timer = setTimeout(() => loadProducts(), SEARCH_DEBOUNCE);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (discount > totals.subtotal) discount = totals.subtotal;
	});

	/** «سریع» یک فیلتر است، نه یک دسته واقعی: با انتخابش دسته صفر می‌شود */
	function toggleFavorites() {
		favoritesOnly = !favoritesOnly;
		if (favoritesOnly) categoryId = null;
	}

	function selectCategory(id) {
		favoritesOnly = false;
		categoryId = categoryId === id ? null : id;
	}

	function addProduct(product) {
		cart = addLine(cart, product);
		query = '';
		tick().then(() => searchInput?.focus());
	}

	function updateQty(productId, value) {
		cart = cart.map((line) => (line.productId === productId ? setQty(line, value) : line));
	}

	function stepQty(productId, direction) {
		cart = cart.map((line) => (line.productId === productId ? changeQty(line, direction) : line));
	}

	async function handleSearchKey(event) {
		if (event.key !== 'Enter') return;
		const term = query.trim();
		if (!term) return;

		const scanned = await api('products.byBarcode', { barcode: term });
		if (scanned) return addProduct(scanned);

		const exact = products.find((product) => product.name === term);
		if (exact) return addProduct(exact);
		if (products.length === 1) addProduct(products[0]);
	}

	function resetSale() {
		cart = [];
		discount = 0;
		note = '';
		partyId = null;
	}

	function openPayment() {
		if (!cart.length) return toast('سبد فروش خالی است', 'warn');
		payments = [{ ...createPayment('cash', treasuries), amount: totals.total }];
		payOpen = true;
	}

	async function submitSale() {
		const paymentError = validatePayments(totals.total, payments);
		if (paymentError) return toast(paymentError, 'err');
		if (remaining > 0.5 && !partyId) return toast('برای بخش نسیه، مشتری را انتخاب کنید', 'warn');

		saving = true;
		try {
			await api('docs.sale', {
				date: todayISO(),
				partyId,
				discount,
				note,
				lines: cart.map((line) => ({
					productId: line.productId,
					qty: line.qty,
					unitPrice: line.unitPrice,
					discount: line.discount || 0
				})),
				payments: toPayload(payments)
			});
			toast(`فاکتور به مبلغ ${fmt(totals.total)} ${currency} ثبت شد`);
			payOpen = false;
			resetSale();
			await loadProducts();
			tick().then(() => searchInput?.focus());
		} catch (error) {
			toast(error.message, 'err', 5000);
		} finally {
			saving = false;
		}
	}

	function handleShortcut(event) {
		if (event.key === 'F4' && !payOpen) {
			event.preventDefault();
			openPayment();
		}
		if (event.key === 'F3') {
			event.preventDefault();
			searchInput?.focus();
		}
	}
</script>

<svelte:window onkeydown={handleShortcut} />

<div class="flex h-full min-h-0 bg-paper">
	<!-- کالاها: بخش اصلی صفحه -->
	<section class="flex min-w-0 flex-1 flex-col">
		<div class="shrink-0 border-b border-line bg-panel px-4 py-3">
			<div class="flex items-center gap-2">
				<div class="relative flex-1">
					<span class="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">
						<Icon name="scan" size={18} />
					</span>
					<input
						bind:this={searchInput}
						bind:value={query}
						onkeydown={handleSearchKey}
						class="input !h-11 !rounded-xl !pr-11 !text-[14px] shadow-[0_2px_10px_-8px_rgba(13,21,34,.25)]"
						placeholder="بارکد را اسکن کنید یا نام کالا را بنویسید…"
						autocomplete="off"
						spellcheck="false"
					/>
					{#if query}
						<button
							class="absolute left-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-paper2"
							onclick={() => {
								query = '';
								searchInput?.focus();
							}}
							aria-label="پاک کردن جست‌وجو"
						>
							<Icon name="x" size={13} />
						</button>
					{:else}
						<span
							class="pointer-events-none absolute left-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md bg-paper2 px-1.5 py-0.5 text-[10px] text-muted lg:flex"
						>
							<Icon name="keyboard" size={11} /> F3
						</span>
					{/if}
				</div>
				<div
					class="hidden shrink-0 items-center gap-1.5 rounded-xl border border-line bg-paper px-3 py-2 text-[11.5px] text-muted md:flex"
				>
					<Icon name="box" size={14} />
					<span class="num text-ink">{fmt(total)}</span>
					کالا
				</div>
			</div>

			<div class="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 scroll-thin">
				<button class="chip {favoritesOnly ? 'active' : ''}" onclick={toggleFavorites}>
					<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
						<path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.5l-5.4 2.9 1-6.1L3.2 10l6.1-.9z" />
					</svg>
					سریع
				</button>
				<button
					class="chip {!favoritesOnly && categoryId === null ? 'active' : ''}"
					onclick={() => {
						favoritesOnly = false;
						categoryId = null;
					}}
				>
					همه
				</button>
				{#each session.categories as category (category.id)}
					<button
						class="chip {!favoritesOnly && categoryId === category.id ? 'active' : ''}"
						onclick={() => selectCategory(category.id)}
					>
						{category.name}
					</button>
				{/each}
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto p-3 scroll-thin">
			{#if loading}
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as skeleton (skeleton)}
						<div class="skeleton h-[92px] rounded-xl"></div>
					{/each}
				</div>
			{:else if products.length === 0}
				<div class="flex h-full flex-col items-center justify-center gap-2 text-muted2">
					<Icon name={favoritesOnly ? 'star' : 'search'} size={30} />
					{#if favoritesOnly}
						<p class="text-[13px]">هنوز کالای سریعی ستاره‌دار نشده است</p>
						<p class="max-w-[280px] text-center text-[11px] leading-6 text-muted2">
							در صفحه کالاها، کالاهای پرمصرف را ستاره‌دار کنید تا اینجا بیایند.
						</p>
					{:else}
						<p class="text-[13px]">کالایی با این مشخصات پیدا نشد</p>
					{/if}
					{#if query || categoryId || favoritesOnly}
						<button
							class="btn btn-soft btn-sm mt-1"
							onclick={() => {
								query = '';
								categoryId = null;
								favoritesOnly = false;
							}}
						>
							حذف فیلترها
						</button>
					{/if}
				</div>
			{:else}
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{#each products as product (product.id)}
						{@const inCart = cart.find((line) => line.productId === product.id)}
						<button
							class="product-card group relative flex h-[92px] flex-col justify-between rounded-xl border border-line bg-panel p-2.5 text-right transition
							hover:-translate-y-0.5 hover:border-gold hover:shadow-[0_10px_22px_-14px_rgba(13,21,34,.4)]
							{inCart ? 'border-gold/60 bg-[#fdfaf1]' : ''}"
							onclick={() => addProduct(product)}
						>
							{#if inCart}
								<span
									class="absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-md bg-gold px-1 text-[10px] font-bold text-white"
								>
									{fmt(inCart.qty)}
								</span>
							{/if}
							<div class="line-clamp-2 pl-1 text-[12.5px] font-medium leading-[1.6] text-ink">
								{product.name}
							</div>
							<div class="flex items-end justify-between gap-1">
								<span class="num text-[13px] text-ink">{fmt(product.sale_price)}</span>
								<span class="text-[10px] text-muted2">{product.unit}</span>
							</div>
							<div class="mt-0.5 flex items-center gap-1">
								<span
									class="rounded px-1 py-0.5 text-[9.5px] {product.stock_qty <= 0
										? 'bg-[#fdecec] text-neg'
										: product.stock_qty <= product.min_stock
											? 'bg-[#fdf5e6] text-warn'
											: 'bg-paper2 text-muted'}"
								>
									موجودی {fmt(product.stock_qty)}
								</span>
							</div>
						</button>
					{/each}
				</div>

				{#if hasMore}
					<div class="mt-3 flex justify-center">
						<button class="btn btn-soft btn-sm" onclick={() => loadProducts({ append: true })}>
							نمایش کالاهای بیشتر ({fmt(total - products.length)})
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</section>

	<!-- سبد فروش -->
	<aside class="flex w-[368px] shrink-0 flex-col border-r border-line bg-panel">
		<div class="flex items-center justify-between border-b border-line px-4 py-2.5">
			<div>
				<h2 class="font-display text-[13.5px] font-bold text-ink">فاکتور جاری</h2>
				<p class="text-[10.5px] text-muted">
					{#if cartCount}
						{fmt(cartCount)} ردیف · {fmt(totalQuantity(cart))} واحد
					{:else}
						سبد خالی است
					{/if}
				</p>
			</div>
			<button
				class="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-paper2 hover:text-neg disabled:opacity-40"
				onclick={resetSale}
				disabled={!cartCount}
				title="خالی کردن سبد"
			>
				<Icon name="trash" size={14} />
			</button>
		</div>

		<div class="border-b border-line px-4 py-2">
			<PartyPicker bind:value={partyId} placeholder="مشتری متفرقه (نقدی)" />
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto scroll-thin">
			{#if !cartCount}
				<div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
					<div class="grid h-12 w-12 place-items-center rounded-full bg-paper2 text-muted2">
						<Icon name="cart" size={22} />
					</div>
					<p class="text-[12.5px] text-muted">کالا را اسکن کنید یا از شبکه انتخاب کنید</p>
					<p class="text-[10.5px] text-muted2">Enter افزودن · F4 پرداخت</p>
				</div>
			{:else}
				{#each cart as line (line.productId)}
					<div class="border-b border-line px-3 py-2 transition hover:bg-paper/50">
						<div class="flex items-start gap-2">
							<div class="min-w-0 flex-1">
								<div class="truncate text-[12.5px] font-medium text-ink">{line.name}</div>

								<div class="mt-1.5 flex items-center gap-1.5">
									<div
										class="flex items-center overflow-hidden rounded-lg border border-line"
									>
										<button
											class="grid h-6 w-6 place-items-center text-muted transition hover:bg-paper2 hover:text-ink"
											onclick={() => stepQty(line.productId, -1)}
											aria-label="کاهش"
										>
											<Icon name="minus" size={11} />
										</button>
										<QuantityInput
											value={line.qty}
											unit={line.unit}
											onchange={(value) => updateQty(line.productId, value)}
											class="h-6 w-11 border-x border-line bg-white text-center text-[11.5px] outline-none"
										/>
										<button
											class="grid h-6 w-6 place-items-center text-muted transition hover:bg-paper2 hover:text-ink"
											onclick={() => stepQty(line.productId, 1)}
											aria-label="افزایش"
										>
											<Icon name="plus" size={11} />
										</button>
									</div>
									<span class="text-[10px] text-muted2">{line.unit}</span>
									<span class="text-[10.5px] text-muted2">×</span>
									<NumInput
										bind:value={line.unitPrice}
										class="h-6 w-[74px] rounded-md border border-transparent bg-paper px-1.5 text-[11.5px] text-ink2 outline-none transition focus:border-gold focus:bg-white"
									/>
								</div>

								{#if line.stock < line.qty}
									<div class="mt-1 text-[10px] text-warn">
										موجودی انبار {fmt(line.stock)} — فروش بیشتر ثبت می‌شود
									</div>
								{/if}
							</div>

							<div class="flex shrink-0 flex-col items-end gap-1">
								<span class="num text-[12.5px] text-ink">{fmt(lineNet(line))}</span>
								<button
									class="text-muted2 transition hover:text-neg"
									onclick={() => (cart = removeLine(cart, line.productId))}
									aria-label="حذف ردیف"
								>
									<Icon name="x" size={12} />
								</button>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<div class="border-t border-line bg-paper/50 px-4 py-3">
			<div class="mb-1.5 flex items-center justify-between text-[12px]">
				<span class="text-muted">جمع اقلام</span>
				<span class="num text-ink2">{fmt(totals.subtotal)}</span>
			</div>

			<div class="mb-2 flex items-center justify-between gap-2">
				<span class="text-[12px] text-muted">تخفیف</span>
				<NumInput bind:value={discount} class="input !h-7 w-[96px] !px-2 !text-[12px]" align="left" />
			</div>

			<div class="mb-2.5 flex items-end justify-between border-t border-dashed border-line2 pt-2">
				<span class="text-[12px] font-medium text-ink2">مبلغ قابل پرداخت</span>
				<div class="text-left">
					<div class="num text-[21px] leading-none text-ink">{fmt(totals.total)}</div>
					<div class="text-[10px] text-muted">{currency}</div>
				</div>
			</div>

			<button class="btn btn-gold btn-lg w-full" onclick={openPayment} disabled={!cartCount}>
				<Icon name="creditCard" size={16} />
				پرداخت و ثبت فاکتور
				<span class="mr-1 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px]">F4</span>
			</button>
		</div>
	</aside>
</div>

<Modal
	open={payOpen}
	title="پرداخت فاکتور"
	subtitle="می‌توانید مبلغ را بین چند روش و چند کارتخوان تقسیم کنید"
	onclose={() => (payOpen = false)}
	size="md"
>
	<div class="mb-4 flex items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3.5">
		<span class="shrink-0 text-[11.5px] text-white/50">مبلغ فاکتور</span>
		<span class="flex items-baseline gap-1.5">
			<span class="num text-[23px] leading-none text-white">{fmt(totals.total)}</span>
			<span class="text-[10px] text-white/40">{currency}</span>
		</span>
	</div>

	<PaymentEditor bind:payments total={totals.total} {treasuries} {currency} />

	<div class="mt-3 rounded-xl border border-line px-4 py-3">
		<div class="text-[11.5px]">
			<div class="text-muted">وضعیت تسویه</div>
			<div class="mt-1">
				{#if remaining > 0.5}
					{#if partyId}
						<span class="tag tag-warn">نسیه — ثبت طلب از مشتری</span>
					{:else}
						<span class="tag tag-neg">مشتری انتخاب نشده</span>
					{/if}
				{:else if remaining < -0.5}
					<span class="tag tag-neg">مبلغ بیشتر از فاکتور</span>
				{:else}
					<span class="tag tag-pos">تسویه کامل</span>
				{/if}
			</div>
		</div>
	</div>

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (payOpen = false)}>انصراف</button>
		<button class="btn btn-gold" onclick={submitSale} disabled={saving}>
			{saving ? 'در حال ثبت…' : 'ثبت فاکتور'}
		</button>
	{/snippet}
</Modal>
