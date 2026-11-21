/**
 * قواعد واحد کالا — منبع حقیقت مشترک بین فرایند اصلی و رابط کاربری.
 * واحدهای «شمردنی» (عدد، جفت، بسته...) فقط عدد صحیح می‌پذیرند و
 * واحدهای «وزنی/اندازه‌ای» (کیلوگرم، لیتر، متر...) عدد اعشاری هم می‌پذیرند.
 */
const UNITS = require('../../shared/units.json');

const DEFAULT_UNIT = UNITS[0].key;
const MAX_DECIMALS = 3;

const unitMeta = (unit) => UNITS.find((u) => u.key === unit) || { key: unit || DEFAULT_UNIT, fractional: false };

const allowsFraction = (unit) => unitMeta(unit).fractional;

const round = (value, digits = MAX_DECIMALS) => {
	const factor = 10 ** digits;
	return Math.round((Number(value) || 0) * factor) / factor;
};

/** تعداد را با قواعد واحد پاک‌سازی می‌کند (حداقل مقدار معتبر، اعشار مجاز/غیرمجاز) */
function normalizeQty(unit, value, min = null) {
	const raw = Number(value) || 0;
	const floor = min ?? (allowsFraction(unit) ? 0.001 : 1);
	const cleaned = allowsFraction(unit) ? round(raw) : Math.round(raw);
	return Math.max(cleaned, floor);
}

/** آیا تعداد برای این واحد معتبر است؟ (پیام خطای فارسی برمی‌گرداند یا null) */
function validateQty(unit, value, label = 'تعداد') {
	const raw = Number(value);
	if (!Number.isFinite(raw) || raw <= 0) return `${label} باید بزرگ‌تر از صفر باشد`;
	if (!allowsFraction(unit) && Math.abs(raw - Math.round(raw)) > 1e-9) {
		return `${label} برای واحد «${unitMeta(unit).key}» باید عدد صحیح باشد`;
	}
	return null;
}

module.exports = { UNITS, DEFAULT_UNIT, MAX_DECIMALS, unitMeta, allowsFraction, normalizeQty, validateQty };
