import { api } from './api.js';

/**
 * وضعیت احراز هویت. کاربر جاری فقط از سمت فرایند اصلی تأیید می‌شود؛
 * اینجا صرفاً برای نمایش و مسیریابی نگه داشته می‌شود.
 */
export const auth = $state({
	ready: false,
	initialized: false,
	users: [],
	businessName: 'حساب‌یار',
	user: null,
	error: null
});

export const isAdmin = () => auth.user?.role === 'admin';
export const isCashier = () => auth.user?.role === 'cashier';
export const homeOf = (user) => (user?.role === 'cashier' ? '/pos' : '/');

export async function loadAuth() {
	try {
		const [state, session] = await Promise.all([api('auth.state'), api('auth.session')]);
		Object.assign(auth, state, { user: session || null, ready: true, error: null });
	} catch (error) {
		auth.ready = true;
		auth.error = error.message;
	}
}

export async function login(userId, password) {
	auth.user = await api('auth.login', { userId, password });
	return auth.user;
}

export async function setup(payload) {
	auth.user = await api('auth.setup', payload);
	Object.assign(auth, { initialized: true });
	return auth.user;
}

export async function logout() {
	try {
		await api('auth.logout');
	} finally {
		auth.user = null;
	}
}

/** فهرست کاربران برای صفحه مدیریت کاربران */
export async function refreshUsers() {
	const state = await api('auth.state');
	auth.users = state.users;
	auth.initialized = state.initialized;
	return state.users;
}
