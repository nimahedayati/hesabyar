<script>
	/**
	 * ورودی تعداد آگاه به واحد کالا:
	 * واحد شمردنی (عدد، جفت، بسته…) فقط عدد صحیح می‌پذیرد و ممیز تایپ‌شده حذف می‌شود؛
	 * واحد وزنی (کیلوگرم، لیتر، متر…) تا سه رقم اعشار می‌پذیرد.
	 * allowZero برای ردیف‌هایی است که «صفر» معنادار است (تعداد برگشتی).
	 */
	import { allowsFraction, normalizeQty } from '$lib/domain/units.js';
	import { fmt, toLatin } from '$lib/format.js';

	let {
		value = $bindable(),
		unit = 'عدد',
		class: cls = 'input',
		placeholder = '',
		disabled = false,
		allowZero = false,
		max = null,
		onchange = null
	} = $props();

	const fractional = $derived(allowsFraction(unit));
	const floor = $derived(allowZero ? 0 : null);
	const ceiling = $derived(max === null || max === undefined || !Number.isFinite(Number(max)) ? null : Number(max));

	let text = $state('');
	let focused = $state(false);

	const decimalsOf = (n) => {
		const fixed = String(Math.round(n * 1000) / 1000);
		const dot = fixed.indexOf('.');
		return dot === -1 ? 0 : fixed.length - dot - 1;
	};

	const display = (n) => {
		const num = Number(n) || 0;
		return fractional ? fmt(num, decimalsOf(num)) : fmt(Math.round(num));
	};

	/** تعداد را با قواعد واحد و سقف مجاز (اگر تعیین شده) هماهنگ می‌کند */
	function clamp(raw) {
		const next = normalizeQty(unit, raw, floor);
		return ceiling === null ? next : Math.min(next, normalizeQty(unit, ceiling, floor));
	}

	// مقدار از بیرون عوض شود (یا واحد عوض شود) → نمایش دوباره قالب‌بندی می‌شود
	$effect(() => {
		if (focused) return;
		text = display(value);
	});

	function clean(raw) {
		const latin = toLatin(raw);
		if (fractional) {
			const onlyValid = latin.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
			return onlyValid.replace(/^(\d*\.\d{0,3}).*$/, '$1');
		}
		return latin.replace(/\D/g, '');
	}

	function handleInput(event) {
		const next = clean(event.currentTarget.value);
		text = next;
		const parsed = Number(next);
		if (next !== '' && Number.isFinite(parsed) && (parsed > 0 || (allowZero && parsed === 0))) {
			value = clamp(parsed);
			onchange?.(value);
		}
	}

	function handleBlur() {
		focused = false;
		const parsed = Number(text);
		value = clamp(text !== '' && Number.isFinite(parsed) ? parsed : allowZero ? 0 : 1);
		text = display(value);
	}
</script>

<input
	{disabled}
	class="{cls} num"
	value={text}
	{placeholder}
	oninput={handleInput}
	onfocus={(event) => {
		focused = true;
		event.currentTarget.select();
	}}
	onblur={handleBlur}
	inputmode={fractional ? 'decimal' : 'numeric'}
	autocomplete="off"
	dir="ltr"
/>
