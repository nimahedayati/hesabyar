const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hesab', {
	call: (method, payload) => ipcRenderer.invoke('api', method, payload),
	info: () => ipcRenderer.invoke('app:info'),
	backup: () => ipcRenderer.invoke('app:backup')
});
