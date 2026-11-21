/**
 * تعاریف پایه: کالا، گروه کالا، اشخاص، حساب‌ها، خزانه‌ها (بانک/صندوق/کارتخوان)، انبار.
 * همه عملیات نوشتن از اعتبارسنجی عبور می‌کنند و همه حذف‌ها نرم (غیرفعال‌سازی) هستند.
 */
const { get } = require('../db/index.cjs');
const { fail } = require('./errors.cjs');
const V = require('./validate.cjs');
const { r2 } = require('./ledger.cjs');

const SEARCH_LIMIT = 10;
const PRODUCT_COLUMNS = `p.id, p.name, p.sku, p.unit, p.sale_price, p.purchase_price,
	p.stock_qty, p.min_stock, p.avg_cost, p.category_id, p.is_favorite, p.tax_rate,
	(SELECT barcode FROM product_barcodes WHERE product_id = p.id LIMIT 1) AS barcode`;

/* ------------------------------- گروه کالا ------------------------------- */

const listCategories = () => get().prepare('SELECT * FROM product_categories ORDER BY sort, name').all();

function saveCategory(payload) {
	const db = get();
	const name = V.requireText(payload.name, 'نام گروه', 80);
	if (payload.id) {
		db.prepare('UPDATE product_categories SET name=? WHERE id=?').run(
			name,
			V.requireId(payload.id, 'گروه')
		);
		return { id: payload.id };
	}
	return {
		id: db.prepare('INSERT INTO product_categories(name, sort) VALUES(?, 99)').run(name).lastInsertRowid
	};
}

function removeCategory({ id }) {
	const used = get()
		.prepare('SELECT COUNT(*) c FROM products WHERE category_id=? AND is_active=1')
		.get(id).c;
	if (used > 0) fail('این گروه کالا در حال استفاده است', 'IN_USE');
	get().prepare('DELETE FROM product_categories WHERE id=?').run(id);
	return { ok: true };
}

/* --------------------------------- کالا --------------------------------- */

