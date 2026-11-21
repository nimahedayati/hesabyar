const { get } = require('../db/index.cjs');
const L = require('./ledger.cjs');
const INV = require('./inventory.cjs');
const V = require('./validate.cjs');
const U = require('./units.cjs');
const ACTOR = require('./actor.cjs');
const { r2 } = L;

const TYPE_META = {
	sale: { label: 'فروش', prefix: 'S' },
	purchase: { label: 'خرید', prefix: 'P' },
	sale_return: { label: 'برگشت از فروش', prefix: 'SR' },
	purchase_return: { label: 'برگشت از خرید', prefix: 'PR' },
	receipt: { label: 'دریافت', prefix: 'R' },
	payment: { label: 'پرداخت', prefix: 'PY' },
	expense: { label: 'هزینه', prefix: 'EX' },
	income: { label: 'درآمد', prefix: 'IN' },
	transfer: { label: 'انتقال وجه', prefix: 'TR' },
	opening: { label: 'موجودی اولیه', prefix: 'OP' },
	adjust: { label: 'اصلاح موجودی', prefix: 'AD' },
	journal: { label: 'سند دستی', prefix: 'JV' },
	check: { label: 'چک', prefix: 'CH' }
};

const today = () => new Date().toISOString().slice(0, 10);

const resolveDate = (value) => (value ? V.requireDate(value, 'تاریخ سند') : today());
const resolveWarehouse = (value) => V.optionalId(value) || INV.defaultWarehouse();

function setting(key, fallback = null) {
	const row = get().prepare('SELECT value FROM settings WHERE key=?').get(key);
	return row ? row.value : fallback;
}

function sys(code) {
	const a = get().prepare('SELECT id FROM accounts WHERE code=?').get(code);
	if (!a) throw new Error(`حساب پیش‌فرض ${code} یافت نشد`);
	return a.id;
}

function treasuryRow(tid) {
	const row = get()
		.prepare('SELECT id, kind, name, account_id, settle_treasury_id FROM treasuries WHERE id=?')
		.get(tid);
	if (!row) throw new Error('حساب خزانه یافت نشد');
	return row;
}

/**
 * حساب دفتری خزانه. کارتخوان حساب مستقل ندارد؛ هر مبلغی که با کارتخوان
 * دریافت شود به حساب بانکی متصل به آن واریز می‌شود.
 */
function treasuryAccount(tid) {
	if (!tid) return sys('1010');
	const t = treasuryRow(tid);
	if (t.kind === 'terminal') {
		const bank = get()
			.prepare("SELECT account_id FROM treasuries WHERE id=? AND kind='bank'")
			.get(t.settle_treasury_id);
		if (!bank?.account_id) throw new Error('کارتخوان به حساب بانکی متصل نیست');
		return bank.account_id;
	}
	if (!t.account_id) throw new Error('حساب خزانه یافت نشد');
	return t.account_id;
}

/** کارتخوان موجودی مستقل ندارد؛ انتقال و موجودی اولیه روی آن معنا ندارد */
function assertHasOwnBalance(tid, action) {
	const t = treasuryRow(tid);
	if (t.kind === 'terminal')
		throw new Error(`کارتخوان موجودی مستقل ندارد؛ ${action} را روی حساب بانکی متصل انجام دهید`);
	return t;
}

function partyAccount(pid) {
	const p = get().prepare('SELECT account_id FROM parties WHERE id=?').get(pid);
	if (!p || !p.account_id) throw new Error('حساب شخص یافت نشد');
	return p.account_id;
}

function allocNumber(type) {
	const meta = TYPE_META[type] || { prefix: 'D' };
	return L.nextSeq(type, meta.prefix, 5);
}

function insertDoc(d) {
	const db = get();
	const info = db
		.prepare(
			`INSERT INTO documents
			 (type,number,doc_date,party_id,party_name,warehouse_id,subtotal,discount,tax,extra_cost,total,paid,due,cost_total,profit,status,ref_id,note,created_by)
			 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'posted',?,?,?)`
		)
		.run(
			d.type,
			d.number,
			d.date,
			d.partyId ?? null,
			d.partyName ?? null,
			d.warehouseId ?? INV.defaultWarehouse(),
			r2(d.subtotal || 0),
			r2(d.discount || 0),
			r2(d.tax || 0),
			r2(d.extraCost || 0),
			r2(d.total || 0),
			r2(d.paid || 0),
			r2(d.due || 0),
			r2(d.costTotal || 0),
			r2(d.profit || 0),
			d.refId ?? null,
			d.note ?? null,
			d.createdBy ?? ACTOR.get().name
		);
	return info.lastInsertRowid;
}

