/**
 * تبدیل تاریخ شمسی/میلادی — پیاده‌سازی الگوریتم استاندارد تقویم جلالی
 * (بر پایهٔ الگوریتم شناخته‌شدهٔ jalaali، بدون وابستگی خارجی).
 * همهٔ توابع خالص‌اند تا قابل تست باشند.
 */

const BREAKS = [
	-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
	2456, 3178
];

const div = (a, b) => Math.trunc(a / b);
const mod = (a, b) => a - Math.trunc(a / b) * b;

/** محاسبهٔ کبیسه بودن و روز شروع سال شمسی در تقویم میلادی */
function jalCal(jy) {
	const bl = BREAKS.length;
	const gy = jy + 621;
	let leapJ = -14;
	let jp = BREAKS[0];
	let jump = 0;

	if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error(`سال شمسی نامعتبر: ${jy}`);

	for (let i = 1; i < bl; i += 1) {
		const jm = BREAKS[i];
		jump = jm - jp;
		if (jy < jm) break;
		leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
		jp = jm;
	}

	let n = jy - jp;
	leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
	if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

	const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
	const march = 20 + leapJ - leapG;

	if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
	let leap = mod(mod(n + 1, 33) - 1, 4);
	if (leap === -1) leap = 4;

	return { leap, gy, march };
}

/** شمارهٔ روز ژولینی از تاریخ میلادی */
function g2d(gy, gm, gd) {
	let d =
		div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
	d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
	return d;
}

/** تاریخ میلادی از شمارهٔ روز ژولینی */
function d2g(jdn) {
	let j = 4 * jdn + 139361631;
	j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
	const i = div(mod(j, 1461), 4) * 5 + 308;
	const gd = div(mod(i, 153), 5) + 1;
	const gm = mod(div(i, 153), 12) + 1;
	const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
	return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
	const r = jalCal(jy);
	return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
	const gy = d2g(jdn).gy;
	let jy = gy - 621;
	const r = jalCal(jy);
	const jdn1f = g2d(gy, 3, r.march);
	let k = jdn - jdn1f;

	if (k >= 0) {
		if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
		k -= 186;
	} else {
		jy -= 1;
		k += 179;
		if (r.leap === 1) k += 1;
	}
	return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export const JALALI_MONTHS = [
	'فروردین',
	'اردیبهشت',
	'خرداد',
	'تیر',
	'مرداد',
	'شهریور',
	'مهر',
	'آبان',
	'آذر',
	'دی',
	'بهمن',
	'اسفند'
];

export const isLeapJalaliYear = (jy) => jalCal(jy).leap === 0;

/** تعداد روزهای هر ماه شمسی */
export function jalaliMonthLength(jy, jm) {
	if (jm <= 6) return 31;
	if (jm <= 11) return 30;
	return isLeapJalaliYear(jy) ? 30 : 29;
}

export const isValidJalali = (jy, jm, jd) =>
	jy > 1200 &&
	jy < 1700 &&
	jm >= 1 &&
	jm <= 12 &&
	jd >= 1 &&
	jd <= jalaliMonthLength(jy, jm);

/** ISO میلادی (YYYY-MM-DD) → { jy, jm, jd } */
export function isoToJalali(iso) {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
	if (!match) return null;
	const [, gy, gm, gd] = match.map(Number);
	if (gm < 1 || gm > 12 || gd < 1 || gd > 31) return null;
	try {
		return d2j(g2d(gy, gm, gd));
	} catch {
		return null;
	}
}

/** { jy, jm, jd } → ISO میلادی (YYYY-MM-DD) */
export function jalaliToIso(jy, jm, jd) {
	if (!isValidJalali(jy, jm, jd)) return null;
	const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
	return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

const toPersianDigits = (value) =>
	String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

const toLatinDigits = (value) =>
	String(value)
		.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
		.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

/** متن کوتاه شمسی برای نمایش در ورودی: ۱۴۰۵/۰۸/۳۰ */
export function jalaliInputText(iso) {
	const j = isoToJalali(iso);
	if (!j) return '';
	return toPersianDigits(`${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`);
}

/** متن بلند شمسی برای نمایش: ۳۰ آبان ۱۴۰۵ */
export function jalaliLongText(iso) {
	const j = isoToJalali(iso);
	if (!j) return '';
	return toPersianDigits(`${j.jd} ${JALALI_MONTHS[j.jm - 1]} ${j.jy}`);
}

/**
 * ورودی کاربر را به ISO تبدیل می‌کند. جداکننده‌ها / - . و فاصله پذیرفته می‌شوند
 * و ارقام فارسی یا لاتین هر دو مجاز است. خروجی null یعنی تاریخ نامعتبر.
 */
export function parseJalaliInput(text) {
	const digits = toLatinDigits(String(text ?? ''))
		.replace(/[^\d]/g, ' ')
		.trim();
	if (!digits) return null;

	const parts = digits.split(/\s+/).map(Number);
	if (parts.length !== 3) return null;

	let [jy, jm, jd] = parts;
	if (jy < 100) jy += 1400;
	return jalaliToIso(jy, jm, jd);
}

/** اولین روز ماه شمسیِ تاریخ داده‌شده (برای بازه‌های پیش‌فرض گزارش) */
export function jalaliMonthStart(iso) {
	const j = isoToJalali(iso);
	if (!j) return iso;
	return jalaliToIso(j.jy, j.jm, 1) || iso;
}
