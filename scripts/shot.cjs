/*
 * گرفتن اسکرین‌شات برای README — روی پایگاه داده موقت و با داده نمایشی ثابت.
 * ترتیب: راه‌اندازی اولیه → داده نمایشی → همه صفحات → صفحه ورود.
 * اجرا: npm run shots
 */
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'build');
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const PASSWORD = '1234';

app.setName('Hesabyar');
app.disableHardwareAcceleration();

protocol.registerSchemesAsPrivileged([
	{
		scheme: 'app',
		privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
	}
]);

const db = require('../electron/db/index.cjs');
const api = require('../electron/services/api.cjs');
const AUTH = require('../electron/services/auth.cjs');
const { seedDemo } = require('./demo-data.cjs');

ipcMain.handle('api', async (_event, method, payload) => {
	try {
		return { ok: true, data: api.call(method, payload || {}) };
	} catch (error) {
		return { ok: false, error: error.message };
	}
});
ipcMain.handle('app:info', () => ({ version: '0.1.0' }));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function shot(win, name) {
	await sleep(600);
	const debug = win.webContents.debugger;
	if (!debug.isAttached()) debug.attach('1.3');
	const { data } = await debug.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true });
	fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
	const where = await win.webContents.executeJavaScript('location.pathname');
	console.log('shot', name, '←', where);
}

/** پیمایش با لینک واقعی سایدبار */
async function goto(win, route) {
	const clicked = await win.webContents.executeJavaScript(`
		(() => {
			const link = document.querySelector('a[href="${route}"]');
			if (link) { link.click(); return true; }
			location.href = '${route}';
			return false;
		})()
	`);
	await sleep(clicked ? 1200 : 1800);
}

const run = (win, code) => win.webContents.executeJavaScript(code);

/** انتخاب کاربر از فهرست کشویی (دکمه ورود بعد از به‌روزرسانی UI فعال می‌شود) */
async function selectLoginUser(win) {
	const name = await run(
		win,
		`(() => {
			const select = document.querySelector('#login-user');
			if (!select) return null;
			const option = [...select.options].find((o) => o.value);
			if (!option) return null;
			select.value = option.value;
			select.dispatchEvent(new Event('change', { bubbles: true }));
			return option.textContent;
		})()`
	);
	await sleep(400);
	return name;
}

async function submitLogin(win, password) {
	await run(
		win,
		`(() => {
			const pass = document.querySelector('#login-pass');
			pass.value = '${password}';
			pass.dispatchEvent(new Event('input', { bubbles: true }));
			return true;
		})()`
	);
	await sleep(300);
	const clicked = await run(
		win,
		`(() => {
			const btn = [...document.querySelectorAll('button[type="submit"]')].find((b) => b.textContent.includes('ورود'));
			if (!btn || btn.disabled) return 'disabled';
			btn.click();
			return 'clicked';
		})()`
	);
	await sleep(2000);
	return clicked;
}

const isLoginScreen = (win) => run(win, `!!document.querySelector('#login-user')`);

/** ورود مطمئن: بارگذاری اولیه وضعیت احراز هویت ممکن است با کلیک هم‌زمان شود */
async function ensureLogin(win, password) {
	for (let attempt = 1; attempt <= 4; attempt++) {
		if (!(await isLoginScreen(win))) return `already-in-${attempt}`;
		const user = await selectLoginUser(win);
		const result = await submitLogin(win, password);
		console.log('  login attempt', attempt, user, result);
		if (!(await isLoginScreen(win))) return 'ok';
	}
	return 'failed';
}

process.on('unhandledRejection', (error) => {
	console.error('UNHANDLED', error);
	app.exit(1);
});

