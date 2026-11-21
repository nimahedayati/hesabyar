const { app, BrowserWindow, ipcMain, protocol, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const db = require('./db/index.cjs');
const api = require('./services/api.cjs');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, '..', 'build');

protocol.registerSchemesAsPrivileged([
	{
		scheme: 'app',
		privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
	}
]);

let win = null;

function createWindow() {
	win = new BrowserWindow({
		width: 1500,
		height: 950,
		minWidth: 1180,
		minHeight: 720,
		show: false,
		backgroundColor: '#f6f7f9',
		autoHideMenuBar: true,
		title: 'حساب‌یار',
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			spellcheck: false
		}
	});

	win.once('ready-to-show', () => win.show());

	if (isDev) {
		win.loadURL(process.env.VITE_DEV_SERVER_URL);
		win.webContents.openDevTools({ mode: 'detach' });
	} else {
		win.loadURL('app://bundle/');
	}

	win.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: 'deny' };
	});
}

/** نوع محتوا بر اساس پسوند فایل */
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.txt': 'text/plain; charset=utf-8'
};

function registerProtocol() {
	// فایل‌ها از داخل app.asar خوانده می‌شوند؛ net.fetch با مسیر asar کار نمی‌کند
	protocol.handle('app', async (request) => {
		const url = new URL(request.url);
		let p = decodeURIComponent(url.pathname);
		if (p === '/' || p === '') p = '/index.html';

		let file = path.join(DIST, p);
		// مسیرهای بدون پسوند → پوسته SPA (مسیریابی سمت کلاینت)
		if (!path.extname(file)) file = path.join(DIST, '200.html');
		if (!fs.existsSync(file)) file = path.join(DIST, '200.html');

		try {
			const body = fs.readFileSync(file);
			const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
			return new Response(body, { status: 200, headers: { 'content-type': type } });
		} catch {
			return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
		}
	});
}

app.whenReady().then(() => {
	const dataDir = app.getPath('userData');
	db.init(path.join(dataDir, 'hesabyar.db'));
	registerProtocol();
	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

/* ------------------------------- IPC ------------------------------- */

ipcMain.handle('api', async (_event, method, payload) => {
	try {
		const data = api.call(method, payload || {});
		return { ok: true, data };
	} catch (err) {
		return { ok: false, error: err?.message || String(err) };
	}
});

ipcMain.handle('app:info', () => ({
	version: app.getVersion(),
	userData: app.getPath('userData'),
	platform: process.platform
}));

ipcMain.handle('app:backup', async () => {
	const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
	const { canceled, filePath } = await dialog.showSaveDialog(win, {
		title: 'پشتیبان‌گیری از اطلاعات',
		defaultPath: `hesabyar-backup-${stamp}.db`,
		filters: [{ name: 'پایگاه داده', extensions: ['db'] }]
	});
	if (canceled || !filePath) return { ok: false };

	const src = path.join(app.getPath('userData'), 'hesabyar.db');
	db.get().pragma('wal_checkpoint(TRUNCATE)');
	fs.copyFileSync(src, filePath);
	const { size } = fs.statSync(filePath);
	return { ok: true, path: filePath, size };
});
