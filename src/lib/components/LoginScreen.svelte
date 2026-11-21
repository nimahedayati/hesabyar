<script>
	/**
	 * صفحه ورود و راه‌اندازی اولیه.
	 * بار اول: اطلاعات کسب‌وکار + رمز → ساخت کاربر «مدیر» و ورود خودکار.
	 * بارهای بعد: انتخاب کاربر از فهرست و وارد کردن رمز.
	 */
	import { tick } from 'svelte';
	import Icon from './Icon.svelte';
	import { auth, login, setup } from '$lib/auth.svelte.js';

	let step = $state('business');
	let businessName = $state('');
	let phone = $state('');
	let address = $state('');
	let currency = $state('تومان');
	let password = $state('');
	let confirm = $state('');
	let selectedId = $state('');
	let showPassword = $state(false);
	let busy = $state(false);
	let error = $state('');
	let passwordInput = $state();
	let userSelect = $state();

	const setupMode = $derived(!auth.initialized);
	const selectedUser = $derived(auth.users.find((user) => String(user.id) === selectedId) || null);

	async function focusPassword() {
		await tick();
		passwordInput?.focus();
	}

	function selectUser() {
		error = '';
		if (selectedUser) focusPassword();
	}

	$effect(() => {
		if (!setupMode && auth.users.length && !selectedId) {
			tick().then(() => userSelect?.focus());
		}
	});

	function goPassword() {
		if (!businessName.trim()) {
			error = 'نام کسب‌وکار را وارد کنید';
			return;
		}
		error = '';
		step = 'password';
		focusPassword();
	}

	async function submitLogin() {
		if (!selectedUser) {
			error = 'کاربری را که می‌خواهید وارد شود انتخاب کنید';
			return;
		}
		if (!password) {
			error = 'رمز عبور را وارد کنید';
			return;
		}

		busy = true;
		error = '';
		try {
			await login(selectedUser.id, password);
			password = '';
		} catch (e) {
			error = e.message;
			password = '';
			focusPassword();
		} finally {
			busy = false;
		}
	}

	async function submitSetup() {
		if (password.length < 4) {
			error = 'رمز عبور باید حداقل ۴ نویسه باشد';
			return;
		}
		if (password !== confirm) {
			error = 'تکرار رمز عبور یکسان نیست';
			return;
		}

		busy = true;
		error = '';
		try {
			await setup({ businessName, phone, address, currency, password, passwordConfirm: confirm });
			password = '';
			confirm = '';
		} catch (e) {
			error = e.message;
		} finally {
			busy = false;
		}
	}

	function handleSubmit(event) {
		event.preventDefault();
		if (setupMode) {
			if (step === 'business') return goPassword();
			return submitSetup();
		}
		return submitLogin();
	}
</script>

