/**
 * کاربران و نشست برنامه.
 * نقش‌ها: admin (مدیر، دسترسی کامل) و cashier (صندوق‌دار، فقط صفحه فروش).
 * نشست فقط در حافظه فرایند اصلی نگه داشته می‌شود؛ با بستن برنامه پاک می‌شود.
 */
const { get } = require('../db/index.cjs');
const PWD = require('./password.cjs');
const V = require('./validate.cjs');
const CAT = require('./catalog.cjs');

const ROLES = {
	admin: { key: 'admin', label: 'مدیر', home: '/' },
	cashier: { key: 'cashier', label: 'صندوق‌دار', home: '/pos' }
};

const MIN_PASSWORD = 4;
const MAX_PASSWORD = 64;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;

let session = null;
const attempts = new Map();

const roleLabel = (role) => ROLES[role]?.label || role;
const homeFor = (role) => ROLES[role]?.home || '/';

const publicUser = (row) => ({
	id: row.id,
	name: row.name,
	role: row.role,
	roleLabel: roleLabel(row.role),
	isActive: Boolean(row.is_active),
	lastLoginAt: row.last_login_at || null
});

function countUsers() {
	return get().prepare('SELECT COUNT(*) c FROM users').get().c;
}

function validatePassword(value) {
	const password = String(value ?? '');
	if (password.length < MIN_PASSWORD) throw new Error(`رمز عبور باید حداقل ${MIN_PASSWORD} نویسه باشد`);
	if (password.length > MAX_PASSWORD) throw new Error(`رمز عبور نباید بیشتر از ${MAX_PASSWORD} نویسه باشد`);
	return password;
}

function uniqueName(name, ignoreId = null) {
	const taken = get()
		.prepare('SELECT id FROM users WHERE name = ? AND id IS NOT ?')
		.get(name, ignoreId);
	if (taken) throw new Error('کاربری با این نام از قبل وجود دارد');
}

function requireRole(value) {
	return V.requireOneOf(value, ['admin', 'cashier'], 'نقش کاربر');
}

/* ------------------------------- نشست ------------------------------- */

const current = () => session;

function state() {
	const users = get()
		.prepare('SELECT * FROM users WHERE is_active = 1 ORDER BY CASE role WHEN \'admin\' THEN 0 ELSE 1 END, name')
		.all()
		.map(publicUser);

	return {
		initialized: countUsers() > 0,
		users,
		businessName: CAT.getSettings().business_name || 'حساب‌یار'
	};
}

function startSession(row) {
	session = publicUser(row);
	get().prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(row.id);
	return { ...session, home: homeFor(row.role) };
}

/* ----------------------------- راه‌اندازی ----------------------------- */

