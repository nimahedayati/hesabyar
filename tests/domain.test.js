/**
 * تست‌های واحد منطق دامنه (بدون وابستگی به Electron یا مرورگر).
 * اجرا: npm run test:unit
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
	addLine,
	cartTotals,
	changeQty,
	createLine,
	lineNet,
	linesSubtotal,
	linesTax,
	removeLine,
	setQty,
	totalQuantity
} from '../src/lib/domain/cart.js';
import {
	allowsFraction,
	MIN_FRACTIONAL_QTY,
	normalizeQty,
	stepFor,
	validateQty
} from '../src/lib/domain/units.js';
import {
	createPayment,
	PAY_METHODS,
	remainingOf,
	suggestedAmount,
	sumPayments,
	toPayload,
	treasuriesFor,
	validatePayments
} from '../src/lib/domain/payment.js';
import { addDays, fmt, monthStart, parseNum, toLatin } from '../src/lib/format.js';
import {
	isValidJalali,
	isoToJalali,
	jalaliInputText,
	jalaliLongText,
	jalaliToIso,
	parseJalaliInput
} from '../src/lib/jalali.js';

const milk = { id: 1, name: 'شیر', unit: 'عدد', sale_price: 30000, stock_qty: 10 };
const bread = { id: 2, name: 'نان', unit: 'عدد', sale_price: 5000, stock_qty: 4 };

const TREASURIES = [
	{ id: 'c1', kind: 'cash', name: 'صندوق' },
	{ id: 't1', kind: 'terminal', name: 'کارتخوان ۱' },
	{ id: 't2', kind: 'terminal', name: 'کارتخوان ۲' },
	{ id: 'b1', kind: 'bank', name: 'بانک' }
];

/* ------------------------------- سبد اقلام ------------------------------- */

test('افزودن کالای جدید یک ردیف می‌سازد', () => {
	const lines = addLine([], milk);
	assert.equal(lines.length, 1);
	assert.equal(lines[0].productId, 1);
	assert.equal(lines[0].unitPrice, 30000);
});

test('افزودن کالای تکراری فقط تعداد را زیاد می‌کند', () => {
	let lines = addLine([], milk);
	lines = addLine(lines, milk, { qty: 2 });
	assert.equal(lines.length, 1);
	assert.equal(lines[0].qty, 3);
});

test('حذف ردیف درست کار می‌کند', () => {
	const lines = addLine(addLine([], milk), bread);
	assert.equal(removeLine(lines, 1).length, 1);
	assert.equal(removeLine(lines, 1)[0].productId, 2);
});

test('تعداد هرگز کمتر از حداقل نمی‌شود', () => {
	const reduced = changeQty(createLine(milk, { qty: 1 }), -5);
	assert.equal(reduced.qty, 1);

	const kilo = { id: 3, name: 'برنج', unit: 'کیلوگرم', sale_price: 120000 };
	const light = changeQty(createLine(kilo, { qty: 0.5 }), -1);
	assert.equal(light.qty, MIN_FRACTIONAL_QTY);
	assert.ok(light.qty > 0);
});

test('خالص ردیف = تعداد × فی − تخفیف ردیف', () => {
	const line = { ...createLine(milk, { qty: 2 }), discount: 5000 };
	assert.equal(lineNet(line), 55000);
});

test('جمع کل با تخفیف و مالیات درست محاسبه می‌شود', () => {
	const lines = [{ ...createLine(milk, { qty: 2, taxRate: 10 }) }, createLine(bread, { qty: 1 })];
	assert.equal(linesSubtotal(lines), 65000);
	assert.equal(linesTax(lines), 6000);
	assert.deepEqual(cartTotals(lines, 5000), { subtotal: 65000, discount: 5000, tax: 6000, total: 66000 });
});

test('تخفیف فاکتور بیشتر از جمع اقلام پذیرفته نمی‌شود', () => {
	assert.equal(cartTotals([createLine(bread)], 999999).discount, 5000);
});

test('تخفیف منفی نادیده گرفته می‌شود', () => {
	assert.equal(cartTotals([createLine(bread)], -1000).discount, 0);
});

test('جمع تعداد اقلام', () => {
	const lines = [createLine(milk, { qty: 2 }), createLine(bread, { qty: 3 })];
	assert.equal(totalQuantity(lines), 5);
});

/* ------------------------------- پرداخت ------------------------------- */

test('دو کارتخوان مختلف در یک فاکتور پذیرفته می‌شود', () => {
	const payments = [
		{ method: 'terminal', treasuryId: 't1', amount: 200000 },
		{ method: 'terminal', treasuryId: 't2', amount: 150000 },
		{ method: 'cash', treasuryId: 'c1', amount: 150000 }
	];
	const payload = toPayload(payments);
	assert.equal(payload.length, 3);
	assert.deepEqual(
		payload.map((row) => row.treasuryId),
		['t1', 't2', 'c1']
	);
	assert.equal(sumPayments(payments), 500000);
	assert.equal(remainingOf(500000, payments), 0);
});

