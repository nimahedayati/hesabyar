<script>
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import NumInput from '$lib/components/NumInput.svelte';
	import TreasuryPanel from '$lib/components/settings/TreasuryPanel.svelte';
	import NameListPanel from '$lib/components/settings/NameListPanel.svelte';
	import AccountPanel from '$lib/components/settings/AccountPanel.svelte';
	import UsersPanel from '$lib/components/settings/UsersPanel.svelte';
	import DataPanel from '$lib/components/settings/DataPanel.svelte';
	import { api } from '$lib/api.js';
	import { session, refreshCategories, refreshWarehouses } from '$lib/session.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { fmt, todayISO, faDate, faTime, DOC_LABELS } from '$lib/format.js';

	const TABS = [
		['general', 'عمومی'],
		['cash', 'صندوق'],
		['bank', 'بانک'],
		['terminal', 'کارتخوان'],
		['warehouse', 'انبار'],
		['category', 'گروه کالا'],
		['accounts', 'حساب‌ها'],
		['users', 'کاربران'],
		['data', 'داده‌ها']
	];

	const POLICIES = [
		['block', 'ممنوع', 'اگر موجودی کافی نباشد، فروش ثبت نمی‌شود'],
		['warn', 'هشدار', 'اجازه فروش با هشدار داده می‌شود'],
		['allow', 'آزاد', 'فروش بدون موجودی مجاز است']
	];

	// برچسب فارسی موجودیت‌های ثبت‌شده در گزارش رویدادها
	const ENTITY_LABELS = {
		product: 'کالا',
		party: 'شخص',
		treasury: 'خزانه',
		category: 'گروه کالا',
		warehouse: 'انبار',
		account: 'حساب',
		settings: 'تنظیمات',
		document: 'سند'
	};
	const entityLabel = (entity) => ENTITY_LABELS[entity] || DOC_LABELS[entity] || entity;

	const FORM_DEFAULTS = {
		business_name: '',
		business_phone: '',
		business_address: '',
		currency: 'تومان',
		tax_rate: 0,
		stock_policy: 'warn',
		fiscal_start: todayISO()
	};

	let tab = $state('general');
	let form = $state({ ...FORM_DEFAULTS });
	let saving = $state(false);
	let audit = $state([]);

	onMount(async () => {
		form = { ...FORM_DEFAULTS, ...session.settings };
		audit = await api('audit.list', { limit: 12 });
	});

	async function saveGeneral() {
		saving = true;
		try {
			session.settings = await api('settings.save', {
				business_name: form.business_name,
				business_phone: form.business_phone,
				business_address: form.business_address,
				currency: form.currency,
				tax_rate: form.tax_rate,
				stock_policy: form.stock_policy,
				fiscal_start: form.fiscal_start
			});
			toast('تنظیمات ذخیره شد');
		} catch (error) {
			toast(error.message, 'err');
		} finally {
			saving = false;
		}
	}

	async function saveCategory(payload) {
		await api('categories.save', payload);
		await refreshCategories();
		toast('گروه کالا ذخیره شد');
	}

	async function removeCategory(item) {
		try {
			await api('categories.remove', { id: item.id });
			await refreshCategories();
			toast('گروه حذف شد');
		} catch (error) {
			toast(error.message, 'err', 5000);
		}
	}

	async function saveWarehouse(payload) {
		await api('warehouses.save', payload);
		await refreshWarehouses();
		toast('انبار ذخیره شد');
	}
</script>

