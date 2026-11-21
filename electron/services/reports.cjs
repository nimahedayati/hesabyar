const { get } = require('../db/index.cjs');
const { r2 } = require('./ledger.cjs');
const { today } = require('./documents.cjs');

function treasuryBalances() {
	const db = get();
	const rows = db
		.prepare(
			`SELECT t.id, t.kind, t.name, t.bank_name, t.account_id,
			        COALESCE((SELECT SUM(jl.debit-jl.credit) FROM journal_lines jl WHERE jl.account_id=t.account_id),0) bal
			 FROM treasuries t WHERE t.is_active=1 ORDER BY t.sort`
		)
		.all();
	return rows.map((r) => ({ ...r, bal: r2(r.bal) }));
}

function partyBalances() {
	const db = get();
	return db
		.prepare(
			`SELECT p.id, p.name, p.kind, p.phone, p.credit_limit,
			        COALESCE((SELECT SUM(jl.debit-jl.credit) FROM journal_lines jl WHERE jl.account_id=p.account_id),0) bal
			 FROM parties p WHERE p.is_active=1 ORDER BY bal DESC`
		)
		.all()
		.map((r) => ({ ...r, bal: r2(r.bal) }));
}

function sumDocs(types, from, to, field = 'total') {
	const q = `SELECT COALESCE(SUM(${field}),0) v FROM documents
	           WHERE status='posted' AND type IN (${types.map(() => '?').join(',')})
	           AND doc_date >= ? AND doc_date <= ?`;
	return r2(get().prepare(q).get(...types, from, to).v);
}

function dashboard() {
	const db = get();
	const t = today();
	const monthStart = t.slice(0, 8) + '01';

	const salesToday = sumDocs(['sale'], t, t);
	const salesReturnsToday = sumDocs(['sale_return'], t, t);
	const purchaseToday = sumDocs(['purchase'], t, t);
	const profitToday = r2(
		sumDocs(['sale'], t, t, 'profit') + sumDocs(['sale_return'], t, t, 'profit')
	);
	const receiptsToday = sumDocs(['receipt'], t, t);
	const paymentsToday = sumDocs(['payment', 'expense'], t, t);
	const invoiceCount = db
		.prepare(`SELECT COUNT(*) c FROM documents WHERE type='sale' AND status='posted' AND doc_date=?`)
		.get(t).c;

	const treas = treasuryBalances();
	const cash = r2(treas.filter((x) => x.kind === 'cash').reduce((s, x) => s + x.bal, 0));
	const bank = r2(treas.filter((x) => x.kind === 'bank').reduce((s, x) => s + x.bal, 0));
	const terminal = r2(treas.filter((x) => x.kind === 'terminal').reduce((s, x) => s + x.bal, 0));

	const parties = partyBalances();
	const receivable = r2(parties.filter((p) => p.bal > 0).reduce((s, p) => s + p.bal, 0));
	const payable = r2(Math.abs(parties.filter((p) => p.bal < 0).reduce((s, p) => s + p.bal, 0)));

	const lowStock = db
		.prepare(
			`SELECT id, name, stock_qty, min_stock, unit FROM products
			 WHERE is_active=1 AND min_stock > 0 AND stock_qty <= min_stock ORDER BY (stock_qty-min_stock) LIMIT 8`
		)
		.all();

	const dueChecks = db
		.prepare(
			`SELECT c.*, p.name party_name FROM checks c LEFT JOIN parties p ON p.id=c.party_id
			 WHERE c.status IN ('in_hand','endorsed') AND c.due_date <= date(?, '+7 day') ORDER BY c.due_date LIMIT 8`
		)
		.all(t);

	const series = db
		.prepare(
			`SELECT doc_date d, COALESCE(SUM(total),0) total, COALESCE(SUM(profit),0) profit, COUNT(*) c
			 FROM documents WHERE type='sale' AND status='posted' AND doc_date >= date(?, '-13 day')
			 GROUP BY doc_date ORDER BY doc_date`
		)
		.all(t);

	const topProducts = db
		.prepare(
			`SELECT p.id, p.name, SUM(l.qty) qty, SUM(l.line_total) total, SUM(l.line_total-l.cost_total) profit
			 FROM document_lines l
			 JOIN documents d ON d.id=l.document_id AND d.type='sale' AND d.status='posted'
			 JOIN products p ON p.id=l.product_id
			 WHERE d.doc_date >= ? GROUP BY p.id ORDER BY total DESC LIMIT 6`
		)
		.all(monthStart);

	const methods = db
		.prepare(
			`SELECT dp.method, SUM(dp.amount) amount FROM document_payments dp
			 JOIN documents d ON d.id=dp.document_id AND d.type='sale' AND d.status='posted'
			 WHERE d.doc_date >= ? GROUP BY dp.method ORDER BY amount DESC`
		)
		.all(monthStart);

	const monthSales = sumDocs(['sale'], monthStart, t);
	const monthProfit = r2(
		sumDocs(['sale'], monthStart, t, 'profit') + sumDocs(['sale_return'], monthStart, t, 'profit')
	);

	return {
		date: t,
		salesToday,
		salesReturnsToday,
		purchaseToday,
		profitToday,
		receiptsToday,
		paymentsToday,
		invoiceCount,
		cash,
		bank,
		terminal,
		liquidity: r2(cash + bank + terminal),
		receivable,
		payable,
		lowStock,
		dueChecks,
		series,
		topProducts,
		methods,
		monthSales,
		monthProfit
	};
}

