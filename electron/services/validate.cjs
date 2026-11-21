/**
 * اعتبارسنجی ورودی در مرز سیستم. هیچ داده‌ای از رابط کاربری بدون عبور از
 * این توابع به لایه داده نمی‌رسد.
 */
const { fail } = require('./errors.cjs');

const MAX_TEXT = 200;

const toNumber = (value) => {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const normalized = value
			.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
			.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
			.replace(/[,٬\s]/g, '');
		return Number(normalized);
	}
	return Number.NaN;
};

const isPositive = (v) => Number.isFinite(toNumber(v)) && toNumber(v) > 0;
const isNonNegative = (v) => Number.isFinite(toNumber(v)) && toNumber(v) >= 0;

function requireText(value, label, max = MAX_TEXT) {
	const text = String(value ?? '').trim();
	if (!text) fail(`${label} الزامی است`, 'VALIDATION');
	if (text.length > max) fail(`${label} نباید بیش از ${max} نویسه باشد`, 'VALIDATION');
	return text;
}

function optionalText(value, max = MAX_TEXT) {
	const text = String(value ?? '').trim();
	return text ? text.slice(0, max) : null;
}

function requirePositive(value, label) {
	if (!isPositive(value)) fail(`${label} باید عددی بزرگ‌تر از صفر باشد`, 'VALIDATION');
	return toNumber(value);
}

function requireNonNegative(value, label) {
	if (!isNonNegative(value)) fail(`${label} نمی‌تواند منفی باشد`, 'VALIDATION');
	return toNumber(value);
}

function requireId(value, label) {
	const id = toNumber(value);
	if (!Number.isInteger(id) || id <= 0) fail(`${label} را انتخاب کنید`, 'VALIDATION');
	return id;
}

function optionalId(value) {
	const id = toNumber(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

function requireDate(value, label) {
	const text = String(value ?? '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail(`${label} معتبر نیست`, 'VALIDATION');
	return text;
}

function requireOneOf(value, allowed, label) {
	if (!allowed.includes(value)) fail(`${label} معتبر نیست`, 'VALIDATION');
	return value;
}

function requireArray(value, label) {
	if (!Array.isArray(value) || value.length === 0) fail(`${label} خالی است`, 'VALIDATION');
	return value;
}

module.exports = {
	toNumber,
	isPositive,
	isNonNegative,
	requireText,
	optionalText,
	requirePositive,
	requireNonNegative,
	requireId,
	optionalId,
	requireDate,
	requireOneOf,
	requireArray
};