test('ردیف‌های با مبلغ صفر ارسال نمی‌شوند', () => {
	assert.equal(toPayload([{ method: 'cash', treasuryId: 'c1', amount: 0 }]).length, 0);
});

test('مجموع پرداخت از مبلغ فاکتور بیشتر نباید باشد', () => {
	const payments = [{ method: 'cash', treasuryId: 'c1', amount: 600000 }];
	assert.match(validatePayments(500000, payments), /بیشتر/);
	assert.equal(validatePayments(500000, [{ method: 'cash', treasuryId: 'c1', amount: 500000 }]), null);
});

test('روش‌های نیازمند خزانه بدون خزانه رد می‌شوند', () => {
	assert.match(validatePayments(1000, [{ method: 'terminal', treasuryId: '', amount: 1000 }]), /خزانه/);
});

test('چک به خزانه نیاز ندارد', () => {
	assert.equal(validatePayments(1000, [{ method: 'check', treasuryId: '', amount: 1000 }]), null);
});

test('خزانه‌های پیشنهادی بر اساس نوع روش فیلتر می‌شوند', () => {
	assert.deepEqual(
		treasuriesFor('terminal', TREASURIES).map((row) => row.id),
		['t1', 't2']
	);
	assert.deepEqual(
		treasuriesFor('cash', TREASURIES).map((row) => row.id),
		['c1']
	);
	assert.deepEqual(treasuriesFor('check', TREASURIES), []);
});

test('اگر خزانه‌ای از نوع موردنظر نبود، همه خزانه‌ها پیشنهاد می‌شوند', () => {
	const onlyCash = [{ id: 'c1', kind: 'cash', name: 'صندوق' }];
	assert.equal(treasuriesFor('terminal', onlyCash).length, 1);
});

test('ردیف پرداخت جدید اولین خزانه مجاز را انتخاب می‌کند', () => {
	assert.equal(createPayment('terminal', TREASURIES).treasuryId, 't1');
	assert.equal(createPayment('check', TREASURIES).treasuryId, '');
});

test('مبلغ پیشنهادی مانده را صفر می‌کند', () => {
	const payments = [
		{ method: 'cash', treasuryId: 'c1', amount: 200000 },
		{ method: 'terminal', treasuryId: 't1', amount: 0 }
	];
	assert.equal(suggestedAmount(500000, payments, payments[1]), 300000);
});

test('همه روش‌های پرداخت شناسه یکتا دارند', () => {
	const keys = PAY_METHODS.map((method) => method.key);
	assert.equal(new Set(keys).size, keys.length);
});

/* ------------------------------- قالب‌بندی ------------------------------- */

test('ارقام فارسی و عربی به لاتین تبدیل می‌شوند', () => {
	assert.equal(toLatin('۱۲۳۴۵۶۷۸۹۰'), '1234567890');
	assert.equal(toLatin('١٢٣'), '123');
	assert.equal(toLatin('۱۲٬۵۰۰'), '12500');
	assert.equal(toLatin(null), '');
});

test('ورودی کاربر با جداکننده و ممیز فارسی خوانده می‌شود', () => {
	assert.equal(parseNum('۲۵۰,۰۰۰'), 250000);
	assert.equal(parseNum('۱۲٫۵'), 12.5);
	assert.equal(parseNum('abc'), 0);
	assert.equal(parseNum(''), 0);
});

test('نمایش عدد با ارقام فارسی', () => {
	assert.equal(fmt(1234567), '۱٬۲۳۴٬۵۶۷');
	assert.equal(fmt(null), '۰');
});

test('محاسبه تاریخ ساده درست است', () => {
	assert.equal(addDays('2024-02-28', 1), '2024-02-29');
	assert.equal(addDays('2024-12-31', 1), '2025-01-01');
});

test('شروع ماه بر مبنای تقویم شمسی است نه میلادی', () => {
	// ۳۰ آبان ۱۴۰۵ → اول آبان ۱۴۰۵ برابر ۲۳ اکتبر ۲۰۲۶
	assert.equal(monthStart('2026-11-21'), '2026-10-23');
	assert.equal(monthStart('2026-10-23'), '2026-10-23');
});

/* ------------------------------- تاریخ شمسی ------------------------------- */

