let seq = 0;
export const ui = $state({
	toasts: [],
	busy: false
});

export function toast(message, type = 'ok', ms = 3200) {
	const id = ++seq;
	ui.toasts = [...ui.toasts, { id, message, type }];
	setTimeout(() => {
		ui.toasts = ui.toasts.filter((t) => t.id !== id);
	}, ms);
}

export function dismiss(id) {
	ui.toasts = ui.toasts.filter((t) => t.id !== id);
}
