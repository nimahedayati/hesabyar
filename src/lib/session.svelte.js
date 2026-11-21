import { api } from './api.js';

/**
 * داده‌های مشترک سراسری. فقط چیزهای سبک اینجا می‌مانند؛ فهرست‌های سنگین
 * (کالاها، اسناد، اشخاص) در خود صفحه و به‌صورت سرچ/صفحه‌بندی واکشی می‌شوند.
 */
export const session = $state({
	ready: false,
	error: null,
	settings: {},
	categories: [],
	treasuries: [],
	warehouses: [],
	accounts: [],
	partyCount: 0
});

export async function loadSession() {
	try {
		const data = await api('bootstrap');
		Object.assign(session, data, { ready: true, error: null });
	} catch (error) {
		session.error = error.message;
		session.ready = true;
	}
}

const refresh = async (method, key, payload) => {
	session[key] = await api(method, payload);
};

/** با خروج از حساب، داده‌های مشترک پاک می‌شوند تا کاربر بعدی چیزی نبیند */
export function resetSession() {
	Object.assign(session, {
		ready: false,
		error: null,
		settings: {},
		categories: [],
		treasuries: [],
		warehouses: [],
		accounts: [],
		partyCount: 0
	});
}

export const refreshTreasuries = () => refresh('treasuries.list', 'treasuries');
export const refreshCategories = () => refresh('categories.list', 'categories');
export const refreshWarehouses = () => refresh('warehouses.list', 'warehouses');
export const refreshAccounts = () => refresh('accounts.list', 'accounts');

export const currency = () => session.settings?.currency || 'تومان';