<div class="mx-auto max-w-[1000px] px-6 py-5">
	<div class="mb-4 flex flex-wrap gap-1">
		{#each TABS as [key, label] (key)}
			<button class="chip {tab === key ? 'active' : ''}" onclick={() => (tab = key)}>{label}</button>
		{/each}
	</div>

	{#if tab === 'general'}
		<div class="card card-pad mb-3">
			<h2 class="mb-4 text-[14px] font-bold text-ink">اطلاعات کسب‌وکار</h2>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="label" for="s-name">نام فروشگاه</label>
					<input id="s-name" class="input" bind:value={form.business_name} />
				</div>
				<div>
					<label class="label" for="s-cur">واحد پول</label>
					<input id="s-cur" class="input" bind:value={form.currency} />
				</div>
				<div>
					<label class="label" for="s-tax">نرخ مالیات پیش‌فرض (٪)</label>
					<NumInput id="s-tax" bind:value={form.tax_rate} />
				</div>
				<div>
					<label class="label" for="s-fiscal">شروع دوره مالی</label>
					<DateInput id="s-fiscal" bind:value={form.fiscal_start} />
				</div>
				<div>
					<label class="label" for="s-phone">تلفن</label>
					<input
						id="s-phone"
						class="input"
						bind:value={form.business_phone}
						placeholder="اختیاری"
					/>
				</div>
				<div>
					<label class="label" for="s-address">نشانی</label>
					<input
						id="s-address"
						class="input"
						bind:value={form.business_address}
						placeholder="اختیاری"
					/>
				</div>
			</div>
		</div>

		<div class="card card-pad mb-3">
			<h2 class="mb-1 text-[14px] font-bold text-ink">سیاست موجودی منفی</h2>
			<p class="mb-3 text-[11.5px] text-muted">
				تعیین کنید هنگام فروش کالای بدون موجودی چه اتفاقی بیفتد.
			</p>
			<div class="grid grid-cols-3 gap-2">
				{#each POLICIES as [key, label, description] (key)}
					<button
						class="rounded-xl border p-3 text-right transition {form.stock_policy === key
							? 'border-gold bg-[#fdf8ec]'
							: 'border-line bg-white hover:border-line2'}"
						onclick={() => (form.stock_policy = key)}
					>
						<div class="flex items-center justify-between">
							<span class="text-[12.5px] font-medium text-ink">{label}</span>
							{#if form.stock_policy === key}<span class="text-gold">
									<Icon name="checkCircle" size={15} />
								</span>{/if}
						</div>
						<p class="mt-1 text-[10.5px] leading-5 text-muted">{description}</p>
					</button>
				{/each}
			</div>
		</div>

		<div class="mb-3 flex justify-end">
			<button class="btn btn-primary" onclick={saveGeneral} disabled={saving}>
				<Icon name="save" size={15} />
				{saving ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}
			</button>
		</div>

		<div class="card card-pad mt-3">
			<h2 class="mb-3 text-[14px] font-bold text-ink">آخرین عملیات</h2>
			<div class="space-y-1.5">
				{#each audit as entry (entry.id)}
					<div
						class="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-[11.5px]"
					>
						<span class="text-ink2">
							<b class="font-medium text-ink">{entry.action}</b>
							— {entityLabel(entry.entity)}
							{entry.entity_id ? fmt(entry.entity_id) : ''}
							{#if entry.user_name}<span class="text-muted2"> · {entry.user_name}</span>{/if}
						</span>
						<span class="num text-muted2">
							{faDate(entry.created_at, 'full')}
							{faTime(entry.created_at)}
						</span>
					</div>
				{/each}
				{#if !audit.length}<p class="py-4 text-center text-[12px] text-muted2">
						عملیاتی ثبت نشده
					</p>{/if}
			</div>
		</div>
	{:else if tab === 'cash'}
		<TreasuryPanel kind="cash" />
	{:else if tab === 'bank'}
		<TreasuryPanel kind="bank" />
	{:else if tab === 'terminal'}
		<TreasuryPanel kind="terminal" />
	{:else if tab === 'warehouse'}
		<NameListPanel
			title="انبارها"
			icon="warehouse"
			items={session.warehouses}
			addLabel="انبار جدید"
			placeholder="نام انبار"
			onsave={saveWarehouse}
		/>
	{:else if tab === 'category'}
		<NameListPanel
			title="گروه‌های کالا"
			icon="layers"
			items={session.categories}
			addLabel="گروه جدید"
			placeholder="نام گروه"
			onsave={saveCategory}
			onremove={removeCategory}
		/>
	{:else if tab === 'accounts'}
		<AccountPanel />
	{:else if tab === 'users'}
		<UsersPanel />
	{:else if tab === 'data'}
		<DataPanel />
	{/if}
</div>
