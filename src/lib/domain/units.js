/**
 * قواعد واحد کالا در رابط کاربری — همان منبعی که سرویس استفاده می‌کند.
 * واحدهای شمردنی فقط عدد صحیح می‌پذیرند؛ واحدهای وزنی اعشار هم می‌پذیرند.
 */
import RAW_UNITS from '../../../shared/units.json' with { type: 'json' };

export const UNITS = RAW_UNITS;
export const DEFAULT_UNIT = UNITS[0].key;
export const MAX_DECIMALS = 3;
export const MIN_FRACTIONAL_QTY = 0.001;

export const unitMeta = (unit) => UNITS.find((row) => row.key === unit) || { key: unit || DEFAULT_UNIT, fractional: false };

export const allowsFraction = (unit) => unitMeta(unit).fractional;

const round = (value, digits = MAX_DECIMALS) => {
	const factor = 10 ** digits;
	return Math.round((Number(value) || 0) * factor) / factor;
};

/** گام دکمه‌های + و − برای هر واحد */
export const stepFor = (unit) => (allowsFraction(unit) ? 0.5 : 1);

/**
 * تعداد را با قواعد واحد محدود می‌کند.
 * min را می‌توان صفر داد (مثلاً «تعداد برگشتی» که صفر یعنی بدون برگشت).
 */
export function normalizeQty(unit, value, min = null) {
	const raw = Number(value) || 0;
	const floor = min ?? (allowsFraction(unit) ? MIN_FRACTIONAL_QTY : 1);
	const cleaned = allowsFraction(unit) ? round(raw) : Math.round(raw);
	return Math.max(cleaned, floor);
}

/** پیام خطا برای تعداد نامعتبر، وگرنه null */
export function validateQty(unit, value, label = 'تعداد') {
	const raw = Number(value);
	if (!Number.isFinite(raw) || raw <= 0) return `${label} باید بزرگ‌تر از صفر باشد`;
	if (!allowsFraction(unit) && Math.abs(raw - Math.round(raw)) > 1e-9) {
		return `${label} برای واحد «${unitMeta(unit).key}» باید عدد صحیح باشد`;
	}
	return null;
}
