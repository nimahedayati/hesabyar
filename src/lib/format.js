import { jalaliMonthStart } from './jalali.js';

const FA = 'fa-IR';

/** تبدیل ارقام لاتین یک رشته به فارسی (برای کدها، تلفن و شماره حساب) */
export function faDigits(value) {
	if (value === null || value === undefined) return '';
	return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

/** نمایش عدد با ارقام فارسی */
export function fmt(n, digits = 0) {
	if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '۰';
	const v = Number(n);
	return v.toLocaleString(FA, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** مبلغ + واحد پول */
export function money(n, currency = 'تومان') {
	return `${fmt(n)} ${currency}`;
}

/** عدد خلاصه: ۱٫۲ میلیون */
export function compact(n) {
	const v = Number(n) || 0;
	if (Math.abs(v) >= 1_000_000_000) return `${fmt(v / 1_000_000_000, 1)} میلیارد`;
	if (Math.abs(v) >= 1_000_000) return `${fmt(v / 1_000_000, 1)} میلیون`;
	if (Math.abs(v) >= 10_000) return `${fmt(v / 1000, 0)} هزار`;
	return fmt(v);
}

const DIGIT_MAP = {
	'۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
	'٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

/** تبدیل ارقام فارسی/عربی به لاتین و حذف جداکننده‌ها */
export function toLatin(str) {
	if (str === null || str === undefined) return '';
	return String(str)
		.replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] || d)
		.replace(/[,٬\s]/g, '')
		.replace(/٫/g, '.');
}

export function parseNum(str) {
	const v = Number(toLatin(str));
	return Number.isFinite(v) ? v : 0;
}

/** نمایش تاریخ شمسی */
export function faDate(iso, style = 'short') {
	if (!iso) return '—';
	const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
	if (Number.isNaN(d.getTime())) return '—';
	if (style === 'long')
		return d.toLocaleDateString(FA, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	if (style === 'month') return d.toLocaleDateString(FA, { day: 'numeric', month: 'long' });
	if (style === 'day') return d.toLocaleDateString(FA, { day: 'numeric' });
	if (style === 'short') return d.toLocaleDateString(FA, { day: '2-digit', month: '2-digit' });
	return d.toLocaleDateString(FA, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function faTime(iso) {
	if (!iso) return '';
	const d = new Date(iso);
	return d.toLocaleTimeString(FA, { hour: '2-digit', minute: '2-digit' });
}

/** تاریخ امروز به وقت محلی (نه UTC) تا نیمه‌شب جابه‌جا نشود */
export function todayISO() {
	const now = new Date();
	return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** جمع/تفریق روز روی تاریخ میلادی؛ محاسبه در UTC انجام می‌شود تا منطقه زمانی اثر نگذارد */
export function addDays(iso, n) {
	const date = new Date(`${iso}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + n);
	return date.toISOString().slice(0, 10);
}

/** اولین روز ماه شمسی جاری (نه ماه میلادی) */
export function monthStart(iso = todayISO()) {
	return jalaliMonthStart(iso);
}

export const METHODS = [
	{ key: 'cash', label: 'نقدی', icon: 'wallet' },
	{ key: 'terminal', label: 'کارتخوان', icon: 'credit-card' },
	{ key: 'card_to_card', label: 'کارت به کارت', icon: 'arrows' },
	{ key: 'bank', label: 'انتقال بانکی', icon: 'bank' },
	{ key: 'check', label: 'چک', icon: 'file' },
	{ key: 'credit', label: 'نسیه', icon: 'clock' }
];

export const methodLabel = (k) => METHODS.find((m) => m.key === k)?.label || k;

export const DOC_LABELS = {
	sale: 'فروش',
	purchase: 'خرید',
	sale_return: 'برگشت از فروش',
	purchase_return: 'برگشت از خرید',
	receipt: 'دریافت',
	payment: 'پرداخت',
	expense: 'هزینه',
	income: 'درآمد',
	transfer: 'انتقال',
	opening: 'موجودی اولیه',
	adjust: 'اصلاح موجودی',
	journal: 'سند دستی',
	check: 'چک'
};

export const CHECK_STATUS = {
	in_hand: { label: 'نزد صندوق', cls: 'tag-neutral' },
	endorsed: { label: 'واگذار شده', cls: 'tag-warn' },
	collected: { label: 'وصول شده', cls: 'tag-pos' },
	spent: { label: 'خرج شده', cls: 'tag-neutral' },
	returned: { label: 'برگشت خورده', cls: 'tag-neg' },
	cancelled: { label: 'ابطال شده', cls: 'tag-neg' }
};
