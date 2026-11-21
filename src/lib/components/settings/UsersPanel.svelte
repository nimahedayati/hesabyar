<script>
	/**
	 * مدیریت کاربران: افزودن، ویرایش نقش، تغییر رمز و حذف.
	 * دو نقش: مدیر (دسترسی کامل) و صندوق‌دار (فقط صفحه فروش).
	 */
	import { onMount } from 'svelte';
	import Icon from '../Icon.svelte';
	import Modal from '../Modal.svelte';
	import { api } from '$lib/api.js';
	import { auth, refreshUsers } from '$lib/auth.svelte.js';
	import { toast } from '$lib/ui.svelte.js';
	import { faDate, faTime } from '$lib/format.js';

	const ROLES = [
		['admin', 'مدیر', 'دسترسی کامل به همه بخش‌ها'],
		['cashier', 'صندوق‌دار', 'فقط صفحه فروش']
	];

	let rows = $state([]);
	let loading = $state(true);
	let saving = $state(false);
	let editOpen = $state(false);
	let passwordOpen = $state(false);
	let form = $state({});
	let passwordForm = $state({});

	const roleLabel = (role) => ROLES.find(([key]) => key === role)?.[1] || role;
	const roleHint = (role) => ROLES.find(([key]) => key === role)?.[2] || '';

	async function load() {
		loading = true;
		try {
			rows = await refreshUsers();
		} catch (error) {
			toast(error.message, 'err');
		} finally {
			loading = false;
		}
	}

	onMount(load);

	function openNew() {
		form = { name: '', role: 'cashier', password: '' };
		editOpen = true;
	}

	function openEdit(user) {
		form = { id: user.id, name: user.name, role: user.role, isActive: user.isActive };
		editOpen = true;
	}

	function openPassword(user) {
		passwordForm = { id: user.id, name: user.name, password: '', confirm: '' };
		passwordOpen = true;
	}

	async function save() {
		if (!form.name?.trim()) return toast('نام کاربر را وارد کنید', 'warn');

		saving = true;
		try {
			if (form.id) {
				await api('users.update', { id: form.id, name: form.name, role: form.role, isActive: form.isActive });
				toast('کاربر به‌روزرسانی شد');
			} else {
				if (!form.password) throw new Error('رمز عبور را وارد کنید');
				await api('users.create', { name: form.name, role: form.role, password: form.password });
				toast('کاربر جدید ساخته شد');
			}
			editOpen = false;
			await load();
		} catch (error) {
			toast(error.message, 'err');
		} finally {
			saving = false;
		}
	}

	async function savePassword() {
		if (passwordForm.password.length < 4) return toast('رمز عبور باید حداقل ۴ نویسه باشد', 'warn');
		if (passwordForm.password !== passwordForm.confirm) return toast('تکرار رمز یکسان نیست', 'warn');

		saving = true;
		try {
			await api('users.password', { id: passwordForm.id, password: passwordForm.password });
			toast('رمز عبور تغییر کرد');
			passwordOpen = false;
		} catch (error) {
			toast(error.message, 'err');
		} finally {
			saving = false;
		}
	}

	async function remove(user) {
		try {
			await api('users.remove', { id: user.id });
			toast('کاربر حذف شد');
			await load();
		} catch (error) {
			toast(error.message, 'err');
		}
	}

	const lastLogin = (user) => {
		if (!user.lastLoginAt) return 'هرگز';
		// SQLite زمان UTC را بدون نشانه ذخیره می‌کند
		const iso = `${user.lastLoginAt.replace(' ', 'T')}Z`;
		return `${faDate(iso)} ${faTime(iso)}`;
	};
</script>

