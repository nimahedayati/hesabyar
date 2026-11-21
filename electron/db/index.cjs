const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const SCHEMA = require('./schema.cjs');

let db = null;

function init(dbPath) {
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	migrateLegacyUsers(db);
	db.exec(SCHEMA);
	seedIfEmpty();
	return db;
}

/**
 * نسخه‌های اولیه جدول users را با ساختار نام/رمز جایگزین می‌کند.
 * آن جدول فقط یک ردیف نمایشی («admin») بدون رمز داشت و قابل استفاده نبود؛
 * کاربر واقعی در نخستین اجرا با صفحه راه‌اندازی ساخته می‌شود.
 */
function migrateLegacyUsers(database) {
	const table = database
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
		.get();
	if (!table) return;
	const columns = database
		.prepare('PRAGMA table_info(users)')
		.all()
		.map((column) => column.name);
	if (columns.includes('password_hash')) return;
	database.exec('DROP TABLE users');
}

function get() {
	if (!db) throw new Error('DB not initialised');
	return db;
}

const DEFAULTS = {
	business_name: '',
	business_phone: '',
	business_address: '',
	currency: 'تومان',
	tax_rate: '0',
	stock_policy: 'warn', // block | warn | allow
	fiscal_start: new Date().toISOString().slice(0, 10),
	pos_auto_print: '0',
	pos_default_party: '0',
	round_prices: '1',
	invoice_prefix_sale: 'S',
	invoice_prefix_purchase: 'P'
};

function seedIfEmpty() {
	const d = get();
	const has = d.prepare('SELECT COUNT(*) c FROM accounts').get().c;
	const setSetting = d.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
	const tx = d.transaction(() => {
		for (const [k, v] of Object.entries(DEFAULTS)) setSetting.run(k, v);
		if (has > 0) return;

		/* ---------------- کدینگ ساده حساب‌ها ---------------- */
		const acc = d.prepare(
			`INSERT INTO accounts(code,name,group_key,subgroup,nature,is_system,sort) VALUES(?,?,?,?,?,1,?)`
		);
		const A = {};
		const add = (key, code, name, group, subgroup, nature, sort) => {
			A[key] = acc.run(code, name, group, subgroup, nature, sort).lastInsertRowid;
		};

		add('cash', '1010', 'صندوق', 'cash', 'cash', 'debit', 10);
		add('bank', '1020', 'حساب‌های بانکی', 'bank', 'bank', 'debit', 20);
		add('terminal', '1030', 'کارتخوان‌ها', 'terminal', 'terminal', 'debit', 30);
		add('ar', '1100', 'حساب اشخاص', 'persons', 'persons', 'debit', 40);
		add('inv', '1300', 'موجودی کالا', 'inventory', 'inventory', 'debit', 50);
		add('chk_rec', '1400', 'چک‌های دریافتنی', 'checks', 'checks_in', 'debit', 60);
		add('chk_pay', '2100', 'چک‌های پرداختنی', 'liability', 'checks_out', 'credit', 70);
		add('tax', '2200', 'مالیات و عوارض پرداختنی', 'tax', 'tax', 'credit', 80);
		add('capital', '3000', 'سرمایه', 'equity', 'capital', 'credit', 90);
		add('re', '3900', 'سود و زیان انباشته', 'equity', 'retained', 'credit', 100);
		add('sales', '4000', 'فروش کالا', 'income', 'sales', 'credit', 110);
		add('sales_ret', '4010', 'برگشت از فروش', 'income', 'sales_return', 'debit', 120);
		add('sales_disc', '4020', 'تخفیف فروش', 'income', 'sales_discount', 'debit', 130);
		add('other_income', '4900', 'درآمدهای متفرقه', 'income', 'other', 'credit', 140);
		add('cogs', '5000', 'بهای تمام‌شده کالای فروش‌رفته', 'expense', 'cogs', 'debit', 150);

		const exp = d.prepare(
			`INSERT INTO accounts(code,name,group_key,subgroup,nature,is_system,sort) VALUES(?,?,?,?,?,0,?)`
		);
		const expenses = [
			['6100', 'اجاره'],
			['6200', 'حقوق و دستمزد'],
			['6300', 'آب، برق و گاز'],
			['6400', 'حمل‌ونقل'],
			['6500', 'تعمیرات و نگهداری'],
			['6600', 'هزینه‌های اداری'],
			['6700', 'کارمزد بانکی'],
			['6900', 'سایر هزینه‌ها']
		];
		let s = 160;
		for (const [c, n] of expenses) exp.run(c, n, 'expense', 'operating', 'debit', (s += 10));

		const incomes = [
			['4910', 'درآمد خدمات'],
			['4920', 'درآمد اجاره']
		];
		for (const [c, n] of incomes) exp.run(c, n, 'income', 'other', 'credit', (s += 10));

		/* ---------------- ساختار حداقلی ---------------- */
		// کسب‌وکار تازه «خام» است: فقط انبار پیش‌فرض و یک صندوق برای ثبت فروش ساخته می‌شود.
		// هیچ کالا، گروه، شخص، بانک، کارتخوان یا سندی از پیش وجود ندارد.
		d.prepare('INSERT INTO warehouses(name,is_default) VALUES(?,1)').run('انبار اصلی');
		d.prepare(
			`INSERT INTO treasuries(kind,name,account_id,is_default,sort) VALUES('cash','صندوق',?,1,10)`
		).run(A.cash);
		d.prepare('INSERT INTO counters(key,value) VALUES(?,?)').run('journal', 1);
	});

	tx();
}

/* ------------------------------------------------------------------ */
/*  پاک‌سازی اطلاعات                                                   */
/* ------------------------------------------------------------------ */

/** جدول‌های عملیاتی: با پاک شدنشان هیچ سند مالی باقی نمی‌ماند */
const TRANSACTIONAL_TABLES = [
	'document_payments',
	'document_lines',
	'documents',
	'stock_moves',
	'journal_lines',
	'journal_entries',
	'checks',
	'audit_log'
];

/** حذف ردیف‌ها با کلید خارجی خاموش (PRAGMA داخل تراکنش بی‌اثر است) */
function wipeTables(tables) {
	const d = get();
	d.pragma('foreign_keys = OFF');
	try {
		d.transaction(() => {
			for (const table of tables) d.prepare(`DELETE FROM "${table}"`).run();
		})();
	} finally {
		d.pragma('foreign_keys = ON');
	}
}

const allTables = () =>
	get()
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
		.all()
		.map((row) => row.name);

/** حذف کامل اطلاعات: اسناد و گردش پاک می‌شود، تعاریف (کالا، شخص، حساب) می‌ماند */
function resetData() {
	const d = get();
	wipeTables(TRANSACTIONAL_TABLES);
	d.prepare('UPDATE products SET stock_qty = 0, avg_cost = purchase_price').run();
	d.prepare('UPDATE counters SET value = 0').run();
	return { ok: true, mode: 'data' };
}

/** حذف کامل کسب‌وکار: همه چیز پاک و ساختار حداقلی از نو ساخته می‌شود */
function resetBusiness() {
	wipeTables(allTables());
	seedIfEmpty();
	return { ok: true, mode: 'business' };
}

module.exports = { init, get, DEFAULTS, resetData, resetBusiness, TRANSACTIONAL_TABLES };