/** سود و زیان — کاملاً مستقل از جریان نقدی */
function profitReport(from, to) {
	const db = get();
	const rows = db
		.prepare(
			`SELECT a.id, a.name, a.group_key, a.subgroup, a.nature,
			        COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
			 FROM journal_lines jl
			 JOIN journal_entries je ON je.id=jl.entry_id
			 JOIN accounts a ON a.id=jl.account_id
			 WHERE a.group_key IN ('income','expense') AND je.entry_date BETWEEN ? AND ?
			 GROUP BY a.id ORDER BY a.code`
		)
		.all(from, to);

	const signed = (r) => (r.nature === 'credit' ? r2(r.c - r.d) : r2(r.d - r.c));

	const revenue = rows
		.filter((r) => r.group_key === 'income' && r.subgroup === 'sales')
		.map((r) => ({ name: r.name, amount: signed(r) }));
	const salesReturns = rows
		.filter((r) => r.subgroup === 'sales_return')
		.map((r) => ({ name: r.name, amount: -signed(r) }));
	const discounts = rows
		.filter((r) => r.subgroup === 'sales_discount')
		.map((r) => ({ name: r.name, amount: -signed(r) }));
	const cogs = rows.filter((r) => r.subgroup === 'cogs').map((r) => ({ name: r.name, amount: signed(r) }));
	const operating = rows
		.filter((r) => r.group_key === 'expense' && r.subgroup === 'operating')
		.map((r) => ({ name: r.name, amount: signed(r) }));
	const otherIncome = rows
		.filter((r) => r.group_key === 'income' && r.subgroup === 'other')
		.map((r) => ({ name: r.name, amount: signed(r) }));

	const total = (arr) => r2(arr.reduce((s, x) => s + x.amount, 0));
	const grossSales = total(revenue);
	// برگشت از فروش و تخفیف با علامت منفی نگه داشته می‌شوند، پس جمع می‌شوند نه تفریق
	const netSales = r2(grossSales + total(salesReturns) + total(discounts));
	const grossProfit = r2(netSales - total(cogs));
	const operatingProfit = r2(grossProfit - total(operating) + total(otherIncome));

	return {
		revenue,
		salesReturns,
		discounts,
		cogs,
		operating,
		otherIncome,
		grossSales,
		netSales,
		grossProfit,
		operatingTotal: total(operating),
		otherIncomeTotal: total(otherIncome),
		operatingProfit,
		margin: netSales > 0 ? r2((grossProfit / netSales) * 100) : 0
	};
}

