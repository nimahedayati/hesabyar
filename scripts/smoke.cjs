/*
 * تست دودی رابط کاربری — بدون اسکرین‌شات.
 * راه‌اندازی اولیه، ورود مدیر و صندوق‌دار از فهرست کشویی، همه مسیرها،
 * ثبت واقعی «سند دستی» و «موجودی اولیه»، و منطقه خطر (حذف با پشتیبان اجباری).
 */
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

app.setName('Hesabyar');
app.disableHardwareAcceleration();

const DIST = path.join(__dirname, '..', 'build');
const PASSWORD = '1234';
const ROUTES = [
	['/', 'داشبورد'],
	['/pos', 'فاکتور جاری'],
	['/purchases', 'فاکتور خرید'],
	['/returns', 'برگشت از فروش'],
	['/invoices', 'اسناد'],
	['/products', 'کالاها'],
	['/parties', 'اشخاص'],
	['/treasury', 'خزانه'],
	['/journal', 'ردیف‌های سند'],
	['/opening', 'موجودی اولیه'],
	['/reports', 'گزارش'],
	['/settings', 'تنظیمات']
];

const log = [];
const ok = (name, cond, extra = '') => {
	const line = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`;
	log.push(line);
	console.log(line);
	if (!cond) process.exitCode = 1;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

protocol.registerSchemesAsPrivileged([
	{
		scheme: 'app',
		privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
	}
]);

const db = require('../electron/db/index.cjs');
const api = require('../electron/services/api.cjs');

ipcMain.handle('api', async (_e, method, payload) => {
	try {
		return { ok: true, data: api.call(method, payload || {}) };
	} catch (error) {
		return { ok: false, error: error.message };
	}
});
ipcMain.handle('app:info', () => ({ version: '0.1.0' }));

let backupTarget = null;
ipcMain.handle('app:backup', () => {
	// در تست، پنجره دیالوگ باز نمی‌شود؛ یک کپی واقعی از پایگاه داده ساخته می‌شود
	db.get().pragma('wal_checkpoint(TRUNCATE)');
	fs.copyFileSync(db.get().name, backupTarget);
	return { ok: true, path: backupTarget, size: fs.statSync(backupTarget).size };
});

const consoleErrors = [];
const consoleWarnings = [];

async function goto(win, route) {
	await win.webContents.executeJavaScript(`
		(() => {
			const link = document.querySelector('a[href="${route}"]');
			if (link) { link.click(); return true; }
			location.href = '${route}';
			return false;
		})()
	`);
	await sleep(900);
}

const text = (win) => win.webContents.executeJavaScript('document.body.innerText');
const countOf = (table) => db.get().prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;

async function logout(win) {
	await win.webContents.executeJavaScript(`
		(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.title === 'خروج از حساب');
			if (btn) btn.click();
			return Boolean(btn);
		})()
	`);
	await sleep(1300);
}

app.whenReady()
	.then(async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hesab-smoke-'));
		// پروفایل موقت: قفل شدن کش Electron بین اجراها نتیجه تست را خراب می‌کند
		app.setPath('userData', path.join(dir, 'profile'));
		db.init(path.join(dir, 'ui.db'));
		backupTarget = path.join(dir, 'ui-backup.db');

		protocol.handle('app', async (request) => {
			const url = new URL(request.url);
			let p = decodeURIComponent(url.pathname);
			if (p === '/' || p === '') p = '/index.html';
			let file = path.join(DIST, p);
			if (!path.extname(file)) file = path.join(DIST, '200.html');
			if (!fs.existsSync(file)) file = path.join(DIST, '200.html');
			return net.fetch(pathToFileURL(file).toString());
		});

		const win = new BrowserWindow({
			width: 1500,
			height: 950,
			show: false,
			webPreferences: {
				preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
				contextIsolation: true,
				nodeIntegration: false
			}
		});

		win.webContents.on('console-message', (_event, level, message) => {
			const value = String(message);
			if (level === 3) consoleErrors.push(value);
			else if (level === 2) consoleWarnings.push(value);
		});
		win.webContents.on('render-process-gone', (_e, details) =>
			consoleErrors.push(`render-process-gone: ${details.reason}`)
		);

		await win.loadURL('app://bundle/');
		await sleep(1600);

		// ---- راه‌اندازی اولیه (بار اول): اطلاعات کسب‌وکار + رمز مدیر
		ok('بار اول صفحه راه‌اندازی نمایش داده می‌شود', (await text(win)).includes('خوش آمدید'));

		await win.webContents.executeJavaScript(`
		(() => {
			const name = document.querySelector('#setup-name');
			name.value = 'سوپرمارکت آزمون';
			name.dispatchEvent(new Event('input', { bubbles: true }));
			[...document.querySelectorAll('button')].find((b) => b.textContent.includes('ادامه')).click();
			return true;
		})()
	`);
		await sleep(500);
		ok('گام دوم راه‌اندازی، رمز مدیر را می‌خواهد', (await text(win)).includes('رمز ورود مدیر'));

		await win.webContents.executeJavaScript(`
		(() => {
			const set = (selector, value) => {
				const el = document.querySelector(selector);
				el.value = value;
				el.dispatchEvent(new Event('input', { bubbles: true }));
			};
			set('#setup-pass', '${PASSWORD}');
			set('#setup-pass2', '${PASSWORD}');
			[...document.querySelectorAll('button')].find((b) => b.textContent.includes('شروع کار')).click();
			return true;
		})()
	`);
		await sleep(1600);

		const afterSetup = await text(win);
		ok(
			'پس از راه‌اندازی، کاربر مدیر وارد می‌شود',
			afterSetup.includes('داشبورد'),
			afterSetup.slice(0, 40)
		);
		ok(
			'سایدبار برای مدیر نمایش داده می‌شود',
			(await win.webContents.executeJavaScript('!!document.querySelector("aside")')) === true
		);
		ok('کسب‌وکار تازه هیچ کالایی ندارد', countOf('products') === 0, String(countOf('products')));

		// ---- همه مسیرها باز می‌شوند و محتوای کلیدی دارند
		for (const [route, marker] of ROUTES) {
			await goto(win, route);
			const body = await text(win);
			ok(`مسیر ${route} رندر می‌شود`, body.includes(marker), marker);
		}

		// ---- سند دستی: پر کردن دو ردیف و ثبت
		const accounts = db.get().prepare("SELECT id FROM accounts WHERE code IN ('1010','4900')").all();
		await goto(win, '/journal');
		const filled = await win.webContents.executeJavaScript(`
		(() => {
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
			setInput(rows[0].querySelectorAll('input')[2], '250000');
			setInput(rows[1].querySelectorAll('input')[3], '250000');
			const desc = document.querySelector('#jv-desc');
			desc.value = 'سند آزمایشی رابط کاربری';
			desc.dispatchEvent(new Event('input', { bubbles: true }));
			return 'ok';
		})()
	`);
		ok('فرم سند دستی پر می‌شود', filled === 'ok', filled);
		await sleep(500);
		ok('نشانگر تراز بودن سند نمایش داده می‌شود', (await text(win)).includes('سند تراز است'));

		const submitted = await win.webContents.executeJavaScript(`
		(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('ثبت سند'));
			if (!btn || btn.disabled) return 'disabled';
			btn.click();
			return 'clicked';
		})()
	`);
		ok('دکمه ثبت سند فعال است', submitted === 'clicked', submitted);
		await sleep(1200);
		ok('سند دستی از طریق UI ثبت شد', countOf('documents') >= 1, String(countOf('documents')));
		ok(
			'سند جدید در فهرست سندهای دستی دیده می‌شود',
			(await text(win)).includes('سند آزمایشی رابط کاربری')
		);

		// ---- موجودی اولیه: یک ردیف خزانه و ثبت
		await goto(win, '/opening');
		const openingFilled = await win.webContents.executeJavaScript(`
		(() => {
			const add = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('افزودن حساب'));
			if (!add || add.disabled) return 'no-add';
			add.click();
			return 'ok';
		})()
	`);
		ok('ردیف خزانه به موجودی اولیه اضافه می‌شود', openingFilled === 'ok', openingFilled);
		await sleep(400);

		await win.webContents.executeJavaScript(`
		(() => {
			const inputs = [...document.querySelectorAll('input')];
			const amount = inputs[inputs.length - 1];
			amount.value = '1500000';
			amount.dispatchEvent(new Event('input', { bubbles: true }));
			return true;
		})()
	`);
		await sleep(400);
		ok('خلاصه موجودی اولیه مبلغ را نشان می‌دهد', /۱[٬,]?۵۰۰[٬,]?۰۰۰/.test(await text(win)));

		const openingSubmit = await win.webContents.executeJavaScript(`
		(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('ثبت موجودی اولیه'));
			if (!btn || btn.disabled) return 'disabled';
			btn.click();
			return 'clicked';
		})()
	`);
		ok('دکمه ثبت موجودی اولیه فعال است', openingSubmit === 'clicked', openingSubmit);
		await sleep(1400);
		ok('سند موجودی اولیه از طریق UI ثبت شد', countOf('documents') >= 2, String(countOf('documents')));

		// ---- کالای آزمون و موجودی آن (تا صفحه فروش داده داشته باشد)
		await win.webContents.executeJavaScript(`
		Promise.all([
			window.hesab.call('products.save', {
				name: 'شیر تست رابط', sku: 'UI-001', unit: 'عدد',
				purchasePrice: 28000, salePrice: 35000, barcodes: ['6260001']
			}),
			window.hesab.call('products.save', {
				name: 'برنج تست رابط', sku: 'UI-002', unit: 'کیلوگرم',
				purchasePrice: 120000, salePrice: 145000
			})
		])
	`);
		await win.webContents.executeJavaScript(`
		(async () => {
			const list = await window.hesab.call('products.list', { q: 'UI-00', limit: 5 });
			await window.hesab.call('docs.opening', {
				date: new Date().toISOString().slice(0, 10),
				items: list.data.rows.map((p) => ({ productId: p.id, qty: 20, unitCost: p.purchase_price }))
			});
			return list.data.total;
		})()
	`);
		await sleep(400);

		// ---- POS: افزودن کالا از جدول و کنترل تعداد
		await goto(win, '/pos');
		const defaultChip = await win.webContents.executeJavaScript(
			`JSON.stringify([...document.querySelectorAll('main button.chip.active')].map((b) => b.textContent.trim()))`
		);
		ok('پیش‌فرض صفحه فروش روی دسته «سریع» است', defaultChip.includes('سریع'), defaultChip);

		await win.webContents.executeJavaScript(`
		(() => {
			const chip = [...document.querySelectorAll('main button.chip')].find((b) => b.textContent.trim() === 'همه');
			if (chip) chip.click();
			return true;
		})()
	`);
		await sleep(700);

		const posState = await win.webContents.executeJavaScript(`
		(() => {
			const row = document.querySelector('main button.product-card');
			if (!row) return 'no-row';
			row.click();
			return 'ok';
		})()
	`);
		ok('کارت کالا در صفحه فروش کلیک‌پذیر است', posState === 'ok', posState);
		await sleep(700);
		const posText = await text(win);
		ok(
			'کالا به سبد فروش اضافه می‌شود',
			posText.includes('فاکتور جاری') && !posText.includes('سبد خالی است')
		);

		const qtyStep = await win.webContents.executeJavaScript(`
		(() => {
			const btn = [...document.querySelectorAll('button[aria-label="افزایش"]')][0];
			if (!btn) return 'no-btn';
			btn.click();
			return 'ok';
		})()
	`);
		ok('دکمه افزایش تعداد در سبد کار می‌کند', qtyStep === 'ok', qtyStep);
		await sleep(400);

		// ---- «سریع» به‌عنوان اولین دسته‌بندی (نوار جداگانه حذف شده)
		const firstChip = await win.webContents.executeJavaScript(`
		(() => {
			const chips = [...document.querySelectorAll('main button.chip')];
			return chips.length ? chips[0].textContent.trim() : 'none';
		})()
	`);
		ok('«سریع» اولین دسته‌بندی است', firstChip === 'سریع', firstChip);

		const quickClick = await win.webContents.executeJavaScript(`
		(() => {
			const chip = [...document.querySelectorAll('main button.chip')].find((b) => b.textContent.trim() === 'سریع');
			if (!chip) return 'missing';
			chip.click();
			return 'ok';
		})()
	`);
		ok('دسته «سریع» انتخاب می‌شود', quickClick === 'ok', quickClick);
		await sleep(800);
		ok(
			'با نبود کالای ستاره‌دار، پیام راهنما نمایش داده می‌شود',
			(await text(win)).includes('هنوز کالای سریعی ستاره‌دار نشده است')
		);

		await win.webContents.executeJavaScript(`
		(() => {
			const chip = [...document.querySelectorAll('main button.chip')].find((b) => b.textContent.trim() === 'همه');
			if (chip) chip.click();
			return true;
		})()
	`);
		await sleep(800);
		ok('بازگشت به «همه» فهرست کالاها را برمی‌گرداند', (await text(win)).includes('شیر تست رابط'));

		// ---- ستاره‌دار کردن یک کالا و بررسی فیلتر «سریع»
		await win.webContents.executeJavaScript(`
		(async () => {
			const list = await window.hesab.call('products.list', { q: 'UI-001', limit: 1 });
			await window.hesab.call('products.favorite', { id: list.data.rows[0].id, value: true });
			return true;
		})()
	`);
		await win.webContents.executeJavaScript(`
		(() => {
			const chip = [...document.querySelectorAll('main button.chip')].find((b) => b.textContent.trim() === 'سریع');
			if (chip) chip.click();
			return true;
		})()
	`);
		await sleep(900);
		const quickNames = await win.webContents.executeJavaScript(
			`JSON.stringify([...document.querySelectorAll('main button.product-card')].map((b) => b.textContent.trim()))`
		);
		ok(
			'دسته «سریع» فقط کالاهای ستاره‌دار را نشان می‌دهد',
			quickNames.includes('شیر تست رابط') && !quickNames.includes('برنج تست رابط'),
			quickNames
		);

		// ---- تب کاربران در تنظیمات
		await goto(win, '/settings');
		const usersTab = await win.webContents.executeJavaScript(`
		(() => {
			const tab = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'کاربران');
			if (!tab) return 'no-tab';
			tab.click();
			return 'ok';
		})()
	`);
		ok('تب کاربران در تنظیمات وجود دارد', usersTab === 'ok', usersTab);
		await sleep(700);
		ok('پنل مدیریت کاربران رندر می‌شود', (await text(win)).includes('کاربران برنامه'));

		// ---- ساخت گروه کالا و حساب از رابط کاربری (رگرسیون: خطای clone شدن Proxy)
		const openTab = async (label) => {
			const result = await win.webContents.executeJavaScript(`
			(() => {
				const tab = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '${label}');
				if (!tab) return 'no-tab';
				tab.click();
				return 'ok';
			})()
		`);
			await sleep(600);
			return result;
		};

		const clickButton = (label) =>
			win.webContents.executeJavaScript(`
			(() => {
				const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '${label}' && !b.disabled);
				if (!btn) return 'no-button';
				btn.click();
				return 'ok';
			})()
		`);

		const fill = (selector, value) =>
			win.webContents.executeJavaScript(`
			(() => {
				const el = document.querySelector('${selector}');
				if (!el) return 'no-input';
				el.value = ${JSON.stringify(value)};
				el.dispatchEvent(new Event('input', { bubbles: true }));
				return 'ok';
			})()
		`);

		const categoriesBefore = countOf('product_categories');
		ok('تب گروه کالا باز می‌شود', (await openTab('گروه کالا')) === 'ok');
		const addStep = await clickButton('گروه جدید');
		await sleep(400);
		const nameStep = await fill('#nl-name', 'گروه آزمایشی');
		await sleep(200);
		const saveStep = await clickButton('ذخیره');
		await sleep(900);
		ok(
			'گروه کالا از رابط کاربری ساخته می‌شود',
			countOf('product_categories') === categoriesBefore + 1,
			`${categoriesBefore} → ${countOf('product_categories')} · ${addStep}/${nameStep}/${saveStep}`
		);
		ok('گروه جدید در فهرست دیده می‌شود', (await text(win)).includes('گروه آزمایشی'));

		const accountsBefore = countOf('accounts');
		ok('تب حساب‌ها باز می‌شود', (await openTab('حساب‌ها')) === 'ok');
		await clickButton('حساب جدید');
		await sleep(400);
		await fill('#ac-name', 'هزینه آزمایشی');
		await fill('#ac-code', '۶۸۹۹');
		await sleep(200);
		await clickButton('ذخیره');
		await sleep(900);
		ok(
			'حساب جدید از رابط کاربری ساخته می‌شود',
			countOf('accounts') === accountsBefore + 1,
			`${accountsBefore} → ${countOf('accounts')}`
		);
		ok('حساب جدید در ساختار حساب‌ها دیده می‌شود', (await text(win)).includes('هزینه آزمایشی'));

		// ---- کارتخوان: بدون بانک متصل ساخته نمی‌شود و موجودی مستقل ندارد
		const terminalsBefore = countOf('treasuries');
		ok('تب کارتخوان باز می‌شود', (await openTab('کارتخوان')) === 'ok');
		ok('کارتخوان بدون بانک متصل هشدار می‌دهد', (await text(win)).includes('کارتخوان موجودی مستقل ندارد'));
		await clickButton('کارتخوان جدید');
		await sleep(400);
		await fill('#tr-name', 'کارتخوان بی‌بانک');
		await sleep(150);
		await clickButton('ذخیره');
		await sleep(700);
		ok('کارتخوان بدون بانک متصل ذخیره نمی‌شود', countOf('treasuries') === terminalsBefore);

		ok('تب بانک باز می‌شود', (await openTab('بانک')) === 'ok');
		await clickButton('حساب بانکی جدید');
		await sleep(400);
		await fill('#tr-name', 'بانک آزمایشی');
		await fill('#tr-bank', 'سامان');
		await sleep(150);
		await clickButton('ذخیره');
		await sleep(900);
		const bankRow = db
			.get()
			.prepare("SELECT id FROM treasuries WHERE kind='bank' ORDER BY id DESC")
			.get();
		ok('حساب بانکی از رابط کاربری ساخته می‌شود', !!bankRow, String(countOf('treasuries')));

		ok('تب کارتخوان باز می‌شود (پس از ساخت بانک)', (await openTab('کارتخوان')) === 'ok');
		await clickButton('کارتخوان جدید');
		await sleep(400);
		await fill('#tr-name', 'کارتخوان آزمایشی');
		await fill('#tr-term', 'P-TEST');
		await sleep(150);
		await clickButton('ذخیره');
		await sleep(900);
		const terminalRow = db
			.get()
			.prepare("SELECT account_id, settle_treasury_id FROM treasuries WHERE kind='terminal'")
			.get();
		ok(
			'کارتخوان از رابط کاربری ساخته می‌شود',
			!!terminalRow && countOf('treasuries') === terminalsBefore + 2,
			`${terminalsBefore} → ${countOf('treasuries')}`
		);
		ok('کارتخوان به حساب بانکی متصل می‌شود', terminalRow?.settle_treasury_id === bankRow?.id);
		ok('کارتخوان حساب دفتری نمی‌گیرد', terminalRow?.account_id === null);
		const terminalHeaders = await win.webContents.executeJavaScript(`
			(() => [...document.querySelectorAll('th')].map((th) => th.textContent.trim()))()
		`);
		ok('جدول کارتخوان ستون موجودی ندارد', !terminalHeaders.includes('موجودی'), terminalHeaders.join('|'));

		const created = await win.webContents.executeJavaScript(`
		window.hesab.call('users.create', { name: 'زهرا', role: 'cashier', password: '4321' })
			.then((res) => (res.ok ? res.data.role : 'ERR: ' + res.error))
	`);
		ok('کاربر صندوق‌دار ساخته می‌شود', created === 'cashier', String(created));

		// ---- خروج و ورود صندوق‌دار از فهرست کشویی
		await logout(win);
		ok('پس از خروج، صفحه ورود نمایش داده می‌شود', (await text(win)).includes('ورود به'));

		const options = await win.webContents.executeJavaScript(`
		JSON.stringify([...document.querySelectorAll('#login-user option')].map((o) => o.textContent.trim()))
	`);
		ok(
			'کاربران در فهرست کشویی نمایش داده می‌شوند',
			options.includes('زهرا') && options.includes('مدیر'),
			options
		);

		const picked = await win.webContents.executeJavaScript(`
		(() => {
			const select = document.querySelector('#login-user');
			if (!select) return 'no-select';
			const option = [...select.options].find((o) => o.textContent.includes('زهرا'));
			select.value = option.value;
			select.dispatchEvent(new Event('change', { bubbles: true }));
			return 'ok';
		})()
	`);
		ok('کاربر صندوق‌دار از فهرست انتخاب می‌شود', picked === 'ok', picked);
		await sleep(400);

		const cashierLogin = await win.webContents.executeJavaScript(`
		(() => {
			const pass = document.querySelector('#login-pass');
			if (!pass || pass.disabled) return 'locked';
			pass.value = '4321';
			pass.dispatchEvent(new Event('input', { bubbles: true }));
			const submit = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('ورود به برنامه'));
			if (!submit || submit.disabled) return 'submit-disabled';
			submit.click();
			return 'ok';
		})()
	`);
		ok('ورود صندوق‌دار با رمز انجام می‌شود', cashierLogin === 'ok', cashierLogin);
		await sleep(1600);

		const cashierBody = await text(win);
		const hasSidebar = await win.webContents.executeJavaScript(
			'!!document.querySelector("aside nav") || !!document.querySelector(\'a[href="/products"]\')'
		);
		ok('صندوق‌دار بدون سایدبار وارد می‌شود', hasSidebar === false);
		ok(
			'صندوق‌دار مستقیم روی صفحه فروش است',
			cashierBody.includes('فاکتور جاری'),
			cashierBody.slice(0, 40)
		);

		await win.webContents.executeJavaScript("location.href = '/reports'");
		await sleep(1800);
		ok(
			'صندوق‌دار با آدرس مستقیم هم به صفحه فروش برگردانده می‌شود',
			(await text(win)).includes('فاکتور جاری')
		);

		// ---- منطقه خطر: حذف بدون پشتیبان ممکن نیست
		await logout(win);
		await win.webContents.executeJavaScript(`
		(async () => {
			const state = await window.hesab.call('auth.state');
			const admin = state.data.users.find((u) => u.role === 'admin');
			await window.hesab.call('auth.login', { userId: admin.id, password: '${PASSWORD}' });
			location.reload();
			return true;
		})()
	`);
		await sleep(2200);
		await goto(win, '/settings');
		await win.webContents.executeJavaScript(`
		(() => {
			const tab = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'داده‌ها');
			if (tab) tab.click();
			return Boolean(tab);
		})()
	`);
		await sleep(700);

		const beforeBackup = await win.webContents.executeJavaScript(`
		(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('حذف اطلاعات'));
			return btn ? String(btn.disabled) : 'missing';
		})()
	`);
		ok('پیش از پشتیبان‌گیری، دکمه حذف غیرفعال است', beforeBackup === 'true', beforeBackup);

		await win.webContents.executeJavaScript(`
		(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('گرفتن نسخه پشتیبان'));
			if (btn) btn.click();
			return Boolean(btn);
		})()
	`);
		await sleep(900);
		ok('نسخه پشتیبان از طریق UI گرفته می‌شود', fs.existsSync(backupTarget));

		const afterBackup = await win.webContents.executeJavaScript(`
		(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('حذف اطلاعات'));
			return btn ? String(btn.disabled) : 'missing';
		})()
	`);
		ok('پس از پشتیبان‌گیری، دکمه حذف فعال می‌شود', afterBackup === 'false', afterBackup);

		const docsBefore = countOf('documents');
		const productsBefore = countOf('products');
		await win.webContents.executeJavaScript(`
		(() => {
			[...document.querySelectorAll('button')].find((b) => b.textContent.includes('حذف اطلاعات')).click();
			return true;
		})()
	`);
		await sleep(500);
		const confirmDisabled = await win.webContents.executeJavaScript(`
		(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('تأیید و حذف'));
			return btn ? String(btn.disabled) : 'missing';
		})()
	`);
		ok('دکمه تأیید نهایی تا تایپ «حذف» غیرفعال است', confirmDisabled === 'true', confirmDisabled);

		await win.webContents.executeJavaScript(`
		(() => {
			const input = document.querySelector('#wipe-confirm');
			input.value = 'حذف';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			return true;
		})()
	`);
		await sleep(400);
		await win.webContents.executeJavaScript(`
		(() => {
			const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('تأیید و حذف'));
			if (btn && !btn.disabled) btn.click();
			return btn ? String(btn.disabled) : 'missing';
		})()
	`);
		await sleep(1600);
		ok(
			'حذف اطلاعات از UI انجام می‌شود',
			docsBefore > 0 && countOf('documents') === 0,
			`${docsBefore} → ${countOf('documents')}`
		);
		ok(
			'کالاها پس از «حذف اطلاعات» باقی می‌مانند',
			countOf('products') === productsBefore,
			String(countOf('products'))
		);

		// ---- خطاهای کنسول
		const noisy = consoleErrors.filter(
			(message) => !/DevTools|Autofill|Electron Security/i.test(message)
		);
		ok('بدون خطای کنسول', noisy.length === 0, noisy.slice(0, 3).join(' | '));

		const uniqueWarnings = [...new Set(consoleWarnings)];
		if (uniqueWarnings.length) {
			console.log('\n--- هشدارهای کنسول ---');
			uniqueWarnings.forEach((message) => console.log('WARN ' + message.slice(0, 200)));
		}
		console.log(`\n${log.filter((l) => l.startsWith('PASS')).length}/${log.length} بررسی موفق`);
		app.exit(process.exitCode || 0);
	})
	.catch((error) => {
		console.log('\nFATAL: ' + (error?.stack || error));
		app.exit(1);
	});