function setup(payload) {
	if (countUsers() > 0) throw new Error('برنامه قبلاً راه‌اندازی شده است');

	const businessName = V.requireText(payload.businessName, 'نام کسب‌وکار', 80);
	const password = validatePassword(payload.password);
	if (password !== String(payload.passwordConfirm ?? password)) throw new Error('تکرار رمز عبور یکسان نیست');

	const db = get();
	const id = db.transaction(() => {
		CAT.saveSettings({
			business_name: businessName,
			currency: payload.currency || 'تومان',
			business_phone: payload.phone || '',
			business_address: payload.address || ''
		});
		return db
			.prepare("INSERT INTO users(name, role, password_hash) VALUES(?, 'admin', ?)")
			.run('مدیر', PWD.hashPassword(password)).lastInsertRowid;
	})();

	return startSession(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

/* -------------------------------- ورود -------------------------------- */

function login({ userId, password } = {}) {
	const id = V.requireId(userId, 'کاربر');
	const gate = attempts.get(id);
	if (gate && gate.until > Date.now()) {
		const seconds = Math.ceil((gate.until - Date.now()) / 1000);
		throw new Error(`تلاش‌های ناموفق زیاد بود؛ ${seconds} ثانیه دیگر تلاش کنید`);
	}

	const row = get().prepare('SELECT * FROM users WHERE id = ?').get(id);
	if (!row || !row.is_active) throw new Error('کاربر یافت نشد یا غیرفعال است');
	if (!PWD.verifyPassword(password, row.password_hash)) {
		const next = { count: (gate?.count || 0) + 1, until: 0 };
		if (next.count >= MAX_ATTEMPTS) {
			next.until = Date.now() + LOCK_MS;
			next.count = 0;
		}
		attempts.set(id, next);
		const left = MAX_ATTEMPTS - next.count;
		throw new Error(next.until ? 'حساب موقتاً قفل شد؛ کمی بعد تلاش کنید' : `رمز عبور نادرست است (${left} تلاش باقی مانده)`);
	}

	attempts.delete(id);
	return startSession(row);
}

function logout() {
	session = null;
	return { ok: true };
}

/* ---------------------------- مدیریت کاربران ---------------------------- */

function createUser(payload) {
	const name = V.requireText(payload.name, 'نام کاربر', 40);
	const role = requireRole(payload.role);
	const password = validatePassword(payload.password);
	uniqueName(name);

	const id = get()
		.prepare('INSERT INTO users(name, role, password_hash) VALUES(?,?,?)')
		.run(name, role, PWD.hashPassword(password)).lastInsertRowid;

	return publicUser(get().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function updateUser(payload) {
	const id = V.requireId(payload.id, 'کاربر');
	const row = get().prepare('SELECT * FROM users WHERE id = ?').get(id);
	if (!row) throw new Error('کاربر یافت نشد');

	const name = V.requireText(payload.name ?? row.name, 'نام کاربر', 40);
	const role = requireRole(payload.role ?? row.role);
	const isActive = payload.isActive === undefined ? Boolean(row.is_active) : Boolean(payload.isActive);

	uniqueName(name, id);
	if (row.role === 'admin' && (role !== 'admin' || !isActive)) {
		const admins = get().prepare("SELECT COUNT(*) c FROM users WHERE role='admin' AND is_active=1 AND id IS NOT ?").get(id).c;
		if (admins === 0) throw new Error('حداقل یک مدیر فعال باید باقی بماند');
	}
	if (id === session?.id && !isActive) throw new Error('نمی‌توانید حساب خودتان را غیرفعال کنید');

	get().prepare('UPDATE users SET name=?, role=?, is_active=? WHERE id=?').run(name, role, isActive ? 1 : 0, id);

	if (id === session?.id) session = { ...session, name, role, roleLabel: roleLabel(role) };
	return publicUser(get().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function setPassword(payload) {
	const id = V.requireId(payload.id, 'کاربر');
	const password = validatePassword(payload.password);
	const exists = get().prepare('SELECT id FROM users WHERE id = ?').get(id);
	if (!exists) throw new Error('کاربر یافت نشد');

	get().prepare('UPDATE users SET password_hash=? WHERE id=?').run(PWD.hashPassword(password), id);
	attempts.delete(id);
	return { ok: true };
}

function removeUser({ id } = {}) {
	const userId = V.requireId(id, 'کاربر');
	if (userId === session?.id) throw new Error('نمی‌توانید حساب خودتان را حذف کنید');

	const row = get().prepare('SELECT * FROM users WHERE id = ?').get(userId);
	if (!row) throw new Error('کاربر یافت نشد');
	if (row.role === 'admin') {
		const admins = get().prepare("SELECT COUNT(*) c FROM users WHERE role='admin' AND is_active=1 AND id IS NOT ?").get(userId).c;
		if (admins === 0) throw new Error('آخرین مدیر را نمی‌توان حذف کرد');
	}

	get().prepare('DELETE FROM users WHERE id = ?').run(userId);
	return { ok: true };
}

module.exports = {
	ROLES,
	current,
	state,
	setup,
	login,
	logout,
	createUser,
	updateUser,
	setPassword,
	removeUser,
	homeFor,
	roleLabel
};