function productQuery({ q = '', categoryId = null, favorites = false, lowStock = false, activeOnly = true }) {
	const where = [];
	const args = [];
	if (activeOnly) where.push('p.is_active = 1');
	if (q) {
		where.push(`(p.name LIKE ? OR p.sku LIKE ? OR EXISTS(
			SELECT 1 FROM product_barcodes b WHERE b.product_id = p.id AND b.barcode LIKE ?))`);
		args.push(`%${q}%`, `%${q}%`, `%${q}%`);
	}
	if (categoryId) {
		where.push('p.category_id = ?');
		args.push(categoryId);
	}
	if (favorites) where.push('p.is_favorite = 1');
	if (lowStock) where.push('p.min_stock > 0 AND p.stock_qty <= p.min_stock');
	return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

function listProducts(params = {}) {
	const { clause, args } = productQuery(params);
	const limit = Math.min(Number(params.limit) || 500, 1000);
	const offset = Math.max(Number(params.offset) || 0, 0);
	const db = get();
	const rows = db
		.prepare(
			`SELECT ${PRODUCT_COLUMNS}, c.name AS category_name,
			        ROUND(p.stock_qty * p.avg_cost) AS stock_value
			 FROM products p LEFT JOIN product_categories c ON c.id = p.category_id
			 ${clause} ORDER BY p.is_favorite DESC, p.sort, p.name LIMIT ? OFFSET ?`
		)
		.all(...args, limit, offset);
	const total = db.prepare(`SELECT COUNT(*) c FROM products p ${clause}`).get(...args).c;
	return { rows, total };
}

function searchProducts({ q = '', categoryId = null, limit = SEARCH_LIMIT }) {
	const { clause, args } = productQuery({ q, categoryId });
	return get()
		.prepare(
			`SELECT ${PRODUCT_COLUMNS} FROM products p ${clause} ORDER BY p.is_favorite DESC, p.name LIMIT ?`
		)
		.all(...args, Math.min(Number(limit) || SEARCH_LIMIT, 50));
}

function productByBarcode({ barcode }) {
	const code = String(barcode ?? '').trim();
	if (!code) return null;
	return (
		get()
			.prepare(
				`SELECT ${PRODUCT_COLUMNS} FROM products p
				 JOIN product_barcodes b ON b.product_id = p.id
				 WHERE b.barcode = ? AND p.is_active = 1`
			)
			.get(code) || null
	);
}

function syncBarcodes(productId, barcodes) {
	const db = get();
	db.prepare('DELETE FROM product_barcodes WHERE product_id=?').run(productId);
	const insert = db.prepare('INSERT OR IGNORE INTO product_barcodes(product_id, barcode) VALUES(?, ?)');
	for (const code of barcodes) {
		const value = String(code ?? '').trim();
		if (value) insert.run(productId, value);
	}
}

function saveProduct(payload) {
	const db = get();
	const data = {
		name: V.requireText(payload.name, 'نام کالا'),
		sku: V.optionalText(payload.sku, 60),
		category_id: V.optionalId(payload.categoryId),
		unit: V.optionalText(payload.unit, 20) || 'عدد',
		purchase_price: V.requireNonNegative(payload.purchasePrice ?? 0, 'قیمت خرید'),
		sale_price: V.requireNonNegative(payload.salePrice ?? 0, 'قیمت فروش'),
		min_stock: V.requireNonNegative(payload.minStock ?? 0, 'حداقل موجودی'),
		tax_rate: V.requireNonNegative(payload.taxRate ?? 0, 'نرخ مالیات'),
		is_active: payload.isActive === false ? 0 : 1,
		is_favorite: payload.isFavorite ? 1 : 0,
		favorite_group: V.optionalText(payload.favoriteGroup, 40),
		note: V.optionalText(payload.note, 500)
	};

	return db.transaction(() => {
		let id = V.optionalId(payload.id);
		if (id) {
			db.prepare(
				`UPDATE products SET name=@name, sku=@sku, category_id=@category_id, unit=@unit,
				 purchase_price=@purchase_price, sale_price=@sale_price, min_stock=@min_stock,
				 tax_rate=@tax_rate, is_active=@is_active, is_favorite=@is_favorite,
				 favorite_group=@favorite_group, note=@note WHERE id=@id`
			).run({ ...data, id });
		} else {
			id = db
				.prepare(
					`INSERT INTO products(name, sku, category_id, unit, purchase_price, sale_price,
					 min_stock, tax_rate, is_active, is_favorite, favorite_group, note, avg_cost, stock_qty)
					 VALUES(@name, @sku, @category_id, @unit, @purchase_price, @sale_price,
					 @min_stock, @tax_rate, @is_active, @is_favorite, @favorite_group, @note, @purchase_price, 0)`
				)
				.run(data).lastInsertRowid;
		}
		if (Array.isArray(payload.barcodes)) syncBarcodes(id, payload.barcodes);
		return { id };
	})();
}

function removeProduct({ id }) {
	get().prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(V.requireId(id, 'کالا'));
	return { ok: true };
}

function toggleFavorite({ id, value }) {
	get()
		.prepare('UPDATE products SET is_favorite = ? WHERE id = ?')
		.run(value ? 1 : 0, V.requireId(id, 'کالا'));
	return { ok: true };
}

/* -------------------------------- اشخاص -------------------------------- */

const KIND_FILTER = { customer: ['customer', 'both'], supplier: ['supplier', 'both'] };

function partyQuery({ q = '', kind = null }) {
	const where = [];
	const args = [];
	if (kind && KIND_FILTER[kind]) {
		where.push('(p.kind = ? OR p.kind = ?)');
		args.push(...KIND_FILTER[kind]);
	}
	if (q) {
		where.push('(p.name LIKE ? OR p.phone LIKE ?)');
		args.push(`%${q}%`, `%${q}%`);
	}
	return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

const BALANCE_EXPR = `COALESCE((SELECT SUM(jl.debit - jl.credit) FROM journal_lines jl
	WHERE jl.account_id = p.account_id), 0)`;

function listParties(params = {}) {
	const { clause, args } = partyQuery(params);
	const limit = Math.min(Number(params.limit) || 25, 200);
	const offset = Math.max(Number(params.offset) || 0, 0);
	const db = get();
	const rows = db
		.prepare(
			`SELECT p.*, ${BALANCE_EXPR} AS balance FROM parties p ${clause}
			 ORDER BY p.is_active DESC, p.name LIMIT ? OFFSET ?`
		)
		.all(...args, limit, offset)
		.map((row) => ({ ...row, balance: r2(row.balance) }));
	const total = db.prepare(`SELECT COUNT(*) c FROM parties p ${clause}`).get(...args).c;
	return { rows, total };
}

function searchParties({ q = '', kind = null, limit = SEARCH_LIMIT }) {
	const { clause, args } = partyQuery({ q, kind });
	return get()
		.prepare(
			`SELECT p.id, p.name, p.kind, p.phone, ${BALANCE_EXPR} AS balance
			 FROM parties p ${clause ? `${clause} AND` : 'WHERE'} p.is_active = 1
			 ORDER BY p.name LIMIT ?`
		)
		.all(...args, Math.min(Number(limit) || SEARCH_LIMIT, 50))
		.map((row) => ({ ...row, balance: r2(row.balance) }));
}

/** جمع بدهکاران و بستانکاران (بدون بارگذاری کل اشخاص در رابط کاربری) */
function partySummary() {
	const row = get()
		.prepare(
			`SELECT COALESCE(SUM(CASE WHEN bal > 0 THEN bal ELSE 0 END), 0) AS debtors,
			        COALESCE(SUM(CASE WHEN bal < 0 THEN -bal ELSE 0 END), 0) AS creditors
			 FROM (SELECT ${BALANCE_EXPR} AS bal FROM parties p WHERE p.is_active = 1)`
		)
		.get();
	return { debtors: r2(row.debtors), creditors: r2(row.creditors) };
}

function getParty({ id }) {
	const party = get().prepare('SELECT * FROM parties WHERE id = ?').get(V.requireId(id, 'شخص'));
	if (!party) fail('شخص یافت نشد', 'NOT_FOUND');
	return party;
}

function saveParty(payload) {
	const db = get();
	const data = {
		name: V.requireText(payload.name, 'نام شخص'),
		kind: V.requireOneOf(payload.kind || 'customer', ['customer', 'supplier', 'both'], 'نوع شخص'),
		phone: V.optionalText(payload.phone, 40),
		address: V.optionalText(payload.address, 300),
		tax_id: V.optionalText(payload.taxId, 40),
		credit_limit: V.requireNonNegative(payload.creditLimit ?? 0, 'سقف اعتبار'),
		note: V.optionalText(payload.note, 500)
	};

	return db.transaction(() => {
		const id = V.optionalId(payload.id);
		if (id) {
			db.prepare(
				`UPDATE parties SET name=@name, kind=@kind, phone=@phone, address=@address,
				 tax_id=@tax_id, credit_limit=@credit_limit, note=@note WHERE id=@id`
			).run({ ...data, id });
			return { id };
		}
		const accountId = db
			.prepare(
				`INSERT INTO accounts(name, group_key, subgroup, nature, is_system, sort)
				VALUES(?, 'persons', 'persons', 'debit', 0, 200)`
			)
			.run(data.name).lastInsertRowid;
		const newId = db
			.prepare(
				`INSERT INTO parties(name, kind, phone, address, tax_id, credit_limit, note, account_id)
				 VALUES(@name, @kind, @phone, @address, @tax_id, @credit_limit, @note, @account_id)`
			)
			.run({ ...data, account_id: accountId }).lastInsertRowid;
		db.prepare('UPDATE accounts SET party_id = ? WHERE id = ?').run(newId, accountId);
		return { id: newId };
	})();
}

function removeParty({ id }) {
	get().prepare('UPDATE parties SET is_active = 0 WHERE id = ?').run(V.requireId(id, 'شخص'));
	return { ok: true };
}

/* ------------------------------- حساب‌ها ------------------------------- */

const GROUP_LABELS = {
	cash: 'صندوق و وجه نقد',
	bank: 'حساب‌های بانکی',
	terminal: 'کارتخوان‌ها',
	persons: 'حساب اشخاص',
	inventory: 'موجودی کالا',
	checks: 'چک‌های دریافتنی',
	liability: 'بدهی‌ها و چک‌های پرداختنی',
	tax: 'مالیات و عوارض',
	equity: 'سرمایه',
	income: 'درآمدها',
	expense: 'هزینه‌ها'
};

function listAccounts() {
	const rows = get()
		.prepare(
			`SELECT a.*, COALESCE((SELECT SUM(jl.debit - jl.credit) FROM journal_lines jl
			 WHERE jl.account_id = a.id), 0) AS bal
			 FROM accounts a ORDER BY a.code, a.name`
		)
		.all();

	const groups = new Map();
	for (const row of rows) {
		if (!groups.has(row.group_key)) {
			groups.set(row.group_key, {
				key: row.group_key,
				label: GROUP_LABELS[row.group_key] || row.group_key,
				accounts: []
			});
		}
		groups.get(row.group_key).accounts.push({
			...row,
			bal: r2(row.bal),
			signed: r2(row.nature === 'credit' ? -row.bal : row.bal)
		});
	}
	return [...groups.values()];
}

function saveAccount(payload) {
	const db = get();
	const data = {
		name: V.requireText(payload.name, 'نام حساب'),
		code: V.optionalText(payload.code, 20),
		group_key: V.requireOneOf(payload.groupKey, Object.keys(GROUP_LABELS), 'گروه حساب'),
		nature: V.requireOneOf(payload.nature || 'debit', ['debit', 'credit'], 'ماهیت حساب')
	};
	const id = V.optionalId(payload.id);
	if (id) {
		db.prepare('UPDATE accounts SET name=?, code=?, group_key=?, nature=? WHERE id=?').run(
			data.name,
			data.code,
			data.group_key,
			data.nature,
			id
		);
		return { id };
	}
	return {
		id: db
			.prepare(
				`INSERT INTO accounts(code, name, group_key, subgroup, nature, is_system, sort)
				VALUES(?, ?, ?, ?, ?, 0, 300)`
			)
			.run(data.code, data.name, data.group_key, data.group_key, data.nature).lastInsertRowid
	};
}

/* ---------------------------- خزانه و انبار ---------------------------- */

const TREASURY_KINDS = ['cash', 'bank', 'terminal'];

const treasuryBalanceExpr = `COALESCE((SELECT SUM(jl.debit - jl.credit) FROM journal_lines jl
	WHERE jl.account_id = t.account_id), 0)`;

function listTreasuries({ includeInactive = false } = {}) {
	const rows = get()
		.prepare(
			`SELECT t.*, ${treasuryBalanceExpr} AS balance,
			        s.name AS settle_name
			 FROM treasuries t LEFT JOIN treasuries s ON s.id = t.settle_treasury_id
			 ${includeInactive ? '' : 'WHERE t.is_active = 1'} ORDER BY t.sort, t.id`
		)
		.all();
	return rows.map((row) => ({ ...row, balance: r2(row.balance) }));
}

/** حساب بانکی متصل به کارتخوان؛ اتصال اجباری است چون کارتخوان حساب ندارد */
function linkedBank(db, settleTreasuryId) {
	if (!settleTreasuryId) return null;
	return (
		db
			.prepare("SELECT id, name FROM treasuries WHERE id = ? AND kind = 'bank' AND is_active = 1")
			.get(settleTreasuryId) || null
	);
}

function saveTreasury(payload) {
	const db = get();
	const kind = V.requireOneOf(payload.kind, TREASURY_KINDS, 'نوع حساب');
	const isTerminal = kind === 'terminal';
	const settleTreasuryId = V.optionalId(payload.settleTreasuryId);
	const data = {
		kind,
		name: V.requireText(payload.name, 'نام حساب'),
		bank_name: V.optionalText(payload.bankName, 60),
		account_no: V.optionalText(payload.accountNo, 40),
		terminal_no: V.optionalText(payload.terminalNo, 40),
		fee_percent: V.requireNonNegative(payload.feePercent ?? 0, 'درصد کارمزد'),
		settle_treasury_id: null,
		is_default: payload.isDefault ? 1 : 0
	};

	// کارتخوان موجودی مستقل ندارد؛ پس باید به یک حساب بانکی متصل باشد
	if (isTerminal) {
		const bank = linkedBank(db, settleTreasuryId);
		if (!bank) fail('کارتخوان باید به یک حساب بانکی متصل باشد', 'VALIDATION');
		data.settle_treasury_id = bank.id;
	}

	return db.transaction(() => {
		const id = V.optionalId(payload.id);
		if (id) {
			const current = db.prepare('SELECT kind FROM treasuries WHERE id = ?').get(id);
			if (!current) fail('حساب یافت نشد', 'NOT_FOUND');
			// تغییر نوع، حساب دفتری را بی‌صاحب می‌کند؛ فقط از راه ساخت حساب جدید مجاز است
			if (current.kind !== kind) fail('نوع حساب قابل تغییر نیست؛ حساب جدید بسازید', 'VALIDATION');

			db.prepare(
				`UPDATE treasuries SET name=@name, bank_name=@bank_name, account_no=@account_no,
				 terminal_no=@terminal_no, fee_percent=@fee_percent, settle_treasury_id=@settle_treasury_id,
				 is_default=@is_default WHERE id=@id`
			).run({ ...data, id });
			return { id };
		}

		// کارتخوان حساب دفتری نمی‌گیرد: مبالغ آن روی حساب بانکی متصل ثبت می‌شود
		const accountId = isTerminal
			? null
			: db
					.prepare(
						`INSERT INTO accounts(name, group_key, subgroup, nature, is_system, sort)
						VALUES(?, ?, ?, 'debit', 0, 30)`
					)
					.run(data.name, kind, kind).lastInsertRowid;
		const newId = db
			.prepare(
				`INSERT INTO treasuries(kind, name, bank_name, account_no, terminal_no, fee_percent,
				 settle_treasury_id, account_id, is_default, sort)
				 VALUES(@kind, @name, @bank_name, @account_no, @terminal_no, @fee_percent,
				 @settle_treasury_id, @account_id, @is_default, 50)`
			)
			.run({ ...data, account_id: accountId }).lastInsertRowid;
		return { id: newId };
	})();
}

function removeTreasury({ id }) {
	const treasury = get()
		.prepare('SELECT account_id, kind FROM treasuries WHERE id = ?')
		.get(V.requireId(id, 'حساب'));
	if (!treasury) fail('حساب یافت نشد', 'NOT_FOUND');
	// کارتخوان حساب دفتری ندارد؛ پس گردشی هم ندارد که مانع حذف شود
	if (treasury.account_id) {
		const used = get()
			.prepare('SELECT COUNT(*) c FROM journal_lines WHERE account_id = ?')
			.get(treasury.account_id).c;
		if (used > 0) fail('این حساب گردش مالی دارد و قابل حذف نیست', 'IN_USE');
	}
	get().prepare('UPDATE treasuries SET is_active = 0 WHERE id = ?').run(id);
	return { ok: true };
}

const listWarehouses = () => get().prepare('SELECT * FROM warehouses ORDER BY is_default DESC, name').all();

function saveWarehouse(payload) {
	const db = get();
	const name = V.requireText(payload.name, 'نام انبار', 80);
	const id = V.optionalId(payload.id);
	if (id) {
		db.prepare('UPDATE warehouses SET name=? WHERE id=?').run(name, id);
		return { id };
	}
	return { id: db.prepare('INSERT INTO warehouses(name) VALUES(?)').run(name).lastInsertRowid };
}

/* ------------------------------- تنظیمات ------------------------------- */

function getSettings() {
	const rows = get().prepare('SELECT key, value FROM settings').all();
	return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

const ALLOWED_SETTINGS = new Set([
	'business_name',
	'business_phone',
	'business_address',
	'currency',
	'tax_rate',
	'stock_policy',
	'fiscal_start',
	'pos_auto_print'
]);

function saveSettings(payload) {
	const db = get();
	const entries = Object.entries(payload || {}).filter(([key]) => ALLOWED_SETTINGS.has(key));
	if (payload.stock_policy)
		V.requireOneOf(payload.stock_policy, ['block', 'warn', 'allow'], 'سیاست موجودی');
	const upsert = db.prepare(
		'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
	);
	db.transaction(() => entries.forEach(([key, value]) => upsert.run(key, String(value))))();
	return getSettings();
}

/* ------------------------------ بارگذاری اولیه ------------------------------ */

function bootstrap() {
	return {
		settings: getSettings(),
		categories: listCategories(),
		treasuries: listTreasuries(),
		warehouses: listWarehouses(),
		accounts: listAccounts(),
		partyCount: get().prepare('SELECT COUNT(*) c FROM parties WHERE is_active = 1').get().c
	};
}

module.exports = {
	listCategories,
	saveCategory,
	removeCategory,
	listProducts,
	searchProducts,
	productByBarcode,
	saveProduct,
	removeProduct,
	toggleFavorite,
	listParties,
	searchParties,
	getParty,
	partySummary,
	saveParty,
	removeParty,
	listAccounts,
	saveAccount,
	listTreasuries,
	saveTreasury,
	removeTreasury,
	listWarehouses,
	saveWarehouse,
	getSettings,
	saveSettings,
	bootstrap,
	GROUP_LABELS
};
