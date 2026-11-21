/**
 * پل ارتباط با فرایند اصلی.
 *
 * نکته مهم: شیءهای `$state` در Svelte 5 یک Proxy هستند و Proxy از طریق IPC
 * قابل انتقال نیست (خطای «An object could not be cloned»). بنابراین هر پی‌لود
 * پیش از ارسال به یک ساختار ساده و قابل کلون تبدیل می‌شود.
 */

/** تبدیل بازگشتی هر مقدار به داده ساده (بدون Proxy) */
function plain(value) {
	if (value === null || typeof value !== 'object') return value;
	if (value instanceof Date) return new Date(value.getTime());
	if (Array.isArray(value)) return value.map(plain);

	const out = {};
	for (const [key, item] of Object.entries(value)) out[key] = plain(item);
	return out;
}

export async function api(method, payload = {}) {
	if (typeof window === 'undefined' || !window.hesab) {
		throw new Error('ارتباط با هسته برنامه برقرار نیست');
	}
	const res = await window.hesab.call(method, plain(payload));
	if (!res || res.ok === false) throw new Error(res?.error || 'خطای نامشخص');
	return res.data;
}

export const isDesktop = () => typeof window !== 'undefined' && !!window.hesab;
