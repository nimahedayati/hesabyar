<script>
	let { name = 'box', size = 18, stroke = 1.7, class: cls = '' } = $props();

	const P = {
		dashboard:
			'<rect x="3" y="3" width="7.5" height="9" rx="2"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="2"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2"/><rect x="3" y="15" width="7.5" height="6" rx="2"/>',
		cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.3 11.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6"/>',
		box: '<path d="M21 8.2v7.6a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4a2 2 0 0 1-1-1.7V8.2a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4a2 2 0 0 1 1 1.7z"/><path d="M3.3 7.2 12 12l8.7-4.8M12 22V12"/>',
		users: '<path d="M16 21v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V21"/><circle cx="9" cy="7.5" r="3.6"/><path d="M22 21v-1.6a4 4 0 0 0-3-3.8"/><path d="M16.5 4.1a3.6 3.6 0 0 1 0 6.9"/>',
		receipt:
			'<path d="M5 3h14v18l-2.4-1.6-2.4 1.6-2.4-1.6L9.4 21 7 19.4 5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
		warehouse: '<path d="M3 21V9.5L12 4l9 5.5V21"/><path d="M7.5 21v-6h9v6"/><path d="M3 21h18"/>',
		bank: '<path d="M3 10h18"/><path d="M5 10V21M9.7 10V21M14.3 10V21M19 10V21"/><path d="M2.5 21h19"/><path d="M12 3 3 8.5h18L12 3z"/>',
		check: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m7.5 12 2.8 2.8L16.5 8.6"/>',
		chart: '<path d="M3 21h18"/><rect x="4.5" y="12" width="3.4" height="6" rx="1"/><rect x="10.3" y="7" width="3.4" height="11" rx="1"/><rect x="16.1" y="3.5" width="3.4" height="14.5" rx="1"/>',
		settings:
			'<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		minus: '<path d="M5 12h14"/>',
		search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
		trash: '<path d="M3.5 6.5h17"/><path d="M8.5 6.5V4.8A1.8 1.8 0 0 1 10.3 3h3.4a1.8 1.8 0 0 1 1.8 1.8v1.7"/><path d="M18.5 6.5 17.7 19a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 6.5"/><path d="M10 11v5M14 11v5"/>',
		edit: '<path d="M4 20h4l10.5-10.5a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6V20z"/><path d="m14.5 7.5 3 3"/>',
		x: '<path d="M6 6l12 12M18 6 6 18"/>',
		chevron: '<path d="m9 5 7 7-7 7"/>',
		chevronDown: '<path d="m5 9 7 7 7-7"/>',
		printer:
			'<path d="M7 8V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V8"/><rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 16h10v5H7z"/>',
		refresh: '<path d="M20.5 11a8.5 8.5 0 1 0-2 6.4"/><path d="M20.5 4.5V11H14"/>',
		alert: '<path d="M12 3.5 2.8 20h18.4L12 3.5z"/><path d="M12 9.5v4.2M12 17h.01"/>',
		arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
		arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
		barcode: '<path d="M3 5v14M6.5 5v14M10 5v10M13.5 5v14M17 5v10M20.5 5v14"/>',
		save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8.5 3v6h7V3"/><path d="M8.5 14h7v7h-7z"/>',
		creditCard:
			'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6.5 15h3"/>',
		wallet: '<path d="M20 8V6.5A2.5 2.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h15a1.5 1.5 0 0 1 1.5 1.5v9A2.5 2.5 0 0 1 19 21H5a2.5 2.5 0 0 1-2.5-2.5v-13"/><circle cx="16.5" cy="14.5" r="1.2"/>',
		arrows: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
		clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
		file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
		more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
		download: '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
		filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
		calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
		trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
		scan: '<path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"/><path d="M3 12h18"/>',
		logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
		checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.8 2.8L16.5 9"/>',
		phone: '<path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 18.6 18.6 0 0 1-5.7-5.7 19 19 0 0 1-3-8.4A2 2 0 0 1 3.8 2h2.6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.5 9.7a15 15 0 0 0 5.7 5.7l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2z"/>',
		layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
		truck: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h8A1.5 1.5 0 0 1 14 7.5V17H3z"/><path d="M14 10h3.6a2 2 0 0 1 1.7 1l1.7 2.7V17h-7"/><circle cx="7" cy="18.5" r="1.8"/><circle cx="17.5" cy="18.5" r="1.8"/>',
		undo: '<path d="M3.5 8.5h11a5.5 5.5 0 0 1 0 11H9"/><path d="M7 4 3.5 8.5 7 13"/>',
		lock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M7.8 10.5V7.6a4.2 4.2 0 0 1 8.4 0v2.9"/><path d="M12 15v2"/>',
		eye: '<path d="M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12 17.9 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
		eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c5.9 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7"/><path d="M6.4 8.1A17.6 17.6 0 0 0 2.5 12s3.6 6.5 9.5 6.5a9.9 9.9 0 0 0 4.1-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
		user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
		keyboard:
			'<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M6.5 14h.01M17 14h.01M9 14h6"/>',
		star: '<path d="m12 3.6 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.6l-5.4 2.9 1-6.1L3.2 10.1l6.1-.9z"/>'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={cls}
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- مسیرهای SVG ثابت و داخلی‌اند، ورودی کاربر نیست -->
	{@html P[name] || P.box}
</svg>