<div class="card overflow-hidden">
	<div class="flex items-center justify-between border-b border-line px-4 py-3">
		<div>
			<h3 class="flex items-center gap-2 text-[13px] font-bold text-ink">
				<Icon name="users" size={15} class="text-muted" />
				کاربران برنامه
			</h3>
			<p class="mt-0.5 text-[10.5px] text-muted">صندوق‌دار فقط به صفحه فروش دسترسی دارد و بدون سایدبار وارد می‌شود</p>
		</div>
		<button class="btn btn-primary btn-sm" onclick={openNew}>
			<Icon name="plus" size={13} />
			کاربر جدید
		</button>
	</div>

	<table class="table">
		<thead>
			<tr>
				<th>کاربر</th>
				<th>نقش</th>
				<th>آخرین ورود</th>
				<th class="!text-left">عملیات</th>
			</tr>
		</thead>
		<tbody>
			{#if loading}
				{#each [1, 2] as skeleton (skeleton)}
					<tr><td colspan="4"><div class="skeleton h-5 w-full"></div></td></tr>
				{/each}
			{:else}
				{#each rows as user (user.id)}
					<tr>
						<td>
							<div class="flex items-center gap-2">
								<span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paper2 text-[11px] font-bold text-ink2">
									{user.name.charAt(0)}
								</span>
								<div class="min-w-0">
									<div class="truncate text-[12.5px] font-medium text-ink">{user.name}</div>
									{#if auth.user?.id === user.id}
										<div class="text-[10px] text-goldink">حساب شما</div>
									{/if}
								</div>
							</div>
						</td>
						<td>
							<span class="tag {user.role === 'admin' ? 'tag-warn' : 'tag-neutral'}">{roleLabel(user.role)}</span>
						</td>
						<td class="text-[11.5px] text-muted">{lastLogin(user)}</td>
						<td class="!text-left">
							<div class="flex items-center justify-end gap-1">
								<button class="btn btn-soft btn-sm !px-2" onclick={() => openPassword(user)} title="تغییر رمز">
									<Icon name="lock" size={13} />
								</button>
								<button class="btn btn-soft btn-sm !px-2" onclick={() => openEdit(user)} title="ویرایش">
									<Icon name="edit" size={13} />
								</button>
								<button
									class="btn btn-soft btn-sm !px-2"
									onclick={() => remove(user)}
									disabled={auth.user?.id === user.id}
									title={auth.user?.id === user.id ? 'حساب خودتان قابل حذف نیست' : 'حذف'}
								>
									<Icon name="trash" size={13} />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

<Modal open={editOpen} title={form.id ? 'ویرایش کاربر' : 'کاربر جدید'} onclose={() => (editOpen = false)} size="sm">
	<div class="space-y-3">
		<div>
			<label class="label" for="usr-name">نام کاربر</label>
			<input id="usr-name" class="input" bind:value={form.name} placeholder="مثلاً زهرا" />
		</div>
		<div>
			<label class="label" for="usr-role">نقش</label>
			<select id="usr-role" class="input" bind:value={form.role}>
				{#each ROLES as [key, label] (key)}
					<option value={key}>{label}</option>
				{/each}
			</select>
			<p class="mt-1 text-[10.5px] text-muted2">{roleHint(form.role)}</p>
		</div>
		{#if form.id}
			<label class="flex items-center gap-2 rounded-lg bg-paper px-3 py-2.5">
				<input type="checkbox" bind:checked={form.isActive} class="h-4 w-4 accent-[#b98e1d]" />
				<span class="text-[12.5px] text-ink2">حساب فعال است</span>
			</label>
		{:else}
			<div>
				<label class="label" for="usr-pass">رمز عبور</label>
				<input id="usr-pass" class="input" type="password" bind:value={form.password} autocomplete="new-password" />
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (editOpen = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={save} disabled={saving}>ذخیره</button>
	{/snippet}
</Modal>

<Modal open={passwordOpen} title="تغییر رمز {passwordForm.name || ''}" onclose={() => (passwordOpen = false)} size="sm">
	<div class="space-y-3">
		<div>
			<label class="label" for="usr-pass1">رمز جدید</label>
			<input id="usr-pass1" class="input" type="password" bind:value={passwordForm.password} autocomplete="new-password" />
		</div>
		<div>
			<label class="label" for="usr-pass2">تکرار رمز جدید</label>
			<input id="usr-pass2" class="input" type="password" bind:value={passwordForm.confirm} autocomplete="new-password" />
		</div>
		<p class="text-[10.5px] leading-5 text-muted2">رمز به‌صورت درهم‌سازی‌شده ذخیره می‌شود و قابل بازیابی نیست.</p>
	</div>

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (passwordOpen = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={savePassword} disabled={saving}>تغییر رمز</button>
	{/snippet}
</Modal>