/** جریان نقدی — فقط حرکت واقعی پول در خزانه‌ها */
function cashflow(from, to) {
	const db = get();
	const treas = treasuryBalances();
	const rows = db
		.prepare(
			`SELECT t.kind, t.name, t.account_id,
			        COALESCE(SUM(CASE WHEN je.entry_date BETWEEN ? AND ? THEN jl.debit-jl.credit ELSE 0 END),0) move,
			        COALESCE(SUM(CASE WHEN je.entry_date < ? THEN jl.debit-jl.credit ELSE 0 END),0) opening
			 FROM treasuries t
			 LEFT JOIN journal_lines jl ON jl.account_id = t.account_id
			 LEFT JOIN journal_entries je ON je.id = jl.entry_id
			 WHERE t.is_active=1 GROUP BY t.id ORDER BY t.sort`
		)
		.all(from, to, from);

	const byDay = db
		.prepare(
			`SELECT je.entry_date d,
			        SUM(CASE WHEN jl.debit>0 THEN jl.debit ELSE 0 END) inflow,
			        SUM(CASE WHEN jl.credit>0 THEN jl.credit ELSE 0 END) outflow
			 FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
			 JOIN accounts a ON a.id=jl.account_id
			 WHERE a.group_key IN ('cash','bank','terminal') AND je.entry_date BETWEEN ? AND ?
			 GROUP BY je.entry_date ORDER BY je.entry_date`
		)
		.all(from, to);

	return {
		accounts: treas,
		byDay,
		opening: r2(rows.reduce((s, r) => s + r.opening, 0)),
		inflow: r2(rows.reduce((s, r) => s + (r.move > 0 ? r.move : 0), 0)),
		outflow: r2(rows.reduce((s, r) => s + (r.move < 0 ? -r.move : 0), 0)),
		closing: r2(treas.reduce((s, r) => s + r.bal, 0))
	};
}

function salesReport(from, to, groupBy = 'day') {
	const db = get();
	const key = { day: 'd.doc_date', product: 'l.product_id', customer: 'd.party_id', category: 'p.category_id' }[groupBy] || 'd.doc_date';
	const joinProduct = groupBy === 'product' || groupBy === 'category' ? 'JOIN products p ON p.id=l.product_id' : '';
	const label =
		groupBy === 'product'
			? 'p.name'
			: groupBy === 'category'
				? `COALESCE((SELECT name FROM product_categories WHERE id=p.category_id),'بدون گروه')`
				: groupBy === 'customer'
					? `COALESCE(pt.name, d.party_name, 'مشتری متفرقه')`
					: 'd.doc_date';
	return db
		.prepare(
			`SELECT ${key} k, ${label} label, COUNT(DISTINCT d.id) cnt,
			        SUM(l.qty) qty, SUM(l.line_total) total, SUM(l.line_total-l.cost_total) profit
			 FROM document_lines l
			 JOIN documents d ON d.id=l.document_id AND d.status='posted' AND d.type='sale'
			 ${joinProduct}
			 LEFT JOIN parties pt ON pt.id=d.party_id
			 WHERE d.doc_date BETWEEN ? AND ?
			 GROUP BY k ORDER BY ${groupBy === 'day' ? 'k' : 'total DESC'}`
		)
		.all(from, to);
}

function stockReport() {
	const db = get();
	const rows = db
		.prepare(
			`SELECT p.*, c.name category_name,
			        ROUND(p.stock_qty*p.avg_cost) value,
			        ROUND((p.sale_price-p.avg_cost)) margin
			 FROM products p LEFT JOIN product_categories c ON c.id=p.category_id
			 WHERE p.is_active=1 ORDER BY p.name`
		)
		.all();
	return { rows, totalValue: r2(rows.reduce((s, r) => s + (r.value || 0), 0)) };
}

