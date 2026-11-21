const { get } = require('../db/index.cjs');
const { r2 } = require('./ledger.cjs');

function product(id) {
	return get().prepare('SELECT * FROM products WHERE id=?').get(id);
}

function defaultWarehouse() {
	const w = get().prepare('SELECT id FROM warehouses WHERE is_default=1 LIMIT 1').get();
	return w ? w.id : get().prepare('SELECT id FROM warehouses LIMIT 1').get()?.id ?? null;
}

/**
 * محاسبه بهای تمام‌شده با روش «میانگین موزون متحرک»
 * ------------------------------------------------------------------
 * ورود کالا: میانگین جدید = (موجودی قبلی × میانگین قبلی + تعداد × بهای ورود) ÷ موجودی جدید
 * خروج کالا: میانگین تغییر نمی‌کند و بهای تمام‌شده = تعداد × میانگین جاری
 * اگر موجودی منفی/صفر باشد، اولین ورود بعدی میانگین را بازنشانی می‌کند.
 */
function applyMove({
	productId,
	qty,
	unitCost = 0,
	date,
	documentId = null,
	docType = null,
	warehouseId = null,
	note = ''
}) {
	const db = get();
	const p = product(productId);
	if (!p) throw new Error('کالا یافت نشد');

	const oldQty = Number(p.stock_qty) || 0;
	const oldAvg = Number(p.avg_cost) || 0;
	let newQty = r2(oldQty + qty);
	let newAvg = oldAvg;

	if (qty > 0) {
		if (oldQty > 0) newAvg = r2((oldQty * oldAvg + qty * unitCost) / newQty);
		else newAvg = r2(unitCost);
	} else if (newQty <= 0) {
		// موجودی صفر/منفی: میانگین برای ورودهای بعدی بازنشانی می‌شود
		if (newQty === 0) newAvg = oldAvg;
	}

	db.prepare(
		`INSERT INTO stock_moves(product_id,warehouse_id,document_id,doc_type,move_date,qty,unit_cost,balance_qty,balance_avg,note)
		 VALUES(?,?,?,?,?,?,?,?,?,?)`
	).run(
		productId,
		warehouseId ?? defaultWarehouse(),
		documentId,
		docType,
		date,
		qty,
		r2(unitCost),
		newQty,
		newAvg,
		note
	);

	db.prepare('UPDATE products SET stock_qty=?, avg_cost=? WHERE id=?').run(newQty, newAvg, productId);

	return { qty: newQty, avg: newAvg, cogs: r2(Math.abs(Math.min(qty, 0)) * oldAvg) };
}

/**
 * بازسازی کامل موجودی و میانگین یک کالا از روی تاریخچه گردش انبار.
 * پس از هر ابطال/اصلاح سند اجرا می‌شود تا اعداد قطعاً سازگار بمانند.
 */
function recomputeProduct(productId) {
	const db = get();
	const moves = db.prepare('SELECT * FROM stock_moves WHERE product_id=? ORDER BY id').all(productId);
	let qty = 0;
	let avg = 0;
	const upd = db.prepare('UPDATE stock_moves SET balance_qty=?, balance_avg=? WHERE id=?');
	for (const m of moves) {
		if (m.qty > 0) {
			const nq = qty + m.qty;
			avg = qty > 0 ? r2((qty * avg + m.qty * m.unit_cost) / nq) : r2(m.unit_cost);
			qty = r2(nq);
		} else {
			qty = r2(qty + m.qty);
		}
		upd.run(qty, avg, m.id);
	}
	db.prepare('UPDATE products SET stock_qty=?, avg_cost=? WHERE id=?').run(qty, avg, productId);
	return { qty, avg };
}

function checkStock(lines, policy) {
	if (policy === 'allow') return [];
	const db = get();
	const problems = [];
	for (const l of lines) {
		if (!l.productId) continue;
		const p = db.prepare('SELECT name, stock_qty FROM products WHERE id=?').get(l.productId);
		if (!p) continue;
		if (p.stock_qty - l.qty < 0) {
			problems.push({ name: p.name, available: p.stock_qty, requested: l.qty });
		}
	}
	if (policy === 'block' && problems.length) {
		const msg = problems
			.map((p) => `«${p.name}» موجودی ${p.available} دارد اما ${p.requested} درخواست شده`)
			.join(' ، ');
		throw new Error(`موجودی کافی نیست: ${msg}`);
	}
	return problems;
}

function kardex(productId, { from = null, to = null } = {}) {
	return get()
		.prepare(
			`SELECT sm.*, d.number doc_number, d.type doc_type_name
			 FROM stock_moves sm LEFT JOIN documents d ON d.id = sm.document_id
			 WHERE sm.product_id=? AND (? IS NULL OR sm.move_date>=?) AND (? IS NULL OR sm.move_date<=?)
			 ORDER BY sm.move_date, sm.id`
		)
		.all(productId, from, from, to, to);
}

module.exports = { applyMove, recomputeProduct, checkStock, kardex, defaultWarehouse };
