/**
 * عملیات حساس روی داده‌ها.
 * قاعده ثابت: هیچ حذفی بدون یک نسخه پشتیبان معتبر و تأیید متنی انجام نمی‌شود.
 * این بررسی سمت فرایند اصلی است، پس از رابط کاربری قابل دور زدن نیست.
 */
const fs = require('node:fs');
const path = require('node:path');
const { get, resetData, resetBusiness } = require('../db/index.cjs');
const AUTH = require('./auth.cjs');

const CONFIRM_WORD = 'حذف';
const SQLITE_MAGIC = 'SQLite format 3';
const MIN_BACKUP_BYTES = 4096;

const MODES = {
	data: {
		label: 'حذف کامل اطلاعات',
		description: 'همه اسناد، گردش انبار و دفتر کل پاک می‌شود؛ کالاها و اشخاص می‌مانند.'
	},
	business: {
		label: 'حذف کامل کسب‌وکار',
		description: 'همه داده‌ها پاک می‌شود و برنامه به حالت راه‌اندازی اولیه برمی‌گردد.'
	}
};

function stats() {
	const db = get();
	const count = (sql) => db.prepare(sql).get().c;
	return {
		products: count('SELECT COUNT(*) c FROM products'),
		parties: count('SELECT COUNT(*) c FROM parties'),
		documents: count('SELECT COUNT(*) c FROM documents'),
		journal: count('SELECT COUNT(*) c FROM journal_entries'),
		users: count('SELECT COUNT(*) c FROM users'),
		modes: MODES,
		confirmWord: CONFIRM_WORD
	};
}

/** پشتیبان باید فایل موجود، غیرخالی و یک پایگاه داده SQLite واقعی باشد */
function assertBackup(backupPath) {
	if (!backupPath) throw new Error('پیش از حذف باید از اطلاعات پشتیبان بگیرید');

	const file = path.resolve(String(backupPath));
	const stat = fs.statSync(file, { throwIfNoEntry: false });
	if (!stat?.isFile()) throw new Error('فایل پشتیبان پیدا نشد؛ دوباره پشتیبان بگیرید');
	if (stat.size < MIN_BACKUP_BYTES) throw new Error('فایل پشتیبان معتبر نیست؛ دوباره پشتیبان بگیرید');

	const header = Buffer.alloc(16);
	const fd = fs.openSync(file, 'r');
	try {
		fs.readSync(fd, header, 0, 16, 0);
	} finally {
		fs.closeSync(fd);
	}
	if (header.toString('utf8', 0, SQLITE_MAGIC.length) !== SQLITE_MAGIC) {
		throw new Error('فایل انتخاب‌شده پایگاه داده حساب‌یار نیست');
	}
	return file;
}

function wipe({ mode, backupPath, confirmText } = {}) {
	if (!MODES[mode]) throw new Error('نوع عملیات نامعتبر است');

	assertBackup(backupPath);

	if (String(confirmText ?? '').trim() !== CONFIRM_WORD) {
		throw new Error(`برای تأیید، واژه «${CONFIRM_WORD}» را تایپ کنید`);
	}

	if (mode === 'business') {
		AUTH.logout();
		return { ...resetBusiness(), backupPath: path.resolve(String(backupPath)) };
	}

	return { ...resetData(), backupPath: path.resolve(String(backupPath)) };
}

module.exports = { stats, wipe, assertBackup, MODES, CONFIRM_WORD };
