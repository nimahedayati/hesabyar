<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import LoginScreen from '$lib/components/LoginScreen.svelte';
	import { session, loadSession, resetSession } from '$lib/session.svelte.js';
	import { auth, loadAuth, logout, homeOf } from '$lib/auth.svelte.js';
	import { faDate } from '$lib/format.js';

	let { children } = $props();

	const NAV = [
		{
			label: 'عملیات روزانه',
			items: [
				{ href: '/', icon: 'dashboard', text: 'داشبورد' },
				{ href: '/pos', icon: 'cart', text: 'صفحه فروش', badge: 'F2' }
			]
		},
		{
			label: 'خرید و برگشت',
			items: [
				{ href: '/purchases', icon: 'truck', text: 'فاکتور خرید' },
				{ href: '/returns', icon: 'undo', text: 'برگشت از فروش/خرید' }
			]
		},
		{
			label: 'کسب‌وکار',
			items: [
				{ href: '/invoices', icon: 'receipt', text: 'اسناد و فاکتورها' },
				{ href: '/products', icon: 'box', text: 'کالاها و انبار' },
				{ href: '/parties', icon: 'users', text: 'اشخاص' }
			]
		},
		{
			label: 'مالی',
			items: [
				{ href: '/treasury', icon: 'bank', text: 'خزانه و چک' },
				{ href: '/journal', icon: 'file', text: 'سند حسابداری' },
				{ href: '/opening', icon: 'layers', text: 'موجودی اولیه' },
				{ href: '/reports', icon: 'chart', text: 'گزارش‌ها' }
			]
		}
	];

	const TITLES = {
		'/': ['داشبورد مدیریتی', 'نمای کلی وضعیت فروشگاه'],
		'/pos': ['صفحه فروش', 'ثبت سریع فاکتور'],
		'/purchases': ['فاکتور خرید', 'ثبت خرید از تأمین‌کننده'],
		'/returns': ['برگشت از فروش و خرید', 'اصلاح فاکتورهای قبلی'],
		'/invoices': ['اسناد و فاکتورها', 'فروش، خرید، دریافت و پرداخت'],
		'/products': ['کالاها و انبار', 'مدیریت کالا، موجودی و بهای تمام‌شده'],
		'/parties': ['اشخاص', 'مشتریان و تأمین‌کنندگان'],
		'/treasury': ['خزانه و چک', 'بانک، صندوق و چک‌ها'],
		'/journal': ['سند حسابداری دستی', 'ثبت سند بدهکار/بستانکار'],
		'/opening': ['موجودی اولیه', 'مانده آغازین کالا، خزانه و اشخاص'],
		'/reports': ['گزارش‌ها', 'تحلیل فروش، سود و جریان نقدی'],
		'/settings': ['تنظیمات', 'پیکربندی نرم‌افزار']
	};

	const current = $derived(page.url.pathname.replace(/\/$/, '') || '/');
	const title = $derived(TITLES[current]?.[0] ?? 'حساب‌یار');
	const subtitle = $derived(TITLES[current]?.[1] ?? '');
	const today = $derived(faDate(new Date().toISOString().slice(0, 10), 'long'));
	const isCashier = $derived(auth.user?.role === 'cashier');

	let loadedFor = null;

	onMount(() => {
		loadAuth();
		const onKey = (e) => {
			if (e.key === 'F2' && auth.user) {
				e.preventDefault();
				if (current !== '/pos') goto('/pos');
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// پس از هر ورود، داده‌های سبک برنامه یک‌بار بارگذاری می‌شوند
	$effect(() => {
		const id = auth.user?.id ?? null;
		if (id && id !== loadedFor) {
			loadedFor = id;
			loadSession();
		}
	});

	// صندوق‌دار فقط صفحه فروش را می‌بیند
	$effect(() => {
		if (!auth.user) return;
		const home = homeOf(auth.user);
		if (auth.user.role === 'cashier' && current !== home) goto(home);
	});

	async function handleLogout() {
		await logout();
		resetSession();
		loadedFor = null;
		await loadAuth();
	}

	const isActive = (href) => (href === '/' ? current === '/' : current.startsWith(href));
</script>

{#if !auth.ready}
	<div class="grid h-screen place-items-center bg-paper">
		<div class="flex flex-col items-center gap-3">
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold"></div>
			<span class="text-[12px] text-muted">در حال آماده‌سازی…</span>
		</div>
	</div>
{:else if !auth.user}
	<LoginScreen />
{:else if isCashier}
	<!-- صندوق‌دار: بدون سایدبار، مستقیم روی صفحه فروش -->
	<div class="flex h-screen w-full flex-col overflow-hidden bg-paper">
		<header
			class="flex h-[46px] shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-4"
		>
			<div class="flex min-w-0 items-center gap-2.5">
				<div class="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink">
					<svg width="14" height="14" viewBox="0 0 64 64" aria-hidden="true">
						<path d="M20 44V20h6v9.2h12V20h6v24h-6v-9.4H26V44h-6z" fill="#e5c25c" />
					</svg>
				</div>
				<span class="truncate font-display text-[13px] font-bold text-ink">
					{session.settings?.business_name || auth.businessName}
				</span>
				<span class="hidden rounded-md bg-paper2 px-1.5 py-0.5 text-[10px] text-muted sm:inline">
					صندوق‌دار
				</span>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<span class="hidden text-[11.5px] text-ink2 sm:inline">{auth.user.name}</span>
				<button class="btn btn-ghost btn-sm" onclick={handleLogout} title="خروج از حساب">
					<Icon name="logout" size={14} />
					خروج
				</button>
			</div>
		</header>

		<main class="min-h-0 flex-1 overflow-hidden">
			{#if session.error}
				<div
					class="m-6 rounded-xl border border-[#f3c9c9] bg-[#fff5f5] px-4 py-3 text-[13px] text-[#a12c2c]"
				>
					خطا در بارگذاری اطلاعات: {session.error}
				</div>
			{:else if !session.ready}
				<div class="grid h-full place-items-center">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold"></div>
				</div>
			{:else if current !== '/pos'}
				<!-- مسیر غیرمجاز حتی یک لحظه هم رندر نمی‌شود تا درخواستی به سرویس نرود -->
				<div class="grid h-full place-items-center">
					<div class="flex flex-col items-center gap-2 text-muted">
						<div
							class="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-gold"
						></div>
						<span class="text-[12px]">در حال انتقال به صفحه فروش…</span>
					</div>
				</div>
			{:else}
				{@render children()}
			{/if}
		</main>
	</div>
{:else}
	<div class="flex h-screen w-full overflow-hidden bg-paper">
		<!-- نوار کناری -->
		<aside class="flex w-[226px] shrink-0 flex-col border-l border-line bg-panel">
			<div class="flex items-center gap-2.5 px-5 pb-4 pt-5">
				<div
					class="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-ink"
					style="box-shadow:0 6px 16px -8px rgba(13,21,34,.7)"
				>
					<svg width="19" height="19" viewBox="0 0 64 64" aria-hidden="true">
						<path d="M20 44V20h6v9.2h12V20h6v24h-6v-9.4H26V44h-6z" fill="#e5c25c" />
						<circle cx="46" cy="44" r="3" fill="#b98e1d" />
					</svg>
				</div>
				<div class="min-w-0">
					<div class="font-display text-[15px] font-bold leading-tight text-ink">حساب‌یار</div>
					<div class="truncate text-[10.5px] text-muted">
						{session.settings?.business_name || 'حسابداری فروشگاهی'}
					</div>
				</div>
			</div>

			<nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-2 scroll-thin">
				{#each NAV as group}
					<div class="mb-1 mt-3 px-2 text-[10.5px] font-medium tracking-wide text-muted">
						{group.label}
					</div>
					{#each group.items as it}
						<a
							href={it.href}
							class="group mb-0.5 flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] transition
							{isActive(it.href)
								? 'bg-ink font-medium text-white shadow-[0_6px_16px_-10px_rgba(13,21,34,.8)]'
								: 'text-ink2 hover:bg-paper2'}"
						>
							<span
								class={isActive(it.href) ? 'text-gold2' : 'text-muted group-hover:text-ink2'}
							>
								<Icon name={it.icon} size={17} />
							</span>
							<span class="flex-1">{it.text}</span>
							{#if it.badge}
								<span
									class="rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-medium
									{isActive(it.href) ? 'bg-white/15 text-white/70' : 'bg-paper2 text-muted2'}"
								>
									{it.badge}
								</span>
							{/if}
						</a>
					{/each}
				{/each}
			</nav>

			<div class="border-t border-line p-3">
				<a
					href="/settings"
					class="mb-1 flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] text-ink2 transition hover:bg-paper2"
				>
					<span class="text-muted"><Icon name="settings" size={17} /></span>
					تنظیمات
				</a>
				<div class="mt-2 flex items-center gap-2.5 rounded-[9px] bg-paper px-2.5 py-2">
					<div
						class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-gold2"
					>
						{(auth.user.name || 'م').charAt(0)}
					</div>
					<div class="min-w-0 flex-1">
						<div class="truncate text-[12px] font-medium text-ink">{auth.user.name}</div>
						<div class="text-[10px] text-muted">{auth.user.roleLabel}</div>
					</div>
					<button
						class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-paper2 hover:text-neg"
						onclick={handleLogout}
						title="خروج از حساب"
						aria-label="خروج از حساب"
					>
						<Icon name="logout" size={14} />
					</button>
				</div>
			</div>
		</aside>

		<!-- محتوا -->
		<div class="flex min-w-0 flex-1 flex-col">
			<header
				class="flex h-[58px] shrink-0 items-center justify-between gap-4 border-b border-line bg-paper/80 px-6 backdrop-blur-md"
			>
				<div class="min-w-0">
					<h1 class="truncate font-display text-[17px] font-bold leading-tight text-ink">
						{title}
					</h1>
					<p class="truncate text-[11.5px] text-muted">{subtitle}</p>
				</div>

				<div class="flex shrink-0 items-center gap-2.5">
					<div
						class="hidden items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[11.5px] text-ink2 lg:flex"
					>
						<Icon name="calendar" size={13} class="text-muted" />
						{today}
					</div>
					{#if current !== '/pos'}
						<button class="btn btn-gold" onclick={() => goto('/pos')}>
							<Icon name="cart" size={15} />
							فروش سریع
						</button>
					{/if}
				</div>
			</header>

			<main
				class="min-h-0 flex-1 {current === '/pos'
					? 'overflow-hidden'
					: 'overflow-y-auto scroll-thin'}"
			>
				{#if session.error}
					<div
						class="m-6 rounded-xl border border-[#f3c9c9] bg-[#fff5f5] px-4 py-3 text-[13px] text-[#a12c2c]"
					>
						خطا در بارگذاری اطلاعات: {session.error}
					</div>
				{:else if !session.ready}
					<div class="grid h-full place-items-center">
						<div class="flex flex-col items-center gap-3">
							<div
								class="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold"
							></div>
							<span class="text-[12px] text-muted">در حال آماده‌سازی…</span>
						</div>
					</div>
				{:else}
					{@render children()}
				{/if}
			</main>
		</div>
	</div>
{/if}

<Toasts />
