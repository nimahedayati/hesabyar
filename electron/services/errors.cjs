/**
 * خطاهای دامنه. پیام‌ها فارسی و کاربرپسند هستند؛ کد برای تشخیص برنامه‌نویسی.
 */
class AppError extends Error {
	constructor(message, code = 'APP_ERROR') {
		super(message);
		this.name = 'AppError';
		this.code = code;
	}
}

const fail = (message, code) => {
	throw new AppError(message, code);
};

module.exports = { AppError, fail };
