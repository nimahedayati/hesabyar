/* تست هسته حسابداری — با اجرای واقعی Electron و پایگاه داده موقت */
const { app } = require('electron');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

app.disableHardwareAcceleration();

const log = [];
const ok = (name, cond, extra = '') => {
	log.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
	if (!cond) process.exitCode = 1;
};

app.whenReady().then(() => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hesab-test-'));
	const db = require('../electron/db/index.cjs');
	const DOC = require('../electron/services/documents.cjs');
	const CAT = require('../electron/services/catalog.cjs');
	const R = require('../electron/services/reports.cjs');
	const AUTH = require('../electron/services/auth.cjs');
	const API = require('../electron/services/api.cjs');
	db.init(path.join(dir, 't.db'));
	const d = db.get();

	const balanced = () => {
		const r = d
			.prepare('SELECT COALESCE(SUM(debit),0) dr, COALESCE(SUM(credit),0) cr FROM journal_lines')
			.get();
		return Math.abs(r.dr - r.cr) < 0.02;
	};
	const count = (table) => d.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;

	// ---- کسب‌وکار تازه باید کاملاً خام باشد
	ok('کسب‌وکار تازه کالا ندارد', count('products') === 0, String(count('products')));
	ok('کسب‌وکار تازه شخص ندارد', count('parties') === 0, String(count('parties')));
	ok('کسب‌وکار تازه گروه کالا ندارد', count('product_categories') === 0);
	ok('کسب‌وکار تازه سند حسابداری ندارد', count('journal_entries') === 0);
	ok('کسب‌وکار تازه سند فروش/خرید ندارد', count('documents') === 0);
	ok('کسب‌وکار تازه گردش انبار ندارد', count('stock_moves') === 0);
	ok('حساب‌های پایه ساخته شده‌اند', count('accounts') > 10, String(count('accounts')));
	ok('انبار پیش‌فرض ساخته شده است', count('warehouses') === 1);
	ok(
		'فقط صندوق پیش‌فرض وجود دارد',
		count('treasuries') === 1 && d.prepare('SELECT kind FROM treasuries').get().kind === 'cash'
	);

	// ---- داده آزمون از مسیر رسمی ساخته می‌شود
	const milkId = CAT.saveProduct({
		name: 'شیر تست',
		sku: 'T-001',
		unit: 'عدد',
		purchasePrice: 28000,
		salePrice: 35000
	}).id;
	const colaId = CAT.saveProduct({
		name: 'نوشابه تست',
		sku: 'T-002',
		unit: 'عدد',
		purchasePrice: 32000,
		salePrice: 42000
	}).id;
	const supplierId = CAT.saveParty({ name: 'تأمین‌کننده تست', kind: 'supplier' }).id;
	const customerId = CAT.saveParty({ name: 'مشتری تست', kind: 'customer' }).id;
	const bankId = CAT.saveTreasury({ kind: 'bank', name: 'بانک تست', bankName: 'سامان' }).id;
	const termId = CAT.saveTreasury({
		kind: 'terminal',
		name: 'کارتخوان تست',
		terminalNo: 'P0001',
		settleTreasuryId: bankId
	}).id;

	// ---- کارتخوان بدون بانک متصل پذیرفته نمی‌شود
	let orphanTerminal = false;
	try {
		CAT.saveTreasury({ kind: 'terminal', name: 'کارتخوان بی‌بانک' });
	} catch (e) {
		orphanTerminal = /بانک/.test(e.message);
	}
	ok('کارتخوان بدون حساب بانکی متصل ثبت نمی‌شود', orphanTerminal);
	ok(
		'کارتخوان حساب دفتری مستقل ندارد',
		d.prepare('SELECT account_id FROM treasuries WHERE id=?').get(termId).account_id === null
	);

	DOC.createOpening({
		date: DOC.today(),
		items: [
			{ productId: milkId, qty: 48, unitCost: 28000 },
			{ productId: colaId, qty: 96, unitCost: 32000 }
		]
	});

	// ---- مبنا
	const p1 = d.prepare('SELECT * FROM products WHERE id=?').get(milkId); // شیر: خرید 28000
	const p2 = d.prepare('SELECT * FROM products WHERE id=?').get(colaId); // نوشابه: خرید 32000
	ok('موجودی اولیه کالا', p1.stock_qty === 48 && p1.avg_cost === 28000, `${p1.stock_qty} @ ${p1.avg_cost}`);
	ok('سند افتتاحیه تراز است', balanced());

	// ---- خرید با میانگین موزون
	// 10 عدد شیر به 30000 → میانگین باید (48*28000 + 10*30000)/58 شود
	const expectedAvg = Math.round(((48 * 28000 + 10 * 30000) / 58) * 100) / 100;
	DOC.createPurchase({
		date: DOC.today(),
		partyId: supplierId,
		lines: [{ productId: p1.id, qty: 10, unitPrice: 30000 }],
		payments: []
	});
	const p1b = d.prepare('SELECT * FROM products WHERE id=?').get(p1.id);
	ok(
		'میانگین موزون پس از خرید',
		Math.abs(p1b.avg_cost - expectedAvg) < 1,
		`${p1b.avg_cost} ≈ ${expectedAvg}`
	);
	ok('موجودی پس از خرید', p1b.stock_qty === 58, String(p1b.stock_qty));
	ok('سند خرید تراز است', balanced());

	// ---- فروش با پرداخت ترکیبی: ۲۰۰ کارتخوان + ۱۰۰ نقدی + ۲۰۰ نسیه
	const cash = d.prepare("SELECT id FROM treasuries WHERE kind='cash'").get().id;
	const term = termId;
	const cust = customerId;

	const sale = DOC.createSale({
		date: DOC.today(),
		partyId: cust,
		lines: [{ productId: p1.id, qty: 10, unitPrice: 50000 }], // 500,000
		payments: [
			{ method: 'terminal', treasuryId: term, amount: 200000 },
			{ method: 'cash', treasuryId: cash, amount: 100000 }
		]
	});
	const s = d.prepare('SELECT * FROM documents WHERE id=?').get(sale.id);
	ok('فروش ترکیبی — مانده نسیه', s.due === 200000, String(s.due));
	ok('فروش ترکیبی — پرداختی', s.paid === 300000, String(s.paid));
	ok(
		'سود فروش = درآمد − بهای تمام‌شده',
		Math.abs(s.profit - (500000 - 10 * p1b.avg_cost)) < 1,
		String(s.profit)
	);
	ok('سند فروش تراز است', balanced());

	// ---- کارتخوان: موجودی روی حساب بانکی متصل می‌نشیند، نه حساب خودش
	const bankAccountId = d.prepare('SELECT account_id FROM treasuries WHERE id=?').get(bankId).account_id;
	const bankBalance = () =>
		d
			.prepare('SELECT COALESCE(SUM(debit-credit),0) v FROM journal_lines WHERE account_id=?')
			.get(bankAccountId).v;
	ok('فروش با کارتخوان موجودی بانک متصل را زیاد می‌کند', bankBalance() === 200000, String(bankBalance()));
	ok('موجودی اعلامی کارتخوان صفر است', CAT.listTreasuries().find((t) => t.id === termId).balance === 0);
	ok(
		'کارتخوان بانک متصل را در فهرست نشان می‌دهد',
		CAT.listTreasuries().find((t) => t.id === termId).settle_name === 'بانک تست'
	);

	let transferFromTerminal = false;
	try {
		DOC.createTransfer({ date: DOC.today(), fromTreasuryId: termId, toTreasuryId: cash, amount: 1000 });
	} catch (e) {
		transferFromTerminal = /کارتخوان/.test(e.message);
	}
	ok('انتقال وجه از کارتخوان مجاز نیست', transferFromTerminal);

	const p1c = d.prepare('SELECT * FROM products WHERE id=?').get(p1.id);
	ok('کاهش موجودی پس از فروش', p1c.stock_qty === 48, String(p1c.stock_qty));
	ok('میانگین پس از فروش ثابت می‌ماند', Math.abs(p1c.avg_cost - p1b.avg_cost) < 0.01);

	// ---- تفکیک سود از نقدینگی
	const partyBal = d
		.prepare(
			`SELECT COALESCE(SUM(jl.debit-jl.credit),0) b FROM journal_lines jl
			 JOIN accounts a ON a.id=jl.account_id WHERE jl.account_id=(SELECT account_id FROM parties WHERE id=?)`
		)
		.get(cust).b;
	ok('طلب از مشتری = بخش نسیه', Math.abs(partyBal - 200000) < 1, String(partyBal));

	// ---- فروش با مشتری عمومی
	const walkin = DOC.createSale({
		date: DOC.today(),
		lines: [{ productId: p2.id, qty: 2, unitPrice: 42000 }],
		payments: [{ method: 'cash', treasuryId: cash, amount: 84000 }]
	});
	ok('فروش بدون انتخاب مشتری', !!walkin.id);
	ok('سند مشتری عمومی تراز است', balanced());

	// ---- جلوگیری از نسیه بدون مشتری
	let blocked = false;
	try {
		DOC.createSale({
			date: DOC.today(),
			lines: [{ productId: p2.id, qty: 1, unitPrice: 42000 }],
			payments: [{ method: 'cash', treasuryId: cash, amount: 10000 }]
		});
	} catch (e) {
		blocked = /مشتری/.test(e.message);
	}
	ok('نسیه بدون مشتری رد می‌شود', blocked);

	// ---- ابطال سند و بازگشت آثار
	const before = d.prepare('SELECT stock_qty, avg_cost FROM products WHERE id=?').get(p1.id);
	DOC.voidDocument(sale.id, 'تست ابطال');
	const after = d.prepare('SELECT stock_qty, avg_cost FROM products WHERE id=?').get(p1.id);
	ok(
		'ابطال — بازگشت موجودی',
		after.stock_qty === before.stock_qty + 10,
		`${before.stock_qty} → ${after.stock_qty}`
	);
	ok(
		'ابطال — سند همچنان موجود است',
		d.prepare('SELECT status FROM documents WHERE id=?').get(sale.id).status === 'voided'
	);
	ok('ابطال — دفتر تراز است', balanced());
	const partyAfter = d
		.prepare(
			`SELECT COALESCE(SUM(jl.debit-jl.credit),0) b FROM journal_lines jl
			 JOIN accounts a ON a.id=jl.account_id WHERE jl.account_id=(SELECT account_id FROM parties WHERE id=?)`
		)
		.get(cust).b;
	ok('ابطال — صفر شدن طلب مشتری', Math.abs(partyAfter) < 1, String(partyAfter));

	// ---- گزارش سود و زیان
	const pr = R.profitReport('2000-01-01', '2100-01-01');
	ok('گزارش سود — فروش خالص', pr.netSales > 0, String(pr.netSales));
	ok(
		'گزارش سود — سود ناخالص منطقی',
		pr.grossProfit > 0 && pr.grossProfit < pr.netSales,
		String(pr.grossProfit)
	);
	// برگشت از فروش و تخفیف باید از فروش ناخالص کم شوند، نه به آن اضافه شوند
	const returnsTotal = pr.salesReturns.reduce((s, x) => s + x.amount, 0);
	const discountsTotal = pr.discounts.reduce((s, x) => s + x.amount, 0);
	ok(
		'گزارش سود — فروش خالص = ناخالص + برگشت + تخفیف',
		Math.abs(pr.netSales - (pr.grossSales + returnsTotal + discountsTotal)) < 1,
		`${pr.grossSales} / ${pr.netSales} / ${returnsTotal}`
	);
	ok(
		'گزارش سود — فروش خالص از ناخالص بیشتر نیست',
		pr.netSales <= pr.grossSales + 0.01,
		String(pr.netSales)
	);

	const cf = R.cashflow('2000-01-01', '2100-01-01');
	ok('جریان نقدی مستقل محاسبه می‌شود', cf.closing !== pr.grossProfit);

	// ---- سند حسابداری دستی
	const accCash = d.prepare("SELECT id FROM accounts WHERE code='1010'").get().id;
	const accIncome = d.prepare("SELECT id FROM accounts WHERE code='4900'").get().id;

	const jv = DOC.createJournal({
		date: DOC.today(),
		description: 'سند دستی تست',
		lines: [
			{ accountId: accCash, debit: 250000, credit: 0 },
			{ accountId: accIncome, debit: 0, credit: 250000 }
		]
	});
	ok('سند دستی ثبت و شماره‌گذاری می‌شود', Boolean(jv.id) && /^JV/.test(jv.number || ''), jv.number);
	const jvLines = d.prepare('SELECT COUNT(*) c FROM journal_lines WHERE entry_id=?').get(jv.journalId).c;
	ok('سند دستی ردیف‌های دفتر کل را می‌سازد', jvLines === 2, String(jvLines));

	let unbalanced = false;
	try {
		DOC.createJournal({
			date: DOC.today(),
			description: 'سند ناتراز',
			lines: [
				{ accountId: accCash, debit: 1000, credit: 0 },
				{ accountId: accIncome, debit: 0, credit: 900 }
			]
		});
	} catch (e) {
		unbalanced = /تراز/.test(e.message);
	}
	ok('سند ناتراز رد می‌شود', unbalanced);

	let singleRow = false;
	try {
		DOC.createJournal({
			date: DOC.today(),
			description: 'یک ردیف',
			lines: [{ accountId: accCash, debit: 500, credit: 500 }]
		});
	} catch (e) {
		singleRow = /دو ردیف|بدهکار/.test(e.message);
	}
	ok('سند با یک ردیف رد می‌شود', singleRow);
	ok('تراز پس از سند دستی', balanced());

	// ---- موجودی اولیه دستی (کالا + خزانه) و سرمایه خودکار
	const newProdId = d
		.prepare(
			"INSERT INTO products(name, sku, unit, purchase_price, sale_price, min_stock) VALUES('کالای تستی افتتاحیه','TEST-OP','کیلوگرم',1000,2000,0)"
		)
		.run().lastInsertRowid;
	const opening = DOC.createOpening({
		date: DOC.today(),
		items: [{ productId: newProdId, qty: 5, unitCost: 40000 }],
		cash: [{ treasuryId: cash, amount: 1000000 }]
	});
	const p3b = d.prepare('SELECT * FROM products WHERE id=?').get(newProdId);
	ok(
		'موجودی اولیه کالا در انبار می‌نشیند',
		p3b.stock_qty === 5 && p3b.avg_cost === 40000,
		`${p3b.stock_qty} @ ${p3b.avg_cost}`
	);
	ok('موجودی اولیه: سرمایه خودکار محاسبه می‌شود', opening.capital === 1200000, String(opening.capital));
	ok('تراز پس از موجودی اولیه', balanced());

	let badUnit = false;
	const countProdId = d
		.prepare(
			"INSERT INTO products(name, sku, unit, purchase_price, sale_price, min_stock) VALUES('کالای شمردنی','TEST-CNT','عدد',1000,2000,0)"
		)
		.run().lastInsertRowid;
	try {
		DOC.createOpening({
			date: DOC.today(),
			items: [{ productId: countProdId, qty: 2.5, unitCost: 1000 }]
		});
	} catch (e) {
		badUnit = /عدد صحیح/.test(e.message);
	}
	ok('تعداد اعشاری برای واحد شمردنی رد می‌شود', badUnit);

	// ---- سیاست موجودی منفی
	d.prepare("UPDATE settings SET value='block' WHERE key='stock_policy'").run();
	let stockBlocked = false;
	try {
		DOC.createSale({
			date: DOC.today(),
			lines: [{ productId: p2.id, qty: 99999, unitPrice: 1000 }],
			payments: [{ method: 'cash', treasuryId: cash, amount: 99999000 }]
		});
	} catch (e) {
		stockBlocked = /موجودی/.test(e.message);
	}
	ok('سیاست «ممنوع» مانع فروش بدون موجودی می‌شود', stockBlocked);
	d.prepare("UPDATE settings SET value='warn' WHERE key='stock_policy'").run();

	// ---- تراز کلی
	const bs = R.balanceSheet();
	ok(
		'ترازنامه: دارایی = بدهی + سرمایه + سود',
		Math.abs(bs.assets - (bs.liabilities + bs.total)) < 5,
		JSON.stringify(bs)
	);

	// ---- ردیف «نسیه» نباید جزء پرداختی شمرده شود
	const c2 = DOC.createSale({
		date: DOC.today(),
		partyId: cust,
		lines: [{ productId: p2.id, qty: 1, unitPrice: 100000 }],
		payments: [
			{ method: 'cash', treasuryId: cash, amount: 40000 },
			{ method: 'credit', amount: 60000 }
		]
	});
	const s2 = d.prepare('SELECT paid, due FROM documents WHERE id=?').get(c2.id);
	ok('ردیف نسیه جزء پرداختی شمرده نمی‌شود', s2.paid === 40000 && s2.due === 60000, `${s2.paid}/${s2.due}`);
	ok('تراز پس از فروش با نسیه', balanced());

	// ---- کاربران، رمز و کنترل دسترسی
	ok('قبل از راه‌اندازی، برنامه راه‌اندازی‌نشده است', AUTH.state().initialized === false);

	let needLogin = false;
	try {
		API.call('docs.sale', {});
	} catch (e) {
		needLogin = /وارد شوید/.test(e.message);
	}
	ok('بدون ورود، عملیات مالی رد می‌شود', needLogin);

	const admin = AUTH.setup({ businessName: 'فروشگاه آزمون', password: '1234', passwordConfirm: '1234' });
	ok(
		'راه‌اندازی، کاربر مدیر می‌سازد',
		admin.role === 'admin' && admin.name === 'مدیر',
		`${admin.name}/${admin.role}`
	);

	const stored = d.prepare('SELECT password_hash FROM users WHERE id=?').get(admin.id).password_hash;
	ok(
		'رمز به‌صورت درهم‌سازی‌شده ذخیره می‌شود',
		stored.startsWith('scrypt$') && !stored.includes('1234'),
		stored.slice(0, 18) + '…'
	);
	ok('ورود با رمز درست پذیرفته می‌شود', AUTH.login({ userId: admin.id, password: '1234' }).id === admin.id);

	let wrongPass = false;
	try {
		AUTH.login({ userId: admin.id, password: '0000' });
	} catch (e) {
		wrongPass = /نادرست/.test(e.message);
	}
	ok('رمز نادرست رد می‌شود', wrongPass);
	AUTH.login({ userId: admin.id, password: '1234' });

	const cashierUser = AUTH.createUser({ name: 'زهرا', role: 'cashier', password: '4321' });
	ok('کاربر صندوق‌دار ساخته می‌شود', cashierUser.role === 'cashier' && cashierUser.name === 'زهرا');

	AUTH.login({ userId: cashierUser.id, password: '4321' });
	let denied = false;
	try {
		API.call('docs.purchase', {});
	} catch (e) {
		denied = /صندوق‌دار/.test(e.message);
	}
	ok('صندوق‌دار به عملیات مدیریتی دسترسی ندارد', denied);
	ok(
		'صندوق‌دار به جست‌وجوی کالا دسترسی دارد',
		Array.isArray(API.call('products.search', { q: 'شیر', limit: 2 }))
	);

	const cashierBoot = API.call('bootstrap');
	ok(
		'داده حساس از خروجی صندوق‌دار حذف می‌شود',
		cashierBoot.accounts === undefined && Boolean(cashierBoot.settings)
	);

	let lastAdmin = false;
	try {
		AUTH.removeUser({ id: admin.id });
	} catch (e) {
		lastAdmin = /آخرین مدیر/.test(e.message);
	}
	ok('آخرین مدیر حذف نمی‌شود', lastAdmin);

	AUTH.login({ userId: admin.id, password: '1234' });
	const adminBoot = API.call('bootstrap');
	ok('مدیر به همه داده‌ها دسترسی دارد', Array.isArray(adminBoot.accounts));

	// ---- عملیات حساس: پشتیبان اجباری و تأیید متنی
	const backupFile = path.join(dir, 'backup.db');
	d.pragma('wal_checkpoint(TRUNCATE)');
	fs.copyFileSync(path.join(dir, 't.db'), backupFile);

	let noBackup = false;
	try {
		API.call('data.wipe', { mode: 'data', backupPath: '', confirmText: 'حذف' });
	} catch (e) {
		noBackup = /پشتیبان/.test(e.message);
	}
	ok('حذف بدون پشتیبان رد می‌شود', noBackup);

	let badConfirm = false;
	try {
		API.call('data.wipe', { mode: 'data', backupPath: backupFile, confirmText: 'بله' });
	} catch (e) {
		badConfirm = /تایپ/.test(e.message);
	}
	ok('حذف بدون تأیید متنی رد می‌شود', badConfirm);

	const fakeFile = path.join(dir, 'fake.db');
	fs.writeFileSync(fakeFile, Buffer.alloc(8192, 7));
	let fakeBackup = false;
	try {
		API.call('data.wipe', { mode: 'data', backupPath: fakeFile, confirmText: 'حذف' });
	} catch (e) {
		fakeBackup = /پایگاه داده/.test(e.message);
	}
	ok('فایل غیرپایگاه‌داده به‌عنوان پشتیبان پذیرفته نمی‌شود', fakeBackup);

	const productsBefore = count('products');
	const partiesBefore = count('parties');
	API.call('data.wipe', { mode: 'data', backupPath: backupFile, confirmText: 'حذف' });
	ok('حذف اطلاعات: اسناد پاک می‌شوند', count('documents') === 0 && count('journal_entries') === 0);
	ok(
		'حذف اطلاعات: کالاها و اشخاص باقی می‌مانند',
		count('products') === productsBefore && count('parties') === partiesBefore
	);
	ok(
		'حذف اطلاعات: موجودی صفر می‌شود',
		d.prepare('SELECT COALESCE(SUM(stock_qty),0) s FROM products').get().s === 0
	);
	ok('حذف اطلاعات: دفتر تراز می‌ماند', balanced());

	API.call('data.wipe', { mode: 'business', backupPath: backupFile, confirmText: 'حذف' });
	ok('حذف کسب‌وکار: کاربران پاک می‌شوند', count('users') === 0);
	ok('حذف کسب‌وکار: کالاها و اسناد پاک می‌شوند', count('products') === 0 && count('documents') === 0);
	ok(
		'حذف کسب‌وکار: ساختار پایه بازسازی می‌شود',
		count('accounts') > 10 && count('warehouses') === 1 && count('treasuries') === 1
	);
	ok('حذف کسب‌وکار: نشست بسته می‌شود', AUTH.current() === null);
	ok('پس از حذف، برنامه راه‌اندازی‌نشده است', AUTH.state().initialized === false);

	// ---- مهاجرت پایگاه قدیمی: کارتخوان‌هایی که حساب دفتری جدا داشتند
	const migBank = CAT.saveTreasury({ kind: 'bank', name: 'بانک مهاجرت' }).id;
	const legacyAccount = d
		.prepare(
			`INSERT INTO accounts(name,group_key,subgroup,nature,is_system,sort)
			 VALUES('کارتخوان قدیمی','terminal','terminal','debit',0,30)`
		)
		.run().lastInsertRowid;
	const legacyTerm = d
		.prepare(
			"INSERT INTO treasuries(kind,name,account_id,is_active) VALUES('terminal','کارتخوان قدیمی',?,1)"
		)
		.run(legacyAccount).lastInsertRowid;
	const cashAccountId = d.prepare("SELECT account_id FROM treasuries WHERE kind='cash'").get().account_id;
	const legacyEntry = d
		.prepare(
			"INSERT INTO journal_entries(number,entry_date,description) VALUES('JE-LEGACY',?,'مانده قدیمی کارتخوان')"
		)
		.run(DOC.today()).lastInsertRowid;
	const legacyLine = d.prepare(
		'INSERT INTO journal_lines(entry_id,account_id,debit,credit) VALUES(?,?,?,?)'
	);
	legacyLine.run(legacyEntry, legacyAccount, 50000, 0);
	legacyLine.run(legacyEntry, cashAccountId, 0, 50000);

	db.migrateTerminalTreasuries(d);
	const migrated = d.prepare('SELECT * FROM treasuries WHERE id=?').get(legacyTerm);
	const migBankAccount = d.prepare('SELECT account_id FROM treasuries WHERE id=?').get(migBank).account_id;
	const migBankBalance = d
		.prepare('SELECT COALESCE(SUM(debit-credit),0) v FROM journal_lines WHERE account_id=?')
		.get(migBankAccount).v;
	ok('مهاجرت: کارتخوان حساب دفتری خود را از دست می‌دهد', migrated.account_id === null);
	ok('مهاجرت: کارتخوان به حساب بانکی متصل می‌شود', migrated.settle_treasury_id === migBank);
	ok('مهاجرت: مانده کارتخوان به بانک منتقل می‌شود', migBankBalance === 50000, String(migBankBalance));
	ok(
		'مهاجرت: حساب قدیمی کارتخوان غیرفعال می‌شود',
		d.prepare('SELECT is_active FROM accounts WHERE id=?').get(legacyAccount).is_active === 0
	);
	ok('مهاجرت: دفتر تراز می‌ماند', balanced());

	console.log('\n' + log.join('\n'));
	console.log(`\n${log.filter((l) => l.startsWith('PASS')).length}/${log.length} تست موفق`);
	app.exit(process.exitCode || 0);
});
