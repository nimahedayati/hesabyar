const { get } = require('../db/index.cjs');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** شماره‌گذاری خودکار */
function nextSeq(key, prefix, pad = 5) {
	const db = get();
	const row = db.prepare('SELECT value FROM counters WHERE key=?').get(key);
	const next = (row ? row.value : 0) + 1;
	if (row) db.prepare('UPDATE counters SET value=? WHERE key=?').run(next, key);
	else db.prepare('INSERT INTO counters(key,value) VALUES(?,?)').run(key, next);
	return `${prefix}-${String(next).padStart(pad, '0')}`;
}

function accountsByKey() {
	const rows = get().prepare('SELECT * FROM accounts').all();
	const map = {};
	for (const r of rows) map[r.group_key] = map[r.group_key] || r; // اولین حساب هر گروه
	return map;
}

function accountByCode(code) {
	return get().prepare('SELECT * FROM accounts WHERE code=?').get(code);
}

/**
 * ثبت سند در دفتر روزنامه.
 * lines: [{ accountId, debit, credit, partyId, description }]
 * سند ناتراز پذیرفته نمی‌شود — این تضمین اصلی صحت اطلاعات است.
 */
function postEntry({ date, documentId = null, description = '', lines, isReversal = 0, reversedId = null }) {
	const db = get();
	const clean = lines
		.map((l) => ({
			accountId: l.accountId,
			partyId: l.partyId || null,
			debit: r2(l.debit || 0),
			credit: r2(l.credit || 0),
			description: l.description || description
		}))
		.filter((l) => l.accountId && (l.debit !== 0 || l.credit !== 0));

	if (!clean.length) return null;

	const dr = r2(clean.reduce((s, l) => s + l.debit, 0));
	const cr = r2(clean.reduce((s, l) => s + l.credit, 0));
	if (Math.abs(dr - cr) > 0.01) {
		throw new Error(`سند تراز نیست — بدهکار ${dr.toLocaleString('fa-IR')} / بستانکار ${cr.toLocaleString('fa-IR')}`);
	}

	const number = nextSeq('journal', 'JE');
	const id = db
		.prepare(
			`INSERT INTO journal_entries(number,entry_date,document_id,description,is_reversal,reversed_id)
			 VALUES(?,?,?,?,?,?)`
		)
		.run(number, date, documentId, description, isReversal, reversedId).lastInsertRowid;

	const ins = db.prepare(
		`INSERT INTO journal_lines(entry_id,account_id,party_id,debit,credit,description) VALUES(?,?,?,?,?,?)`
	);
	for (const l of clean) ins.run(id, l.accountId, l.partyId, l.debit, l.credit, l.description);

	return id;
}

/** سند معکوس — به‌جای حذف، اثر سند اصلی را برمی‌گرداند و سابقه می‌ماند */
function reverseEntry(entryId, date, reason = 'ابطال سند') {
	const db = get();
	const entry = db.prepare('SELECT * FROM journal_entries WHERE id=?').get(entryId);
	if (!entry) return null;
	const already = db.prepare('SELECT id FROM journal_entries WHERE reversed_id=?').get(entryId);
	if (already) return already.id;

	const lines = db.prepare('SELECT * FROM journal_lines WHERE entry_id=?').all(entryId);
	return postEntry({
		date: date || new Date().toISOString().slice(0, 10),
		documentId: entry.document_id,
		description: `برگشت سند ${entry.number} — ${reason}`,
		lines: lines.map((l) => ({
			accountId: l.account_id,
			partyId: l.party_id,
			debit: l.credit,
			credit: l.debit,
			description: l.description
		})),
		isReversal: 1,
		reversedId: entryId
	});
}

/** مانده یک حساب تا تاریخ مشخص (بدهکار - بستانکار) */
function accountBalance(accountId, toDate = null) {
	const row = get()
		.prepare(
			`SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
			 FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
			 WHERE jl.account_id = ? AND (? IS NULL OR je.entry_date <= ?)`
		)
		.get(accountId, toDate, toDate);
	return r2(row.d - row.c);
}

function ledgerOf(accountId, { from = null, to = null } = {}) {
	const db = get();
	const rows = db
		.prepare(
			`SELECT je.id entry_id, je.number, je.entry_date, je.description, je.document_id,
			        jl.debit, jl.credit, d.type doc_type, d.number doc_number
			 FROM journal_lines jl
			 JOIN journal_entries je ON je.id = jl.entry_id
			 LEFT JOIN documents d ON d.id = je.document_id
			 WHERE jl.account_id = ? AND (? IS NULL OR je.entry_date >= ?) AND (? IS NULL OR je.entry_date <= ?)
			 ORDER BY je.entry_date, je.id`
		)
		.all(accountId, from, from, to, to);
	let bal = 0;
	const opening = db
		.prepare(
			`SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
			 FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
			 WHERE jl.account_id=? AND (? IS NOT NULL AND je.entry_date < ?)`
		)
		.get(accountId, from, from);
	bal = r2(opening.d - opening.c);
	return {
		opening: bal,
		rows: rows.map((r) => {
			bal = r2(bal + r.debit - r.credit);
			return { ...r, balance: bal };
		}),
		closing: bal
	};
}

module.exports = { postEntry, reverseEntry, accountBalance, ledgerOf, nextSeq, accountsByKey, accountByCode, r2 };
