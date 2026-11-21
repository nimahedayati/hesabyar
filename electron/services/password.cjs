/**
 * درهم‌سازی رمز عبور با scrypt و نمک تصادفی برای هر کاربر.
 * قالب ذخیره‌سازی: scrypt$N$r$p$salt(base64)$hash(base64)
 * رمز خام هرگز ذخیره یا لاگ نمی‌شود.
 */
const crypto = require('node:crypto');

const COST = 16384;
const BLOCK = 8;
const PARALLEL = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

const normalize = (plain) => String(plain ?? '').normalize('NFKC');

function derive(plain, salt, cost = COST, block = BLOCK, parallel = PARALLEL) {
	return crypto.scryptSync(normalize(plain), salt, KEY_LENGTH, {
		N: cost,
		r: block,
		p: parallel,
		maxmem: MAX_MEMORY
	});
}

function hashPassword(plain) {
	const salt = crypto.randomBytes(SALT_BYTES);
	const hash = derive(plain, salt);
	return `scrypt$${COST}$${BLOCK}$${PARALLEL}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(plain, stored) {
	if (typeof stored !== 'string') return false;
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

	const [, cost, block, parallel, saltB64, hashB64] = parts;
	let expected;
	try {
		expected = Buffer.from(hashB64, 'base64');
	} catch {
		return false;
	}

	let actual;
	try {
		actual = derive(plain, Buffer.from(saltB64, 'base64'), Number(cost), Number(block), Number(parallel));
	} catch {
		return false;
	}

	return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { hashPassword, verifyPassword };