function insertLines(docId, lines) {
	const db = get();
	const ins = db.prepare(
		`INSERT INTO document_lines(document_id,product_id,description,qty,unit,unit_price,discount,tax_rate,tax,line_total,unit_cost,cost_total,sort)
		 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
	);
	lines.forEach((l, i) =>
		ins.run(
			docId,
			l.productId ?? null,
			l.description ?? null,
			r2(l.qty),
			l.unit ?? null,
			r2(l.unitPrice),
			r2(l.discount || 0),
			r2(l.taxRate || 0),
			r2(l.tax || 0),
			r2(l.lineTotal),
			r2(l.unitCost || 0),
			r2(l.costTotal || 0),
			i
		)
	);
}

function insertPayments(docId, payments) {
	const db = get();
	const ins = db.prepare(
		`INSERT INTO document_payments(document_id,method,treasury_id,amount,ref_no,note) VALUES(?,?,?,?,?,?)`
	);
	for (const p of payments) {
		if (!p.amount) continue;
		ins.run(docId, p.method, p.treasuryId ?? null, r2(p.amount), p.refNo ?? null, p.note ?? null);
	}
}

function audit(action, entity, entityId, detail) {
	const actor = ACTOR.get();
	get()
		.prepare('INSERT INTO audit_log(user_id,user_name,action,entity,entity_id,detail) VALUES(?,?,?,?,?,?)')
		.run(
			actor.id,
			actor.name,
			action,
			entity,
			entityId,
			typeof detail === 'string' ? detail : JSON.stringify(detail)
		);
}

/* ================================================================== */
/*  فاکتور فروش                                                        */
/* ================================================================== */

function computeSale(p) {
	const db = get();
	const globalTax = Number(setting('tax_rate', '0')) || 0;
	const lines = (p.lines || [])
		.filter((l) => l.productId && Number(l.qty) > 0)
		.map((l) => {
			const prod = db.prepare('SELECT * FROM products WHERE id=?').get(l.productId);
			if (!prod) throw new Error('کالای انتخاب‌شده یافت نشد');
			const qty = Number(l.qty);
			const qtyError = U.validateQty(prod.unit, qty, `تعداد «${prod.name}»`);
			if (qtyError) throw new Error(qtyError);
			const unitPrice = Number(l.unitPrice ?? prod.sale_price);
			const gross = r2(qty * unitPrice);
			const discount = r2(l.discount || 0);
			const net = r2(gross - discount);
			const taxRate = Number(l.taxRate ?? prod.tax_rate ?? globalTax);
			const tax = r2((net * taxRate) / 100);
			return {
				productId: prod.id,
				description: l.description || prod.name,
				unit: l.unit || prod.unit,
				qty,
				unitPrice,
				discount,
				taxRate,
				tax,
				lineTotal: r2(net + tax),
				net,
				unitCost: r2(prod.avg_cost),
				costTotal: r2(qty * prod.avg_cost)
			};
		});

	if (!lines.length) throw new Error('برای ثبت فاکتور حداقل یک کالا لازم است');

	const subtotal = r2(lines.reduce((s, l) => s + l.net, 0));
	const tax = r2(lines.reduce((s, l) => s + l.tax, 0));
	const discount = r2(Math.min(p.discount || 0, subtotal));
	const total = r2(subtotal - discount + tax);
	const costTotal = r2(lines.reduce((s, l) => s + l.costTotal, 0));

	// «نسیه» روش پرداخت نیست؛ همان مانده فاکتور است و نباید جزء پرداختی شمرده شود
	const payments = (p.payments || []).filter((x) => Number(x.amount) > 0 && x.method !== 'credit');
	const paid = r2(payments.reduce((s, x) => s + Number(x.amount), 0));
	if (paid > total + 0.5) throw new Error('مبلغ پرداختی از مبلغ فاکتور بیشتر است');
	const due = r2(total - paid);

	return { lines, subtotal, tax, discount, total, paid, due, costTotal, payments };
}

function createSale(payload) {
	const db = get();
	const c = computeSale(payload);
	const date = resolveDate(payload.date);
	const warehouseId = resolveWarehouse(payload.warehouseId);
	const partyId = V.optionalId(payload.partyId);
	const isCredit = c.due > 0.5;

	if (isCredit && !partyId)
		throw new Error('برای فروش نسیه یا پرداخت ناقص، انتخاب مشتری الزامی است');

	const stockPolicy = setting('stock_policy', 'warn');
	const warnings = INV.checkStock(c.lines, stockPolicy);

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'sale',
			number: allocNumber('sale'),
			date,
			warehouseId,
			partyId,
			partyName: payload.partyName || (partyId ? null : 'مشتری متفرقه'),
			subtotal: c.subtotal,
			discount: c.discount,
			tax: c.tax,
			total: c.total,
			paid: c.paid,
			due: c.due,
			costTotal: c.costTotal,
			profit: r2(c.subtotal - c.discount - c.costTotal),
			note: payload.note,
			refId: payload.refId
		});

		insertLines(docId, c.lines);
		insertPayments(docId, c.payments);

		// آثار انباری
		for (const l of c.lines) {
			INV.applyMove({
				productId: l.productId,
				qty: -l.qty,
				unitCost: l.unitCost,
				date,
				warehouseId,
				documentId: docId,
				docType: 'sale',
				note: `فروش ${l.description}`
			});
		}

		// آثار مالی
		const jl = [];
		for (const p of c.payments) {
			jl.push({ accountId: treasuryAccount(p.treasuryId), debit: p.amount, credit: 0, description: `دریافت ${p.method}` });
		}
		if (c.due > 0.5) {
			jl.push({ accountId: partyAccount(partyId), partyId, debit: c.due, credit: 0, description: 'طلب از مشتری' });
		}
		jl.push({ accountId: sys('4000'), debit: 0, credit: c.subtotal, description: 'درآمد فروش' });
		if (c.discount > 0) jl.push({ accountId: sys('4020'), debit: c.discount, credit: 0, description: 'تخفیف فروش' });
		if (c.tax > 0) jl.push({ accountId: sys('2200'), debit: 0, credit: c.tax, description: 'مالیات فروش' });
		if (c.costTotal > 0) {
			jl.push({ accountId: sys('5000'), debit: c.costTotal, credit: 0, description: 'بهای تمام‌شده' });
			jl.push({ accountId: sys('1300'), debit: 0, credit: c.costTotal, description: 'خروج کالا از انبار' });
		}

		const journalId = L.postEntry({
			date,
			documentId: docId,
			description: `فاکتور فروش ${docId}`,
			lines: jl
		});
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'sale', docId, { total: c.total });
		return { id: docId, warnings };
	});

	return tx();
}

/* ================================================================== */
/*  فاکتور خرید                                                        */
/* ================================================================== */

function createPurchase(payload) {
	const db = get();
	const globalTax = Number(setting('tax_rate', '0')) || 0;
	const raw = (payload.lines || []).filter((l) => l.productId && Number(l.qty) > 0);
	if (!raw.length) throw new Error('برای ثبت فاکتور خرید حداقل یک کالا لازم است');

	const base = raw.map((l) => {
		const prod = db.prepare('SELECT * FROM products WHERE id=?').get(l.productId);
		if (!prod) throw new Error('کالای انتخاب‌شده یافت نشد');
		const qty = Number(l.qty);
		const qtyError = U.validateQty(prod.unit, qty, `تعداد «${prod.name}»`);
		if (qtyError) throw new Error(qtyError);
		const unitPrice = Number(l.unitPrice ?? prod.purchase_price);
		const gross = r2(qty * unitPrice);
		const discount = r2(l.discount || 0);
		const net = r2(gross - discount);
		return {
			prod,
			qty,
			unitPrice,
			discount,
			net,
			taxRate: Number(l.taxRate ?? prod.tax_rate ?? globalTax)
		};
	});

	const subtotal = r2(base.reduce((s, l) => s + l.net, 0));
	const discount = r2(Math.min(payload.discount || 0, subtotal));
	const extraCost = r2(payload.extraCost || 0);

	// تخصیص هزینه‌های جانبی به نسبت ارزش هر ردیف (اثر در بهای تمام‌شده)
	const lines = base.map((l) => {
		const share = subtotal > 0 ? (l.net / subtotal) * extraCost : 0;
		const landed = r2(l.net + share);
		const tax = r2((landed * l.taxRate) / 100);
		const unitCost = l.qty > 0 ? r2(landed / l.qty) : 0;
		return {
			productId: l.prod.id,
			description: l.prod.name,
			unit: l.prod.unit,
			qty: l.qty,
			unitPrice: l.unitPrice,
			discount: l.discount,
			taxRate: l.taxRate,
			tax,
			lineTotal: r2(landed + tax),
			net: landed,
			unitCost,
			costTotal: r2(unitCost * l.qty)
		};
	});

	const tax = r2(lines.reduce((s, l) => s + l.tax, 0));
	const total = r2(subtotal - discount + extraCost + tax);
	const payments = (payload.payments || []).filter((x) => Number(x.amount) > 0 && x.method !== 'credit');
	const paid = r2(payments.reduce((s, x) => s + Number(x.amount), 0));
	if (paid > total + 0.5) throw new Error('مبلغ پرداختی از مبلغ فاکتور بیشتر است');
	const due = r2(total - paid);
	const partyId = payload.partyId || null;
	if (due > 0.5 && !partyId) throw new Error('برای خرید نسیه، انتخاب تأمین‌کننده الزامی است');

	const date = resolveDate(payload.date);
	const warehouseId = resolveWarehouse(payload.warehouseId);
	const invValue = r2(subtotal - discount + extraCost);

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'purchase',
			number: allocNumber('purchase'),
			date,
			warehouseId,
			partyId,
			partyName: payload.partyName,
			subtotal,
			discount,
			tax,
			extraCost,
			total,
			paid,
			due,
			note: payload.note,
			refId: payload.refId
		});
		insertLines(docId, lines);
		insertPayments(docId, payments);

		for (const l of lines) {
			INV.applyMove({
				productId: l.productId,
				qty: l.qty,
				unitCost: l.unitCost,
				date,
				warehouseId,
				documentId: docId,
				docType: 'purchase',
				note: `خرید ${l.description}`
			});
			db.prepare('UPDATE products SET purchase_price=? WHERE id=?').run(l.unitPrice, l.productId);
		}

		const jl = [];
		jl.push({ accountId: sys('1300'), debit: invValue, credit: 0, description: 'افزایش موجودی انبار' });
		if (tax > 0) jl.push({ accountId: sys('2200'), debit: tax, credit: 0, description: 'مالیات خرید' });
		for (const p of payments) {
			jl.push({ accountId: treasuryAccount(p.treasuryId), debit: 0, credit: p.amount, description: `پرداخت ${p.method}` });
		}
		if (due > 0.5) jl.push({ accountId: partyAccount(partyId), partyId, debit: 0, credit: due, description: 'بدهی به تأمین‌کننده' });

		const journalId = L.postEntry({ date, documentId: docId, description: `فاکتور خرید ${docId}`, lines: jl });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'purchase', docId, { total });
		return { id: docId };
	});

	return tx();
}

/* ================================================================== */
/*  برگشت از فروش / خرید                                               */
/* ================================================================== */

function loadDoc(id) {
	const db = get();
	const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(id);
	if (!doc) throw new Error('سند یافت نشد');
	if (doc.status === 'voided') throw new Error('این سند قبلاً ابطال شده است');
	doc.lines = db.prepare('SELECT * FROM document_lines WHERE document_id=? ORDER BY sort').all(id);
	doc.payments = db.prepare('SELECT * FROM document_payments WHERE document_id=?').all(id);
	return doc;
}

function createSaleReturn(payload) {
	const db = get();
	const src = loadDoc(payload.refId);
	if (src.type !== 'sale') throw new Error('سند مرجع باید فاکتور فروش باشد');
	const date = resolveDate(payload.date);

	const lines = (payload.lines || [])
		.map((l) => {
			const orig = src.lines.find((x) => x.id === l.lineId || x.product_id === l.productId);
			if (!orig) return null;
			const qty = Math.min(Number(l.qty), orig.qty);
			if (!(qty > 0)) return null;
			const qtyError = U.validateQty(orig.unit, qty, `تعداد «${orig.description}»`);
			if (qtyError) throw new Error(qtyError);
			const perUnit = orig.qty > 0 ? orig.line_total / orig.qty : orig.unit_price;
			const net = r2(qty * perUnit);
			return {
				productId: orig.product_id,
				description: orig.description,
				unit: orig.unit,
				qty,
				unitPrice: r2(perUnit),
				discount: 0,
				taxRate: 0,
				tax: 0,
				lineTotal: net,
				net,
				unitCost: orig.unit_cost,
				costTotal: r2(qty * orig.unit_cost)
			};
		})
		.filter(Boolean);

	if (!lines.length) throw new Error('موردی برای برگشت انتخاب نشده است');

	const total = r2(lines.reduce((s, l) => s + l.lineTotal, 0));
	const costTotal = r2(lines.reduce((s, l) => s + l.costTotal, 0));
	const treasuryId = payload.treasuryId;
	const settleCredit = payload.settle === 'credit';
	if (!settleCredit && !treasuryId) throw new Error('حساب بازپرداخت را انتخاب کنید');
	if (settleCredit && !src.party_id) throw new Error('برای تسویه اعتباری، فاکتور اصلی باید مشتری داشته باشد');

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'sale_return',
			number: allocNumber('sale_return'),
			date,
			warehouseId: src.warehouse_id,
			partyId: src.party_id,
			partyName: src.party_name,
			subtotal: total,
			total,
			paid: settleCredit ? 0 : total,
			due: settleCredit ? total : 0,
			costTotal,
			profit: r2(-total + costTotal),
			refId: src.id,
			note: payload.note
		});
		insertLines(docId, lines);

		for (const l of lines) {
			INV.applyMove({
				productId: l.productId,
				qty: l.qty,
				unitCost: l.unitCost,
				date,
				warehouseId: src.warehouse_id,
				documentId: docId,
				docType: 'sale_return',
				note: `برگشت از فروش ${l.description}`
			});
		}

		const jl = [
			{ accountId: sys('4010'), debit: total, credit: 0, description: 'برگشت از فروش' },
			{ accountId: sys('1300'), debit: costTotal, credit: 0, description: 'بازگشت کالا به انبار' },
			{ accountId: sys('5000'), debit: 0, credit: costTotal, description: 'برگشت بهای تمام‌شده' }
		];
		if (settleCredit) {
			jl.push({ accountId: partyAccount(src.party_id), partyId: src.party_id, debit: 0, credit: total, description: 'بستانکار شدن مشتری' });
		} else {
			jl.push({ accountId: treasuryAccount(treasuryId), debit: 0, credit: total, description: 'بازپرداخت به مشتری' });
		}

		const journalId = L.postEntry({ date, documentId: docId, description: `برگشت از فروش ${src.number}`, lines: jl });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'sale_return', docId, { total, ref: src.number });
		return { id: docId };
	});

	return tx();
}

function createPurchaseReturn(payload) {
	const db = get();
	const src = loadDoc(payload.refId);
	if (src.type !== 'purchase') throw new Error('سند مرجع باید فاکتور خرید باشد');
	const date = resolveDate(payload.date);

	const lines = (payload.lines || [])
		.map((l) => {
			const orig = src.lines.find((x) => x.id === l.lineId || x.product_id === l.productId);
			if (!orig) return null;
			const qty = Math.min(Number(l.qty), orig.qty);
			if (!(qty > 0)) return null;
			const qtyError = U.validateQty(orig.unit, qty, `تعداد «${orig.description}»`);
			if (qtyError) throw new Error(qtyError);
			const net = r2(qty * orig.unit_price);
			return {
				productId: orig.product_id,
				description: orig.description,
				unit: orig.unit,
				qty,
				unitPrice: orig.unit_price,
				discount: 0,
				taxRate: 0,
				tax: 0,
				lineTotal: net,
				net,
				unitCost: orig.unit_cost,
				costTotal: r2(qty * orig.unit_cost)
			};
		})
		.filter(Boolean);

	if (!lines.length) throw new Error('موردی برای برگشت انتخاب نشده است');

	const total = r2(lines.reduce((s, l) => s + l.lineTotal, 0));
	const costTotal = r2(lines.reduce((s, l) => s + l.costTotal, 0));
	const settleCredit = payload.settle === 'credit';
	const treasuryId = payload.treasuryId;
	if (!settleCredit && !treasuryId) throw new Error('حساب دریافت را انتخاب کنید');
	if (settleCredit && !src.party_id) throw new Error('برای تسویه اعتباری، فاکتور اصلی باید تأمین‌کننده داشته باشد');

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'purchase_return',
			number: allocNumber('purchase_return'),
			date,
			warehouseId: src.warehouse_id,
			partyId: src.party_id,
			partyName: src.party_name,
			subtotal: total,
			total,
			paid: settleCredit ? 0 : total,
			due: settleCredit ? total : 0,
			costTotal,
			refId: src.id,
			note: payload.note
		});
		insertLines(docId, lines);

		for (const l of lines) {
			INV.applyMove({
				productId: l.productId,
				qty: -l.qty,
				unitCost: l.unitCost,
				date,
				warehouseId: src.warehouse_id,
				documentId: docId,
				docType: 'purchase_return',
				note: `برگشت به تأمین‌کننده ${l.description}`
			});
		}

		// برگشت خرید، سند خرید را معکوس می‌کند: انبار به بهای تمام‌شده کاهش می‌یابد
		// و مبلغ فاکتور از بدهی/نقد خارج می‌شود؛ اختلاف دو مبلغ در بهای تمام‌شده اصلاح می‌گردد.
		const jl = [{ accountId: sys('1300'), debit: 0, credit: costTotal, description: 'کاهش موجودی انبار' }];
		if (settleCredit) {
			jl.push({ accountId: partyAccount(src.party_id), partyId: src.party_id, debit: total, credit: 0, description: 'بدهکار شدن تأمین‌کننده' });
		} else {
			jl.push({ accountId: treasuryAccount(treasuryId), debit: total, credit: 0, description: 'دریافت از تأمین‌کننده' });
		}

		const variance = r2(total - costTotal);
		if (variance > 0.01) {
			jl.push({ accountId: sys('5000'), debit: 0, credit: variance, description: 'اصلاح بهای تمام‌شده' });
		} else if (variance < -0.01) {
			jl.push({ accountId: sys('5000'), debit: -variance, credit: 0, description: 'اصلاح بهای تمام‌شده' });
		}

		const journalId = L.postEntry({ date, documentId: docId, description: `برگشت از خرید ${src.number}`, lines: jl });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'purchase_return', docId, { total, ref: src.number });
		return { id: docId };
	});

	return tx();
}

/* ================================================================== */
/*  دریافت / پرداخت / هزینه / درآمد / انتقال                           */
/* ================================================================== */

function createReceipt(p) {
	const db = get();
	const date = resolveDate(p.date);
	const amount = r2(p.amount);
	if (!(amount > 0)) throw new Error('مبلغ دریافت باید بزرگ‌تر از صفر باشد');
	if (!p.treasuryId) throw new Error('حساب دریافت‌کننده را انتخاب کنید');

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'receipt',
			number: allocNumber('receipt'),
			date,
			partyId: p.partyId || null,
			total: amount,
			paid: amount,
			note: p.note
		});
		insertPayments(docId, [{ method: p.method || 'cash', treasuryId: p.treasuryId, amount, refNo: p.refNo }]);

		const jl = [{ accountId: treasuryAccount(p.treasuryId), debit: amount, credit: 0, description: 'دریافت وجه' }];
		if (p.partyId) {
			jl.push({ accountId: partyAccount(p.partyId), partyId: p.partyId, debit: 0, credit: amount, description: 'تسویه حساب شخص' });
		} else {
			jl.push({ accountId: p.accountId || sys('4900'), debit: 0, credit: amount, description: 'درآمد/دریافت متفرقه' });
		}
		const journalId = L.postEntry({ date, documentId: docId, description: 'سند دریافت', lines: jl });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'receipt', docId, { amount });
		return { id: docId };
	});
	return tx();
}

function createPayment(p) {
	const db = get();
	const date = resolveDate(p.date);
	const amount = r2(p.amount);
	if (!(amount > 0)) throw new Error('مبلغ پرداخت باید بزرگ‌تر از صفر باشد');
	if (!p.treasuryId) throw new Error('حساب پرداخت‌کننده را انتخاب کنید');

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'payment',
			number: allocNumber('payment'),
			date,
			partyId: p.partyId || null,
			total: amount,
			paid: amount,
			note: p.note
		});
		insertPayments(docId, [{ method: p.method || 'cash', treasuryId: p.treasuryId, amount, refNo: p.refNo }]);

		const jl = [{ accountId: treasuryAccount(p.treasuryId), debit: 0, credit: amount, description: 'پرداخت وجه' }];
		if (p.partyId) {
			jl.push({ accountId: partyAccount(p.partyId), partyId: p.partyId, debit: amount, credit: 0, description: 'تسویه حساب شخص' });
		} else {
			jl.push({ accountId: p.accountId || sys('6900'), debit: amount, credit: 0, description: 'پرداخت متفرقه' });
		}
		const journalId = L.postEntry({ date, documentId: docId, description: 'سند پرداخت', lines: jl });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'payment', docId, { amount });
		return { id: docId };
	});
	return tx();
}

function createExpense(p) {
	const db = get();
	const date = resolveDate(p.date);
	const amount = r2(p.amount);
	if (!(amount > 0)) throw new Error('مبلغ هزینه باید بزرگ‌تر از صفر باشد');
	if (!p.accountId) throw new Error('نوع هزینه را انتخاب کنید');
	if (!p.treasuryId && !p.partyId) throw new Error('حساب پرداخت‌کننده را انتخاب کنید');

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'expense',
			number: allocNumber('expense'),
			date,
			partyId: p.partyId || null,
			total: amount,
			paid: p.treasuryId ? amount : 0,
			due: p.treasuryId ? 0 : amount,
			note: p.note
		});
		if (p.treasuryId) insertPayments(docId, [{ method: 'cash', treasuryId: p.treasuryId, amount }]);

		const jl = [{ accountId: p.accountId, debit: amount, credit: 0, description: p.note || 'هزینه' }];
		if (p.treasuryId) {
			jl.push({ accountId: treasuryAccount(p.treasuryId), debit: 0, credit: amount, description: 'پرداخت هزینه' });
		} else {
			jl.push({ accountId: partyAccount(p.partyId), partyId: p.partyId, debit: 0, credit: amount, description: 'بدهی هزینه' });
		}
		const journalId = L.postEntry({ date, documentId: docId, description: 'سند هزینه', lines: jl });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'expense', docId, { amount });
		return { id: docId };
	});
	return tx();
}

function createIncome(p) {
	const db = get();
	const date = resolveDate(p.date);
	const amount = r2(p.amount);
	if (!(amount > 0)) throw new Error('مبلغ درآمد باید بزرگ‌تر از صفر باشد');
	if (!p.treasuryId) throw new Error('حساب دریافت‌کننده را انتخاب کنید');

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'income',
			number: allocNumber('income'),
			date,
			total: amount,
			paid: amount,
			note: p.note
		});
		insertPayments(docId, [{ method: 'cash', treasuryId: p.treasuryId, amount }]);
		const jl = [
			{ accountId: treasuryAccount(p.treasuryId), debit: amount, credit: 0, description: 'دریافت درآمد' },
			{ accountId: p.accountId || sys('4900'), debit: 0, credit: amount, description: p.note || 'درآمد' }
		];
		const journalId = L.postEntry({ date, documentId: docId, description: 'سند درآمد', lines: jl });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'income', docId, { amount });
		return { id: docId };
	});
	return tx();
}

function createTransfer(p) {
	const db = get();
	const date = resolveDate(p.date);
	const amount = r2(p.amount);
	if (!(amount > 0)) throw new Error('مبلغ انتقال باید بزرگ‌تر از صفر باشد');
	if (!p.fromTreasuryId || !p.toTreasuryId) throw new Error('حساب مبدأ و مقصد را انتخاب کنید');
	if (p.fromTreasuryId === p.toTreasuryId) throw new Error('حساب مبدأ و مقصد نباید یکی باشند');
	assertHasOwnBalance(p.fromTreasuryId, 'انتقال');
	assertHasOwnBalance(p.toTreasuryId, 'انتقال');

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'transfer',
			number: allocNumber('transfer'),
			date,
			total: amount,
			note: p.note
		});
		const jl = [
			{ accountId: treasuryAccount(p.toTreasuryId), debit: amount, credit: 0, description: 'واریز به حساب مقصد' },
			{ accountId: treasuryAccount(p.fromTreasuryId), debit: 0, credit: amount, description: 'برداشت از حساب مبدأ' }
		];
		const journalId = L.postEntry({ date, documentId: docId, description: 'انتقال بین حساب‌ها', lines: jl });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'transfer', docId, { amount });
		return { id: docId };
	});
	return tx();
}

/* ================================================================== */
/*  ابطال و اصلاح                                                      */
/* ================================================================== */

function voidDocument(id, reason = '') {
	const db = get();
	const doc = loadDoc(id);
	const date = today();

	const tx = db.transaction(() => {
		// ۱) برگشت آثار مالی
		if (doc.journal_id) L.reverseEntry(doc.journal_id, date, reason || 'ابطال سند');

		// ۲) برگشت آثار انباری
		const moves = db.prepare('SELECT * FROM stock_moves WHERE document_id=?').all(id);
		const affected = new Set();
		for (const m of moves) {
			db.prepare(
				`INSERT INTO stock_moves(product_id,warehouse_id,document_id,doc_type,move_date,qty,unit_cost,balance_qty,balance_avg,note)
				 VALUES(?,?,?,?,?,?,?,0,0,?)`
			).run(m.product_id, m.warehouse_id, id, 'void', date, -m.qty, m.unit_cost, `ابطال ${doc.number}`);
			affected.add(m.product_id);
		}
		// ۳) بازسازی موجودی و میانگین از تاریخچه
		for (const pid of affected) INV.recomputeProduct(pid);

		db.prepare('UPDATE documents SET status=?, voided_at=?, void_reason=? WHERE id=?').run(
			'voided',
			new Date().toISOString(),
			reason,
			id
		);
		audit('ابطال', doc.type, id, { reason, number: doc.number });
		return { ok: true };
	});
	return tx();
}

/** اصلاح سند = ابطال سند قبلی + ثبت سند جدید با ارجاع، بدون از دست رفتن سابقه */
function reviseDocument(id, payload) {
	const doc = loadDoc(id);
	const type = doc.type;
	const create = {
		sale: createSale,
		purchase: createPurchase,
		receipt: createReceipt,
		payment: createPayment,
		expense: createExpense,
		income: createIncome
	}[type];
	if (!create) throw new Error('این نوع سند قابل اصلاح نیست');
	voidDocument(id, 'اصلاح سند');
	const res = create({ ...payload, refId: id });
	return res;
}

/* ================================================================== */
/*  سند حسابداری دستی                                                  */
/* ================================================================== */

/**
 * ثبت سند دستی (آرتیکل) — برای اصلاحات، انتقال‌های بین حساب‌ها و ثبت‌های
 * خارج از چرخه فروش/خرید. تراز بودن سند الزامی است و همه ردیف‌ها در
 * دفتر روزنامه ثبت می‌شوند تا گزارش‌ها یکپارچه بمانند.
 */
function createJournal(p) {
	const db = get();
	const date = resolveDate(p.date);
	const description = V.requireText(p.description, 'شرح سند', 200);

	const rows = (p.lines || [])
		.map((l) => ({
			accountId: V.requireId(l.accountId, 'حساب'),
			partyId: V.optionalId(l.partyId),
			debit: r2(Math.max(Number(l.debit) || 0, 0)),
			credit: r2(Math.max(Number(l.credit) || 0, 0)),
			description: V.optionalText(l.description, 200)
		}))
		.filter((l) => l.debit > 0 || l.credit > 0);

	if (rows.length < 2) throw new Error('سند دستی باید حداقل دو ردیف بدهکار/بستانکار داشته باشد');
	const withBoth = rows.find((l) => l.debit > 0 && l.credit > 0);
	if (withBoth) throw new Error('هر ردیف فقط می‌تواند بدهکار یا بستانکار باشد، نه هر دو');

	const debit = r2(rows.reduce((s, l) => s + l.debit, 0));
	const credit = r2(rows.reduce((s, l) => s + l.credit, 0));
	if (Math.abs(debit - credit) > 0.01) {
		throw new Error(`سند تراز نیست — بدهکار ${debit.toLocaleString('fa-IR')} و بستانکار ${credit.toLocaleString('fa-IR')}`);
	}

	const tx = db.transaction(() => {
		const number = allocNumber('journal');
		const docId = insertDoc({
			type: 'journal',
			number,
			date,
			subtotal: debit,
			total: debit,
			note: description
		});

		const journalId = L.postEntry({ date, documentId: docId, description, lines: rows });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);
		audit('ثبت', 'journal', docId, { debit, rows: rows.length });
		return { id: docId, number, journalId, total: debit };
	});
	return tx();
}

/* ================================================================== */
/*  موجودی اولیه                                                       */
/* ================================================================== */

function createOpening(p) {
	const db = get();
	const date = resolveDate(p.date);
	const warehouseId = resolveWarehouse(p.warehouseId);
	const items = (p.items || []).filter((i) => i.productId && Number(i.qty) > 0);
	const cashLines = (p.cash || []).filter((c) => Number(c.amount) > 0);
	const partyLines = (p.parties || []).filter((c) => Number(c.amount) !== 0);

	if (!items.length && !cashLines.length && !partyLines.length)
		throw new Error('برای ثبت موجودی اولیه، حداقل یک ردیف کالا، خزانه یا شخص لازم است');

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'opening',
			number: allocNumber('opening'),
			date,
			warehouseId,
			total: 0,
			note: p.note || 'ثبت موجودی اولیه'
		});

		const jl = [];
		let invValue = 0;
		for (const it of items) {
			const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.productId);
			if (!prod) continue;
			const qty = Number(it.qty);
			const qtyError = U.validateQty(prod.unit, qty, `تعداد «${prod.name}»`);
			if (qtyError) throw new Error(qtyError);
			const unitCost = r2(Number(it.unitCost ?? prod.avg_cost ?? prod.purchase_price));
			INV.applyMove({
				productId: it.productId,
				qty,
				unitCost,
				date,
				warehouseId,
				documentId: docId,
				docType: 'opening',
				note: 'موجودی اولیه'
			});
			db.prepare('UPDATE products SET avg_cost=? WHERE id=?').run(unitCost, it.productId);
			invValue = r2(invValue + qty * unitCost);
		}
		if (invValue > 0) jl.push({ accountId: sys('1300'), debit: invValue, credit: 0, description: 'موجودی اولیه کالا' });

		for (const c of cashLines) {
			// کارتخوان حساب ندارد؛ موجودی اولیه‌اش روی حساب بانکی متصل ثبت می‌شود
			assertHasOwnBalance(c.treasuryId, 'ثبت موجودی اولیه');
			jl.push({ accountId: treasuryAccount(c.treasuryId), debit: r2(c.amount), credit: 0, description: 'موجودی اولیه خزانه' });
		}
		for (const pt of partyLines) {
			const amt = r2(pt.amount);
			if (amt > 0) jl.push({ accountId: partyAccount(pt.partyId), partyId: pt.partyId, debit: amt, credit: 0, description: 'مانده اولیه بدهکار' });
			else jl.push({ accountId: partyAccount(pt.partyId), partyId: pt.partyId, debit: 0, credit: -amt, description: 'مانده اولیه بستانکار' });
		}

		const dr = r2(jl.reduce((s, l) => s + l.debit, 0));
		const cr = r2(jl.reduce((s, l) => s + l.credit, 0));
		const diff = r2(dr - cr);
		if (Math.abs(diff) > 0.01) {
			if (diff > 0) jl.push({ accountId: sys('3000'), debit: 0, credit: diff, description: 'سرمایه اولیه' });
			else jl.push({ accountId: sys('3000'), debit: -diff, credit: 0, description: 'سرمایه اولیه' });
		}

		const journalId = L.postEntry({ date, documentId: docId, description: 'سند موجودی اولیه', lines: jl });
		db.prepare('UPDATE documents SET journal_id=?, total=? WHERE id=?').run(journalId, dr, docId);
		audit('ثبت', 'opening', docId, { invValue });
		return { id: docId, inventoryValue: invValue, capital: Math.abs(diff) };
	});
	return tx();
}

/* ================================================================== */
/*  چک                                                                 */
/* ================================================================== */

function createCheck(p) {
	const db = get();
	const amount = r2(p.amount);
	if (!(amount > 0)) throw new Error('مبلغ چک باید بزرگ‌تر از صفر باشد');
	if (!p.partyId) throw new Error('طرف حساب چک را انتخاب کنید');
	const date = resolveDate(p.issueDate);

	const tx = db.transaction(() => {
		const docId = insertDoc({
			type: 'check',
			number: allocNumber('check'),
			date,
			partyId: p.partyId,
			total: amount,
			note: p.note
		});
		const jl =
			p.direction === 'received'
				? [
						{ accountId: sys('1400'), debit: amount, credit: 0, description: 'چک دریافتنی' },
						{ accountId: partyAccount(p.partyId), partyId: p.partyId, debit: 0, credit: amount, description: 'دریافت چک از مشتری' }
					]
				: [
						{ accountId: partyAccount(p.partyId), partyId: p.partyId, debit: amount, credit: 0, description: 'پرداخت چک به تأمین‌کننده' },
						{ accountId: sys('2100'), debit: 0, credit: amount, description: 'چک پرداختنی' }
					];
		const journalId = L.postEntry({ date, documentId: docId, description: 'ثبت چک', lines: jl });
		db.prepare('UPDATE documents SET journal_id=? WHERE id=?').run(journalId, docId);

		const checkId = db
			.prepare(
				`INSERT INTO checks(direction,party_id,serial,amount,issue_date,due_date,bank_name,branch,treasury_id,status,document_id,note)
				 VALUES(?,?,?,?,?,?,?,?,?,'in_hand',?,?)`
			)
			.run(
				p.direction,
				p.partyId,
				p.serial ?? null,
				amount,
				date,
				p.dueDate ?? date,
				p.bankName ?? null,
				p.branch ?? null,
				p.treasuryId ?? null,
				docId,
				p.note ?? null
			).lastInsertRowid;
		audit('ثبت', 'check', checkId, { amount, direction: p.direction });
		return { id: checkId, docId };
	});
	return tx();
}

function settleCheck(id, action, { treasuryId = null, partyId = null, date = null } = {}) {
	const db = get();
	const chk = db.prepare('SELECT * FROM checks WHERE id=?').get(id);
	if (!chk) throw new Error('چک یافت نشد');
	if (['collected', 'spent', 'returned', 'cancelled'].includes(chk.status))
		throw new Error('این چک قبلاً تسویه یا برگشت شده است');
	const d = date || today();
	const amount = r2(chk.amount);

	const tx = db.transaction(() => {
		let jl = [];
		let status = chk.status;
		if (chk.direction === 'received') {
			if (action === 'collected') {
				if (!treasuryId) throw new Error('حساب بانکی وصول را انتخاب کنید');
				jl = [
					{ accountId: treasuryAccount(treasuryId), debit: amount, credit: 0, description: 'وصول چک' },
					{ accountId: sys('1400'), debit: 0, credit: amount, description: 'کاهش چک دریافتنی' }
				];
				status = 'collected';
			} else if (action === 'endorsed') {
				if (!partyId) throw new Error('شخص واگذارگیرنده را انتخاب کنید');
				jl = [
					{ accountId: partyAccount(partyId), partyId, debit: amount, credit: 0, description: 'واگذاری چک' },
					{ accountId: sys('1400'), debit: 0, credit: amount, description: 'کاهش چک دریافتنی' }
				];
				status = 'endorsed';
			} else if (action === 'returned') {
				jl = [
					{ accountId: partyAccount(chk.party_id), partyId: chk.party_id, debit: amount, credit: 0, description: 'برگشت چک' },
					{ accountId: sys('1400'), debit: 0, credit: amount, description: 'کاهش چک دریافتنی' }
				];
				status = 'returned';
			}
		} else {
			if (action === 'cleared') {
				if (!treasuryId) throw new Error('حساب بانکی پرداخت را انتخاب کنید');
				jl = [
					{ accountId: sys('2100'), debit: amount, credit: 0, description: 'تسویه چک پرداختنی' },
					{ accountId: treasuryAccount(treasuryId), debit: 0, credit: amount, description: 'برداشت از بانک' }
				];
				status = 'spent';
			} else if (action === 'cancelled') {
				jl = [
					{ accountId: sys('2100'), debit: amount, credit: 0, description: 'ابطال چک پرداختنی' },
					{ accountId: partyAccount(chk.party_id), partyId: chk.party_id, debit: 0, credit: amount, description: 'برگشت بدهی' }
				];
				status = 'cancelled';
			}
		}
		if (!jl.length) throw new Error('عملیات نامعتبر است');
		L.postEntry({ date: d, documentId: chk.document_id, description: `تغییر وضعیت چک ${chk.serial || chk.id}`, lines: jl });
		db.prepare('UPDATE checks SET status=? WHERE id=?').run(status, id);
		audit('تغییر وضعیت', 'check', id, { action, status });
		return { ok: true, status };
	});
	return tx();
}

module.exports = {
	createSale,
	createPurchase,
	createSaleReturn,
	createPurchaseReturn,
	createReceipt,
	createPayment,
	createExpense,
	createIncome,
	createTransfer,
	createOpening,
	createJournal,
	createCheck,
	settleCheck,
	voidDocument,
	reviseDocument,
	loadDoc,
	setting,
	sys,
	TYPE_META,
	today
};
