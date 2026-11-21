<script>
	/**
	 * پشتیبان‌گیری و عملیات حساس روی داده‌ها.
	 * قاعده: تا نسخه پشتیبان در همین نشست گرفته نشود، هیچ حذفی ممکن نیست.
	 * بررسی نهایی هم سمت فرایند اصلی تکرار می‌شود.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api.js';
	import { toast } from '$lib/ui.svelte.js';
	import { auth, loadAuth } from '$lib/auth.svelte.js';
	import { resetSession } from '$lib/session.svelte.js';
	import { fmt, faDate, faTime } from '$lib/format.js';

	const ACTIONS = {
		data: {
			title: 'حذف کامل اطلاعات',
			icon: 'refresh',
			summary: 'همه اسناد، گردش انبار و دفتر کل پاک می‌شود.',
			keeps: 'کالاها، اشخاص، حساب‌ها، خزانه و کاربران باقی می‌مانند؛ موجودی کالاها صفر می‌شود.',
			button: 'حذف اطلاعات'
		},
		business: {
			title: 'حذف کامل کسب‌وکار',
			icon: 'trash',
			summary: 'همه داده‌ها پاک می‌شود و برنامه به حالت راه‌اندازی اولیه برمی‌گردد.',
			keeps: 'کاربران، کالاها، اسناد و تنظیمات پاک می‌شوند. پیش از ادامه، از اطلاعات پشتیبان بگیرید.',
			button: 'حذف کسب‌وکار'
		}
	};

	let stats = $state(null);
	let backupInfo = $state(null);
	let backupBusy = $state(false);
	let action = $state(null);
	let confirmText = $state('');
	let busy = $state(false);

	const target = $derived(action ? ACTIONS[action] : null);
	const canConfirm = $derived(Boolean(backupInfo) && confirmText.trim() === 'حذف');

	async function refresh() {
		stats = await api('data.stats');
	}
	$effect(() => {
		refresh();
	});

	async function makeBackup() {
		backupBusy = true;
		try {
			const result = await window.hesab?.backup?.();
			if (!result?.ok) {
				toast('پشتیبان‌گیری لغو شد', 'warn');
				return;
			}
			backupInfo = { path: result.path, at: new Date() };
			toast('نسخه پشتیبان ذخیره شد');
		} catch (error) {
			toast(error.message, 'err', 6000);
		} finally {
			backupBusy = false;
		}
	}

	function openConfirm(mode) {
		if (!backupInfo) {
			toast('ابتدا از اطلاعات پشتیبان بگیرید', 'warn');
			return;
		}
		confirmText = '';
		action = mode;
	}

	async function runWipe() {
		if (!canConfirm) return;
		busy = true;
		try {
			await api('data.wipe', {
				mode: action,
				backupPath: backupInfo.path,
				confirmText
			});
			const wasBusiness = action === 'business';
			action = null;
			confirmText = '';
			backupInfo = null;

			if (wasBusiness) {
				resetSession();
				await loadAuth();
				await goto('/');
				toast('کسب‌وکار حذف شد؛ برنامه آماده راه‌اندازی مجدد است', 'warn', 6000);
			} else {
				await Promise.all([refresh(), loadAuth()]);
				toast('اطلاعات پاک شد');
			}
		} catch (error) {
			toast(error.message, 'err', 7000);
		} finally {
			busy = false;
		}
	}

	const rows = $derived(
		stats
			? [
					['کالا', stats.products],
					['شخص', stats.parties],
					['سند', stats.documents],
					['سند حسابداری', stats.journal],
					['کاربر', stats.users]
				]
			: []
	);
</script>

<div class="card card-pad mb-3">
	<div class="mb-3 flex items-start justify-between gap-4">
		<div>
			<h2 class="text-[14px] font-bold text-ink">پشتیبان‌گیری</h2>
			<p class="mt-1 text-[11.5px] leading-6 text-muted">
				یک نسخه کامل از پایگاه داده در مسیر دلخواه ذخیره می‌شود. برای هر حذف، پشتیبان تازه الزامی است.
			</p>
		</div>
		<button class="btn btn-primary shrink-0" onclick={makeBackup} disabled={backupBusy}>
			<Icon name="download" size={15} />
			{backupBusy ? 'در حال ذخیره…' : 'گرفتن نسخه پشتیبان'}
		</button>
	</div>

	{#if backupInfo}
		<div
			class="flex items-start gap-2 rounded-lg border border-[#c9e3d3] bg-[#f3faf6] px-3 py-2.5 text-[11.5px] text-[#1f6b47]"
		>
			<span class="mt-0.5 shrink-0"><Icon name="checkCircle" size={14} /></span>
			<div class="min-w-0">
				<div class="font-medium">
					پشتیبان {faDate(backupInfo.at.toISOString(), 'full')} ساعت {faTime(
						backupInfo.at.toISOString()
					)} ذخیره شد
				</div>
				<div class="mt-0.5 truncate text-[10.5px] text-[#3d7a5c]" dir="ltr" title={backupInfo.path}>
					{backupInfo.path}
				</div>
			</div>
		</div>
	{:else}
		<div class="flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-[11.5px] text-muted">
			<Icon name="info" size={14} />
			تا زمانی که پشتیبان نگیرید، گزینه‌های حذف غیرفعال هستند.
		</div>
	{/if}

	{#if rows.length}
		<div class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11.5px] text-muted">
			{#each rows as [label, value] (label)}
				<span>{label}: <b class="num text-ink2">{fmt(value)}</b></span>
			{/each}
		</div>
	{/if}
</div>

<div class="card border-[#f1d4d4] card-pad">
	<div class="mb-1 flex items-center gap-2">
		<span class="grid h-6 w-6 place-items-center rounded-md bg-[#fdecec] text-neg">
			<Icon name="alert" size={14} />
		</span>
		<h2 class="text-[14px] font-bold text-ink">منطقه خطر</h2>
	</div>
	<p class="mb-3 text-[11.5px] leading-6 text-muted">
		این عملیات قابل بازگشت نیست. تنها راه بازیابی، همان نسخه پشتیبانی است که پیش از حذف گرفته‌اید.
	</p>

	<div class="grid gap-2 md:grid-cols-2">
		{#each Object.entries(ACTIONS) as [key, meta] (key)}
			<div class="rounded-xl border border-line bg-paper/40 p-3">
				<div class="flex items-center gap-2 text-[12.5px] font-medium text-ink">
					<span class="text-neg"><Icon name={meta.icon} size={14} /></span>
					{meta.title}
				</div>
				<p class="mt-1.5 text-[11px] leading-5 text-muted">{meta.summary}</p>
				<p class="mt-1 text-[10.5px] leading-5 text-muted2">{meta.keeps}</p>
				<button
					class="btn btn-danger btn-sm mt-2.5 w-full"
					onclick={() => openConfirm(key)}
					disabled={!backupInfo}
					title={backupInfo ? meta.button : 'ابتدا پشتیبان بگیرید'}
				>
					<Icon name="trash" size={13} />
					{meta.button}
				</button>
			</div>
		{/each}
	</div>
</div>

<Modal
	open={Boolean(action)}
	title={target?.title || ''}
	subtitle="این عملیات قابل بازگشت نیست"
	onclose={() => (action = null)}
	size="sm"
>
	{#if target}
		<div
			class="mb-3 rounded-xl border border-[#f1d4d4] bg-[#fff7f7] px-3 py-2.5 text-[11.5px] leading-6 text-[#8f2b2b]"
		>
			{target.summary}
			<span class="mt-1 block text-[10.5px] text-[#a85555]">{target.keeps}</span>
		</div>

		{#if backupInfo}
			<div class="mb-3 rounded-lg bg-paper px-3 py-2 text-[10.5px] text-muted">
				نسخه پشتیبان شما:
				<span class="num">{faTime(backupInfo.at.toISOString())}</span>
				<span class="mx-1">·</span>
				<span dir="ltr" class="break-all">{backupInfo.path}</span>
			</div>
		{/if}

		<label class="label" for="wipe-confirm">برای تأیید، واژه «حذف» را تایپ کنید</label>
		<input
			id="wipe-confirm"
			class="input"
			bind:value={confirmText}
			placeholder="حذف"
			autocomplete="off"
			spellcheck="false"
		/>

		<p class="mt-2 text-[10.5px] text-muted2">
			کاربر جاری: {auth.user?.name} — پس از این عملیات از حساب خارج می‌شوید.
		</p>
	{/if}

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (action = null)}>انصراف</button>
		<button class="btn btn-danger" onclick={runWipe} disabled={!canConfirm || busy}>
			{busy ? 'در حال اجرا…' : 'تأیید و حذف'}
		</button>
	{/snippet}
</Modal>
