/**
 * کاربر جاری برای ثبت «چه کسی این سند را زد» در documents.created_by و audit_log.
 * فقط از لایه API تنظیم می‌شود تا سرویس‌ها به وضعیت نشست وابسته نشوند.
 */
let current = { id: null, name: 'سیستم' };

function set(user) {
	current = user ? { id: user.id ?? null, name: user.name || 'سیستم' } : { id: null, name: 'سیستم' };
}

const get = () => current;

module.exports = { set, get };
