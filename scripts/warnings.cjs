/* جمع‌آوری همه هشدارها/خطاهای زمان اجرا بدون اسکرین‌شات */
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

app.setName('Hesabyar');
app.disableHardwareAcceleration();

const DIST = path.join(__dirname, '..', 'build');
const messages = [];

protocol.registerSchemesAsPrivileged([
	{
		scheme: 'app',
		privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
	}
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ipcMain.handle('api', async (_e, method, payload) => {
	try {
		return { ok: true, data: require('../electron/services/api.cjs').call(method, payload || {}) };
	} catch (err) {
		return { ok: false, error: err?.message || String(err) };
	}
});
ipcMain.handle('app:info', () => ({ version: '0.1.0', userData: '', platform: process.platform }));

app.whenReady().then(async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hesab-warn-'));
	const db = require('../electron/db/index.cjs');
	const AUTH = require('../electron/services/auth.cjs');
	db.init(path.join(dir, 'w.db'));

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
		messages.push(`[${level}] ${String(message).split('\n')[0]}`);
	});
	win.webContents.on('preload-error', (_e, p, err) =>
		messages.push(`[preload-error] ${p}: ${err.message}`)
	);
	win.webContents.on('did-fail-load', (_e, code, desc) => messages.push(`[fail-load] ${code} ${desc}`));

	await win.loadURL('app://bundle/');
	await sleep(2000);

	// راه‌اندازی و ورود تا همه صفحات بار شوند
	try {
		AUTH.setup({ businessName: 'تست', password: '1234', passwordConfirm: '1234' });
		await win.webContents.executeJavaScript('location.reload()');
		await sleep(2500);
	} catch (e) {
		messages.push(`[setup] ${e.message}`);
	}

	const body = await win.webContents.executeJavaScript('document.body.innerText.slice(0,80)');
	console.log('BODY:', JSON.stringify(body));
	console.log('\n=== CONSOLE MESSAGES ===');
	for (const m of messages) console.log(m);
	console.log('=== END ===\n');
	app.exit(0);
});
