/**
 * تنها نقطه ورود درخواست‌های رابط کاربری. این فایل هیچ منطقی ندارد؛
 * فقط نام متد را به سرویس مربوطه نگاشت می‌کند.
 */
const { get } = require('../db/index.cjs');
const L = require('./ledger.cjs');
const INV = require('./inventory.cjs');
const DOC = require('./documents.cjs');
const CAT = require('./catalog.cjs');
const R = require('./reports.cjs');
const AUTH = require('./auth.cjs');
const ACTOR = require('./actor.cjs');
const MAINT = require('./maintenance.cjs');

/** بدون نشست قابل فراخوانی است (صفحه ورود و راه‌اندازی اولیه) */
const PUBLIC_METHODS = new Set(['auth.state', 'auth.session', 'auth.setup', 'auth.login', 'auth.logout']);

/** نقش صندوق‌دار فقط به این متدها دسترسی دارد */
const CASHIER_METHODS = new Set([
	'auth.state',
	'auth.logout',
	'bootstrap',
	'settings.get',
	'products.list',
	'products.search',
	'products.byBarcode',
	'products.favorite',
	'parties.list',
	'parties.search',
	'parties.get',
	'docs.sale',
	'docs.get'
]);

const partyLedger = ({ id }) => {
	const party = CAT.getParty({ id });
	return { party, ...L.ledgerOf(party.account_id) };
};

const handlers = {
	/* ---------------- احراز هویت و کاربران ---------------- */
	'auth.state': () => AUTH.state(),
	'auth.session': () => AUTH.current(),
	'auth.setup': (p) => AUTH.setup(p),
	'auth.login': (p) => AUTH.login(p),
	'auth.logout': () => AUTH.logout(),
	'auth.me': () => AUTH.current(),

	'users.create': (p) => AUTH.createUser(p),
	'users.update': (p) => AUTH.updateUser(p),
	'users.password': (p) => AUTH.setPassword(p),
	'users.remove': (p) => AUTH.removeUser(p),

	/* ---------------- اطلاعات پایه ---------------- */
	bootstrap: () => {
		const data = CAT.bootstrap();
		// موجودی حساب‌ها فقط برای مدیر
		if (AUTH.current()?.role !== 'admin') delete data.accounts;
		return data;
	},

	'products.list': (p) => CAT.listProducts(p),
	'products.search': (p) => CAT.searchProducts(p),
	'products.byBarcode': (p) => CAT.productByBarcode(p),
	'products.save': (p) => CAT.saveProduct(p),
	'products.remove': (p) => CAT.removeProduct(p),
	'products.favorite': (p) => CAT.toggleFavorite(p),
	'products.kardex': ({ id, from, to }) => INV.kardex(id, { from, to }),

	'categories.list': () => CAT.listCategories(),
	'categories.save': (p) => CAT.saveCategory(p),
	'categories.remove': (p) => CAT.removeCategory(p),

	'parties.list': (p) => CAT.listParties(p),
	'parties.search': (p) => CAT.searchParties(p),
	'parties.get': (p) => CAT.getParty(p),
	'parties.summary': () => CAT.partySummary(),
	'parties.save': (p) => CAT.saveParty(p),
	'parties.remove': (p) => CAT.removeParty(p),
	'parties.ledger': partyLedger,

	'accounts.list': () => CAT.listAccounts(),
	'accounts.save': (p) => CAT.saveAccount(p),
	'accounts.ledger': ({ id, from, to }) => L.ledgerOf(id, { from, to }),

	'treasuries.list': (p) => CAT.listTreasuries(p),
	'treasuries.save': (p) => CAT.saveTreasury(p),
	'treasuries.remove': (p) => CAT.removeTreasury(p),

	'warehouses.list': () => CAT.listWarehouses(),
	'warehouses.save': (p) => CAT.saveWarehouse(p),

	'settings.get': () => CAT.getSettings(),
	'settings.save': (p) => CAT.saveSettings(p),

	/* ---------------- اسناد ---------------- */
	'docs.sale': (p) => DOC.createSale(p),
	'docs.purchase': (p) => DOC.createPurchase(p),
	'docs.saleReturn': (p) => DOC.createSaleReturn(p),
	'docs.purchaseReturn': (p) => DOC.createPurchaseReturn(p),
	'docs.receipt': (p) => DOC.createReceipt(p),
	'docs.payment': (p) => DOC.createPayment(p),
	'docs.expense': (p) => DOC.createExpense(p),
	'docs.income': (p) => DOC.createIncome(p),
	'docs.transfer': (p) => DOC.createTransfer(p),
	'docs.opening': (p) => DOC.createOpening(p),
	'docs.journal': (p) => DOC.createJournal(p),
	'docs.check': (p) => DOC.createCheck(p),
	'docs.settleCheck': ({ id, action, treasuryId, partyId }) =>
		DOC.settleCheck(id, action, { treasuryId, partyId }),
	'docs.void': ({ id, reason }) => DOC.voidDocument(id, reason),
	'docs.revise': ({ id, payload }) => DOC.reviseDocument(id, payload),
	'docs.list': (p) => R.listDocuments(p),
	'docs.get': ({ id }) => R.getDocument(id),

	/* ---------------- گزارش‌ها ---------------- */
	'reports.dashboard': () => R.dashboard(),
	'reports.profit': ({ from, to }) => R.profitReport(from, to),
	'reports.cashflow': ({ from, to }) => R.cashflow(from, to),
	'reports.sales': ({ from, to, groupBy }) => R.salesReport(from, to, groupBy),
	'reports.stock': () => R.stockReport(),
	'reports.checks': () => R.checksReport(),
	'checks.list': () => R.checksReport(),
	'reports.balance': () => R.balanceSheet(),
	'reports.terminals': ({ from, to }) => R.terminalReport(from, to),
	'reports.partyBalances': () => R.partyBalances(),

	/* ---------------- سیستم ---------------- */
	'audit.list': ({ limit = 50 }) =>
		get()
			.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?')
			.all(Math.min(Number(limit) || 50, 200)),

	'data.stats': () => MAINT.stats(),
	'data.wipe': (p) => MAINT.wipe(p),

	'db.info': () => {
		const db = get();
		return {
			path: db.name,
			products: db.prepare('SELECT COUNT(*) c FROM products WHERE is_active = 1').get().c,
			documents: db.prepare('SELECT COUNT(*) c FROM documents').get().c,
			journal: db.prepare('SELECT COUNT(*) c FROM journal_entries').get().c
		};
	}
};

function authorize(method) {
	if (PUBLIC_METHODS.has(method)) return AUTH.current();

	const session = AUTH.current();
	if (!session) throw new Error('برای انجام این عملیات ابتدا وارد شوید');
	if (session.role !== 'admin' && !CASHIER_METHODS.has(method)) {
		throw new Error('این بخش برای نقش صندوق‌دار مجاز نیست');
	}
	return session;
}

function call(method, payload = {}) {
	const handler = handlers[method];
	if (!handler) throw new Error(`متد ناشناخته: ${method}`);

	const session = authorize(method);
	ACTOR.set(session);
	try {
		return handler(payload);
	} finally {
		ACTOR.set(AUTH.current());
	}
}

module.exports = { call, handlers };