<div class="grid h-screen grid-cols-1 overflow-hidden bg-paper lg:grid-cols-[1fr_500px]">
	<!-- پنل معرفی -->
	<section
		class="relative hidden flex-col justify-between overflow-hidden bg-ink px-12 py-10 text-white lg:flex"
	>
		<div
			class="pointer-events-none absolute -right-24 -top-24 h-[320px] w-[320px] rounded-full opacity-40"
			style="background:radial-gradient(circle, rgba(229,194,92,.35), transparent 65%)"
		></div>
		<div
			class="pointer-events-none absolute -bottom-32 -left-20 h-[380px] w-[380px] rounded-full opacity-30"
			style="background:radial-gradient(circle, rgba(185,142,29,.4), transparent 65%)"
		></div>

		<div class="relative flex items-center gap-3">
			<div class="grid h-11 w-11 place-items-center rounded-[12px] bg-white/10">
				<svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
					<path d="M20 44V20h6v9.2h12V20h6v24h-6v-9.4H26V44h-6z" fill="#e5c25c" />
					<circle cx="46" cy="44" r="3" fill="#b98e1d" />
				</svg>
			</div>
			<div>
				<div class="font-display text-[17px] font-bold leading-tight">حساب‌یار</div>
				<div class="text-[11px] text-white/45">حسابداری فروشگاهی</div>
			</div>
		</div>

		<div class="relative">
			<h1 class="font-display text-[30px] font-bold leading-[1.45]">
				فروش سریع،<br />
				سود <span class="text-gold2">واقعی</span>.
			</h1>
			<p class="mt-3 max-w-[380px] text-[13px] leading-7 text-white/55">
				هر فاکتور، هم‌زمان انبار، صندوق و دفتر کل را به‌روز می‌کند؛ بدون ثبت دوباره و بدون عدد گم‌شده.
			</p>

			<ul class="mt-7 space-y-3 text-[12.5px] text-white/70">
				{#each ['سود بر پایه بهای تمام‌شده میانگین موزون', 'پرداخت ترکیبی با چند کارتخوان و نقدی', 'اصلاح و ابطال با سند معکوس و سابقه کامل'] as item (item)}
					<li class="flex items-center gap-2.5">
						<span
							class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-gold2"
						>
							<Icon name="check" size={12} />
						</span>
						{item}
					</li>
				{/each}
			</ul>
		</div>

		<p class="relative text-[10.5px] text-white/30">نسخه دسکتاپ · اطلاعات روی همین رایانه ذخیره می‌شود</p>
	</section>

	<!-- فرم -->
	<section class="flex items-center justify-center overflow-y-auto px-6 py-8 scroll-thin">
		<div class="w-full max-w-[392px]">
			<div class="mb-7 lg:hidden">
				<div class="font-display text-[18px] font-bold text-ink">حساب‌یار</div>
				<div class="text-[11px] text-muted">حسابداری فروشگاهی</div>
			</div>

			{#if setupMode}
				<div class="mb-6">
					<div class="mb-2 flex items-center gap-2 text-[10.5px] text-muted">
						<span class="rounded-md bg-paper2 px-2 py-0.5">
							گام {step === 'business' ? '۱' : '۲'} از ۲
						</span>
						{#if step === 'password'}
							<button class="text-goldink hover:underline" onclick={() => (step = 'business')}>
								بازگشت
							</button>
						{/if}
					</div>
					<h2 class="font-display text-[21px] font-bold leading-tight text-ink">
						{step === 'business' ? 'خوش آمدید' : 'رمز ورود مدیر'}
					</h2>
					<p class="mt-1.5 text-[12px] leading-6 text-muted">
						{step === 'business'
							? 'برای شروع، نام کسب‌وکار و اطلاعات پایه را وارد کنید.'
							: 'با این رمز، کاربر «مدیر» ساخته می‌شود و می‌توانید کاربران دیگر را اضافه کنید.'}
					</p>
				</div>

				<form onsubmit={handleSubmit} class="space-y-3">
					{#if step === 'business'}
						<div>
							<label class="label" for="setup-name">نام کسب‌وکار</label>
							<input
								id="setup-name"
								class="input"
								bind:value={businessName}
								placeholder="مثلاً سوپرمارکت البرز"
								autocomplete="organization"
							/>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label class="label" for="setup-phone">تلفن</label>
								<input
									id="setup-phone"
									class="input"
									bind:value={phone}
									placeholder="اختیاری"
									inputmode="tel"
								/>
							</div>
							<div>
								<label class="label" for="setup-currency">واحد پول</label>
								<select id="setup-currency" class="input" bind:value={currency}>
									<option value="تومان">تومان</option>
									<option value="ریال">ریال</option>
								</select>
							</div>
						</div>
						<div>
							<label class="label" for="setup-address">نشانی</label>
							<input
								id="setup-address"
								class="input"
								bind:value={address}
								placeholder="اختیاری"
							/>
						</div>

						<button type="submit" class="btn btn-gold btn-lg w-full">
							<Icon name="chevron" size={15} />
							ادامه
						</button>
					{:else}
						<div>
							<label class="label" for="setup-pass">رمز عبور مدیر</label>
							<div class="relative">
								<input
									id="setup-pass"
									bind:this={passwordInput}
									class="input !pl-10"
									type={showPassword ? 'text' : 'password'}
									bind:value={password}
									placeholder="حداقل ۴ نویسه"
									autocomplete="new-password"
								/>
								<button
									type="button"
									class="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-paper2"
									onclick={() => (showPassword = !showPassword)}
									aria-label="نمایش رمز"
								>
									<Icon name={showPassword ? 'eyeOff' : 'eye'} size={15} />
								</button>
							</div>
						</div>
						<div>
							<label class="label" for="setup-pass2">تکرار رمز عبور</label>
							<input
								id="setup-pass2"
								class="input"
								type={showPassword ? 'text' : 'password'}
								bind:value={confirm}
								autocomplete="new-password"
							/>
						</div>

						<button type="submit" class="btn btn-gold btn-lg w-full" disabled={busy}>
							<Icon name="lock" size={15} />
							{busy ? 'در حال آماده‌سازی…' : 'شروع کار'}
						</button>
					{/if}
				</form>
			{:else}
				<div class="mb-6">
					<h2 class="font-display text-[21px] font-bold leading-tight text-ink">
						ورود به {auth.businessName}
					</h2>
					<p class="mt-1.5 text-[12px] text-muted">کاربر خود را انتخاب و رمز عبور را وارد کنید.</p>
				</div>

				<div class="mb-4">
					<label class="label" for="login-user">کاربر</label>
					<div class="relative">
						<span
							class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
						>
							<Icon name="user" size={16} />
						</span>
						<select
							id="login-user"
							bind:this={userSelect}
							class="input !h-11 !pr-10 !text-[13.5px]"
							bind:value={selectedId}
							onchange={selectUser}
						>
							<option value="">انتخاب کاربر…</option>
							{#each auth.users as user (user.id)}
								<option value={String(user.id)}>{user.name}</option>
							{/each}
						</select>
					</div>
				</div>

				<form onsubmit={handleSubmit} class="space-y-3">
					<div>
						<label class="label" for="login-pass">رمز عبور</label>
						<div class="relative">
							<input
								id="login-pass"
								bind:this={passwordInput}
								class="input !pl-10"
								type={showPassword ? 'text' : 'password'}
								bind:value={password}
								placeholder={selectedUser
									? `رمز ${selectedUser.name}`
									: 'ابتدا کاربر را انتخاب کنید'}
								disabled={!selectedUser || busy}
								autocomplete="current-password"
							/>
							<button
								type="button"
								class="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-paper2"
								onclick={() => (showPassword = !showPassword)}
								aria-label="نمایش رمز"
							>
								<Icon name={showPassword ? 'eyeOff' : 'eye'} size={15} />
							</button>
						</div>
					</div>

					<button type="submit" class="btn btn-gold btn-lg w-full" disabled={!selectedUser || busy}>
						<Icon name="logout" size={15} />
						{busy ? 'در حال ورود…' : 'ورود به برنامه'}
					</button>
				</form>
			{/if}

			{#if error || auth.error}
				<div
					class="mt-3 flex items-start gap-2 rounded-lg border border-[#f3c9c9] bg-[#fff5f5] px-3 py-2 text-[11.5px] leading-6 text-[#a12c2c]"
				>
					<span class="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span>
					<span>{error || auth.error}</span>
				</div>
			{/if}

			{#if !setupMode}
				<p class="mt-6 text-center text-[10.5px] leading-5 text-muted2">
					رمز عبور به‌صورت درهم‌سازی‌شده ذخیره می‌شود و قابل بازیابی نیست.
				</p>
			{/if}
		</div>
	</section>
</div>
