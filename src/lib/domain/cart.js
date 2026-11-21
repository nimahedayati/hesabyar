/**
 * منطق سبد اقلام — خالص و مستقل از رابط کاربری تا قابل تست باشد.
 * قواعد تعداد از واحد کالا می‌آید (عدد = صحیح، کیلو = اعشاری).
 */
import { normalizeQty, stepFor } from './units.js';

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function createLine(product, { qty = 1, unitPrice = null, taxRate = 0 } = {}) {
	return {
		productId: product.id,
		name: product.name,
		unit: product.unit,
		qty: normalizeQty(product.unit, qty),
		unitPrice: unitPrice ?? product.sale_price,
		discount: 0,
		taxRate,
		stock: product.stock_qty ?? 0
	};
}

export function addLine(lines, product, options = {}) {
	const exists = lines.some((line) => line.productId === product.id);
	if (exists) {
		return lines.map((line) =>
			line.productId === product.id
				? { ...line, qty: normalizeQty(line.unit, line.qty + (options.qty ?? 1)) }
				: line
		);
	}
	return [...lines, createLine(product, options)];
}

export const removeLine = (lines, productId) => lines.filter((line) => line.productId !== productId);

/** تغییر تعداد با گام مناسب واحد (۱ برای عدد، ۰٫۵ برای کیلو) */
export const changeQty = (line, direction) => {
	const step = stepFor(line.unit) * (direction < 0 ? -1 : 1);
	return { ...line, qty: normalizeQty(line.unit, line.qty + step) };
};

/** تنظیم مستقیم تعداد از ورودی دستی کاربر */
export const setQty = (line, value) => ({ ...line, qty: normalizeQty(line.unit, value) });

export const lineNet = (line) => round(line.qty * line.unitPrice - (line.discount || 0));

export const linesSubtotal = (lines) => round(lines.reduce((sum, line) => sum + lineNet(line), 0));

export const linesTax = (lines) =>
	round(lines.reduce((sum, line) => sum + (lineNet(line) * (line.taxRate || 0)) / 100, 0));

export function cartTotals(lines, invoiceDiscount = 0) {
	const subtotal = linesSubtotal(lines);
	const discount = Math.min(Math.max(Number(invoiceDiscount) || 0, 0), subtotal);
	const tax = linesTax(lines);
	return { subtotal, discount, tax, total: round(subtotal - discount + tax) };
}

export const totalQuantity = (lines) => round(lines.reduce((sum, line) => sum + line.qty, 0));