app.whenReady().then(async () => {
	console.log('boot');
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hesab-shots-'));
	app.setPath('userData', path.join(tmp, 'profile'));
	fs.mkdirSync(OUT, { recursive: true });
	db.init(path.join(tmp, 'shots.db'));
	console.log('db ready', tmp);

	protocol.handle('app', async (request) => {
		const url = new URL(request.url);
		let target = decodeURIComponent(url.pathname);
		if (target === '/' || target === '') target = '/index.html';
		let file = path.join(DIST, target);
		if (!path.extname(file)) file = path.join(DIST, '200.html');
		if (!fs.existsSync(file)) file = path.join(DIST, '200.html');
		return net.fetch(pathToFileURL(file).toString());
	});

	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		useContentSize: true,
		show: true,
		backgroundColor: '#f6f7f9',
		webPreferences: {
			preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});

	await win.loadURL('app://bundle/');
	await sleep(1800);
	console.log('loaded');

	/* ------------------ راه‌اندازی اولیه (بار اول) ------------------ */
	await run(
		win,
		`(() => {
			const name = document.querySelector('#setup-name');
			name.value = 'سوپرمارکت حساب‌یار';
			name.dispatchEvent(new Event('input', { bubbles: true }));
			return true;
		})()`
	);
	await shot(win, '01-setup');

	await run(
		win,
		`(() => {
			[...document.querySelectorAll('button')].find((b) => b.textContent.includes('ادامه')).click();
			return true;
		})()`
	);
	await sleep(600);
	await run(
		win,
		`(() => {
			const set = (selector, value) => {
				const el = document.querySelector(selector);
				el.value = value;
				el.dispatchEvent(new Event('input', { bubbles: true }));
			};
			set('#setup-pass', '${PASSWORD}');
			set('#setup-pass2', '${PASSWORD}');
			[...document.querySelectorAll('button')].find((b) => b.textContent.includes('شروع کار')).click();
			return true;
		})()`
	);
	await sleep(1600);

	/* --------------------- داده نمایشی + بازخوانی --------------------- */
	AUTH.logout();
	seedDemo();
	await win.reload();
	await sleep(1600);

	// پس از خروج، نشست پاک شده است؛ ورود دوباره از فهرست کشویی
	await sleep(1200);
	console.log('login:', await ensureLogin(win, PASSWORD));
	if (await isLoginScreen(win)) throw new Error('ورود به برنامه انجام نشد');

	await shot(win, '03-dashboard');

	/* ----------------------------- فروش ----------------------------- */
	await goto(win, '/pos');
	// دستهٔ «همه» تا شبکه کالاها پر شود
	await run(
		win,
		`(() => {
			const chip = [...document.querySelectorAll('button.chip')].find((b) => b.textContent.trim() === 'همه');
			if (chip) chip.click();
			return Boolean(chip);
		})()`
	);
	await sleep(900);
	await run(
		win,
		`(() => {
			const cards = [...document.querySelectorAll('button.product-card')];
			[0, 2, 5, 7].forEach((i) => cards[i] && cards[i].click());
			return cards.length;
		})()`
	);
	await sleep(900);
	await shot(win, '04-pos');

	await run(
		win,
		`(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('پرداخت و ثبت فاکتور'));
			if (btn) btn.click();
			return Boolean(btn);
		})()`
	);
	await sleep(1000);

	// تسویه ترکیبی: یک ردیف کارتخوان + یک ردیف نقد
	try {
		await run(
			win,
			`(() => {
				const add = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('افزودن ردیف پرداخت'));
				if (add) add.click();
				return true;
			})()`
		);
		await sleep(500);
		const split = await run(
			win,
			`(() => {
				const modal = document.querySelector('.fixed.inset-0');
				if (!modal) return 'no-modal';
				const selects = [...modal.querySelectorAll('select.input')];
				const amounts = [...modal.querySelectorAll('input.input')];
				if (selects.length < 4 || amounts.length < 2) return 'not-ready:' + selects.length + '/' + amounts.length;
				const method = selects[0];
				const treasury = selects[1];
				method.value = 'terminal';
				method.dispatchEvent(new Event('change', { bubbles: true }));
				const card = [...treasury.options].find((o) => o.textContent.includes('سامان'));
				if (card) {
					treasury.value = card.value;
					treasury.dispatchEvent(new Event('change', { bubbles: true }));
				}
				const setNum = (el, value) => {
					el.value = String(value);
					el.dispatchEvent(new Event('input', { bubbles: true }));
				};
				setNum(amounts[0], 150000);
				setNum(amounts[1], 109000);
				return 'ok';
			})()`
		);
		console.log('  split payment', split);
		await sleep(600);
	} catch (error) {
		console.log('  split payment skipped', error.message);
	}
	await shot(win, '05-payment');

	/* ------------------- سند دستی با یک نمونه پر شده ------------------- */
	const accounts = db
		.get()
		.prepare("SELECT id, code FROM accounts WHERE code IN ('1020','4900') ORDER BY code")
		.all();
	await goto(win, '/journal');
	const journalFilled = await run(
		win,
		`(() => {
			const rows = [...document.querySelectorAll('tbody tr')].slice(0, 2);
			if (rows.length < 2) return 'no-rows';
			const setSelect = (row, value) => {
				const select = row.querySelector('select');
				select.value = String(value);
				select.dispatchEvent(new Event('change', { bubbles: true }));
			};
			const setInput = (el, value) => {
				el.value = String(value);
				el.dispatchEvent(new Event('input', { bubbles: true }));
			};
			setSelect(rows[0], ${accounts[0].id});
			setSelect(rows[1], ${accounts[1].id});
			const inputs0 = rows[0].querySelectorAll('input');
			const inputs1 = rows[1].querySelectorAll('input');
			setInput(inputs0[inputs0.length - 2], '1850000');
			setInput(inputs1[inputs1.length - 1], '1850000');
			const desc = document.querySelector('#jv-desc');
			if (desc) {
				desc.value = 'واریز سود سپرده بانکی';
				desc.dispatchEvent(new Event('input', { bubbles: true }));
			}
			return 'ok';
		})()`
	);
	console.log('  journal form', journalFilled);
	await sleep(700);
	await shot(win, '12-journal');

	/* ---------------------------- بقیه صفحات ---------------------------- */
	for (const [route, name] of [
		['/invoices', '06-invoices'],
		['/purchases', '07-purchases'],
		['/returns', '08-returns'],
		['/products', '09-products'],
		['/parties', '10-parties'],
		['/treasury', '11-treasury'],
		['/opening', '13-opening'],
		['/reports', '14-reports']
	]) {
		await goto(win, route);
		await shot(win, name);
	}

	await goto(win, '/settings');
	await shot(win, '15-settings');

	/* -------------------------- صفحه ورود -------------------------- */
	await run(
		win,
		`(() => { document.querySelector('button[aria-label="بستن"]')?.click(); return true; })()`
	);
	await sleep(400);
	await goto(win, '/');
	await run(
		win,
		`(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.title === 'خروج از حساب');
			if (btn) btn.click();
			return Boolean(btn);
		})()`
	);
	await sleep(1600);
	// کاربر مدیر را در فهرست انتخاب می‌کنیم تا تصویر ورود گویا باشد
	await selectLoginUser(win);
	await shot(win, '02-login');

	app.exit(0);
});
