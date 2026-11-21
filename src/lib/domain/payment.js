/**
 * منطق پرداخت ترکیبی — خالص و قابل تست.
 * هر ردیف یک روش + یک خزانه دارد؛ بنابراین امکان دو بار کارت‌کشیدن از دو
 * کارتخوان مختلف در یک فاکتور وجود دارد.
 */
const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const PAY_METHODS = [
	{ key: 'cash', label: 'نقدی', icon: 'wallet', treasuryKind: 'cash' },
	{ key: 'terminal', label: 'کارتخوان', icon: 'creditCard', treasuryKind: 'terminal' },
	{ key: 'card_to_card', label: 'کارت به کارت', icon: 'arrows', treasuryKind: 'bank' },
	{ key: 'bank', label: 'انتقال بانکی', icon: 'bank', treasuryKind: 'bank' },
	{ key: 'check', label: 'چک', icon: 'file', treasuryKind: null }
];

export const methodMeta = (key) => PAY_METHODS.find((method) => method.key === key) || PAY_METHODS[0];

/** خزانه‌های مجاز هر روش؛ اگر خزانه‌ای از آن نوع نبود، همه خزانه‌ها پیشنهاد می‌شوند */
export function treasuriesFor(methodKey, treasuries) {
	const { treasuryKind } = methodMeta(methodKey);
	if (!treasuryKind) return [];
	const matched = treasuries.filter((treasury) => treasury.kind === treasuryKind);
	return matched.length ? matched : treasuries;
}

export const createPayment = (methodKey, treasuries) => {
	const options = treasuriesFor(methodKey, treasuries);
	return { method: methodKey, treasuryId: options[0]?.id ?? '', amount: 0 };
};

export const sumPayments = (payments) =>
	round(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));

export const remainingOf = (total, payments) => round(total - sumPayments(payments));

/** مبلغ پیشنهادی برای ردیف بعدی تا مانده صفر شود */
export function suggestedAmount(total, payments, current) {
	const others = payments
		.filter((payment) => payment !== current)
		.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
	return Math.max(round(total - others), 0);
}

export function validatePayments(total, payments) {
	const active = payments.filter((payment) => Number(payment.amount) > 0);
	const missingTreasury = active.some(
		(payment) => methodMeta(payment.method).treasuryKind && !payment.treasuryId
	);
	if (missingTreasury) return 'حساب خزانه هر ردیف پرداخت را انتخاب کنید';
	if (sumPayments(payments) > total + 0.5) return 'مبلغ پرداختی از مبلغ فاکتور بیشتر است';
	return null;
}

/** حذف ردیف‌های خالی و تبدیل به ساختار ارسالی به سرویس */
export const toPayload = (payments) =>
	payments
		.filter((payment) => Number(payment.amount) > 0)
		.map((payment) => ({
			method: payment.method,
			treasuryId: payment.treasuryId || null,
			amount: Number(payment.amount)
		}));