test('نوروز درست تبدیل می‌شود', () => {
	assert.deepEqual(isoToJalali('2024-03-20'), { jy: 1403, jm: 1, jd: 1 });
	assert.deepEqual(isoToJalali('2025-03-21'), { jy: 1404, jm: 1, jd: 1 });
	assert.equal(jalaliToIso(1403, 1, 1), '2024-03-20');
});

test('تبدیل شمسی و میلادی رفت و برگشت سازگار است', () => {
	let iso = '2020-01-01';
	for (let i = 0; i < 2200; i += 1) {
		const jalali = isoToJalali(iso);
		assert.equal(jalaliToIso(jalali.jy, jalali.jm, jalali.jd), iso, `روز ${iso}`);
		iso = addDays(iso, 1);
	}
});

test('ورودی کاربر به تاریخ شمسی خوانده می‌شود', () => {
	assert.equal(parseJalaliInput('۱۴۰۵/۰۸/۳۰'), '2026-11-21');
	assert.equal(parseJalaliInput('1405-8-30'), '2026-11-21');
	assert.equal(parseJalaliInput('۱۴۰۵ ۰۸ ۳۰'), '2026-11-21');
	assert.equal(parseJalaliInput(''), null);
	assert.equal(parseJalaliInput('تاریخ'), null);
	assert.equal(parseJalaliInput('۱۴۰۵/۱۳/۰۱'), null);
});

test('روز نامعتبر در ماه پذیرفته نمی‌شود', () => {
	// ۱۴۰۵ کبیسه نیست، پس اسفند ۲۹ روز دارد
	assert.equal(isValidJalali(1405, 12, 30), false);
	assert.equal(isValidJalali(1405, 12, 29), true);
	assert.equal(parseJalaliInput('۱۴۰۵/۱۲/۳۱'), null);
});

test('نمایش تاریخ شمسی با ارقام فارسی', () => {
	assert.equal(jalaliInputText('2026-11-21'), '۱۴۰۵/۰۸/۳۰');
	assert.equal(jalaliLongText('2026-11-21'), '۳۰ آبان ۱۴۰۵');
	assert.equal(jalaliInputText(''), '');
});

/* ------------------------------- واحد کالا ------------------------------- */

test('واحد شمردنی فقط عدد صحیح می‌پذیرد', () => {
	assert.equal(normalizeQty('عدد', 2.4), 2);
	assert.equal(normalizeQty('عدد', 2.6), 3);
	assert.equal(normalizeQty('جفت', 0), 1);
	assert.equal(allowsFraction('عدد'), false);
});

test('واحد وزنی اعشار تا سه رقم می‌پذیرد', () => {
	assert.equal(allowsFraction('کیلوگرم'), true);
	assert.equal(normalizeQty('کیلوگرم', 1.23456), 1.235);
	assert.equal(normalizeQty('کیلوگرم', 0), MIN_FRACTIONAL_QTY);
	assert.equal(normalizeQty('کیلوگرم', 0, 0), 0);
});

test('گام دکمه‌های تعداد با واحد هماهنگ است', () => {
	assert.equal(stepFor('عدد'), 1);
	assert.equal(stepFor('کیلوگرم'), 0.5);
});

test('ورودی نامعتبر برای واحد پیام خطای فارسی می‌دهد', () => {
	assert.equal(validateQty('عدد', 2, 'تعداد'), null);
	assert.match(validateQty('عدد', 2.5, 'تعداد'), /عدد صحیح/);
	assert.match(validateQty('کیلوگرم', 0, 'تعداد'), /بزرگ‌تر از صفر/);
	assert.equal(validateQty('کیلوگرم', 0.75, 'تعداد'), null);
});

test('افزودن کالای کیلویی تعداد اعشاری را نگه می‌دارد', () => {
	const rice = { id: 3, name: 'برنج', unit: 'کیلوگرم', sale_price: 120000, stock_qty: 50 };
	const lines = addLine([], rice, { qty: 2.5 });
	assert.equal(lines[0].qty, 2.5);
	assert.equal(linesSubtotal(lines), 300000);
});

test('تنظیم دستی تعداد از قواعد واحد پیروی می‌کند', () => {
	const line = createLine(milk, { qty: 1 });
	assert.equal(setQty(line, 4.8).qty, 5);
	const kilo = createLine({ id: 3, name: 'برنج', unit: 'کیلوگرم', sale_price: 120000 }, { qty: 1 });
	assert.equal(setQty(kilo, 3.4567).qty, 3.457);
});

test('دکمه افزایش برای واحد کیلویی نیم‌کیلو اضافه می‌کند', () => {
	const kilo = createLine({ id: 3, name: 'برنج', unit: 'کیلوگرم', sale_price: 120000 }, { qty: 1 });
	assert.equal(changeQty(kilo, 1).qty, 1.5);
	assert.equal(changeQty(kilo, -1).qty, 0.5);
});