function checksReport() {
	const db = get();
	return db
		.prepare(
			`SELECT c.*, p.name party_name FROM checks c LEFT JOIN parties p ON p.id=c.party_id
			 ORDER BY CASE c.status WHEN 'in_hand' THEN 0 WHEN 'endorsed' THEN 1 ELSE 2 END, c.due_date`
		)
		.all();
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

function documentFilter({ type, from, to, q }) {
	const where = [];
	const args = [];
	if (type) {
		const types = Array.isArray(type) ? type : [type];
		where.push(`d.type IN (${types.map(() => '?').join(',')})`);
		args.push(...types);
	}
	if (from) {
		where.push('d.doc_date >= ?');
		args.push(from);
	}
	if (to) {
		where.push('d.doc_date <= ?');
		args.push(to);
	}
	if (q) {
		where.push('(d.number LIKE ? OR p.name LIKE ? OR d.party_name LIKE ?)');
		args.push(`%${q}%`, `%${q}%`, `%${q}%`);
	}
	return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

function listDocuments({ type = null, from = null, to = null, q = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
	const db = get();
	const { clause, args } = documentFilter({ type, from, to, q });
	const size = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 5), MAX_PAGE_SIZE);
	const current = Math.max(Number(page) || 1, 1);

	const total = db
		.prepare(`SELECT COUNT(*) c FROM documents d LEFT JOIN parties p ON p.id = d.party_id ${clause}`)
		.get(...args).c;

	const rows = db
		.prepare(
			`SELECT d.*, COALESCE(p.name, d.party_name, 'مشتری متفرقه') AS party_label
			 FROM documents d LEFT JOIN parties p ON p.id = d.party_id
			 ${clause} ORDER BY d.doc_date DESC, d.id DESC LIMIT ? OFFSET ?`
		)
		.all(...args, size, (current - 1) * size);

	return { rows, total, page: current, pageSize: size, pages: Math.max(Math.ceil(total / size), 1) };
}

/** گردش هر کارتخوان — برای مغایرت‌گیری با واریزی بانک */
function terminalReport(from, to) {
	const db = get();
	return db
		.prepare(
			`SELECT t.id, t.name, t.terminal_no, t.fee_percent, b.name AS bank_name,
			        COUNT(dp.id) AS tx_count,
			        COALESCE(SUM(dp.amount), 0) AS amount
			 FROM treasuries t
			 LEFT JOIN treasuries b ON b.id = t.settle_treasury_id
			 LEFT JOIN document_payments dp ON dp.treasury_id = t.id
			 LEFT JOIN documents d ON d.id = dp.document_id AND d.status = 'posted'
			      AND d.doc_date BETWEEN ? AND ?
			 WHERE t.kind = 'terminal' AND t.is_active = 1
			 GROUP BY t.id ORDER BY amount DESC`
		)
		.all(from, to)
		.map((row) => ({ ...row, fee: r2((row.amount * row.fee_percent) / 100) }));
}

function getDocument(id) {
	const db = get();
	const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(id);
	if (!doc) return null;
	doc.party = doc.party_id ? db.prepare('SELECT * FROM parties WHERE id=?').get(doc.party_id) : null;
	doc.lines = db.prepare(
		`SELECT l.*, p.name product_name, p.unit p_unit FROM document_lines l
		 LEFT JOIN products p ON p.id=l.product_id WHERE l.document_id=? ORDER BY l.sort`
	).all(id);
	doc.payments = db.prepare(
		`SELECT dp.*, t.name treasury_name FROM document_payments dp
		 LEFT JOIN treasuries t ON t.id=dp.treasury_id WHERE dp.document_id=?`
	).all(id);
	doc.journal = doc.journal_id
		? db.prepare(
			`SELECT jl.*, a.name account_name, a.code account_code FROM journal_lines jl
			 JOIN accounts a ON a.id=jl.account_id WHERE jl.entry_id=?`
		).all(doc.journal_id)
		: [];
	return doc;
}

function balanceSheet() {
	const db = get();
	const rows = db
		.prepare(
			`SELECT a.group_key, a.nature, a.name,
			        COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
			 FROM accounts a LEFT JOIN journal_lines jl ON jl.account_id=a.id
			 GROUP BY a.id`
		)
		.all();
	const signed = (r) => (r.nature === 'credit' ? r2(r.c - r.d) : r2(r.d - r.c));
	const groups = { assets: 0, liabilities: 0, equity: 0, profit: 0 };
	for (const r of rows) {
		const v = signed(r);
		if (['cash', 'bank', 'terminal', 'inventory', 'checks'].includes(r.group_key)) groups.assets += v;
		else if (r.group_key === 'persons') {
			if (v > 0) groups.assets += v;
			else groups.liabilities += -v;
		} else if (r.group_key === 'liability' || r.group_key === 'tax') groups.liabilities += v;
		else if (r.group_key === 'equity') groups.equity += v;
		else if (r.group_key === 'income') groups.profit += v;
		else if (r.group_key === 'expense') groups.profit -= v;
	}
	return {
		assets: r2(groups.assets),
		liabilities: r2(groups.liabilities),
		equity: r2(groups.equity),
		profit: r2(groups.profit),
		total: r2(groups.equity + groups.profit)
	};
}

module.exports = {
	dashboard,
	profitReport,
	cashflow,
	salesReport,
	stockReport,
	checksReport,
	listDocuments,
	getDocument,
	balanceSheet,
	treasuryBalances,
	partyBalances,
	terminalReport
};
