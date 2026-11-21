export async function api(method, payload = {}) {
	if (typeof window === 'undefined' || !window.hesab) {
		throw new Error('ارتباط با هسته برنامه برقرار نیست');
	}
	const res = await window.hesab.call(method, payload);
	if (!res || res.ok === false) throw new Error(res?.error || 'خطای نامشخص');
	return res.data;
}

export const isDesktop = () => typeof window !== 'undefined' && !!window.hesab;
