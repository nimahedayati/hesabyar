<script>
	/**
	 * ورودی تاریخ شمسی. مقدار خروجی همیشه ISO میلادی است (برای ذخیره در پایگاه داده)
	 * ولی کاربر تاریخ شمسی را با ارقام فارسی می‌بیند و تایپ می‌کند.
	 */
	import { jalaliInputText, parseJalaliInput } from '$lib/jalali.js';

	// بدون مقدار پیش‌فرض تا اتصال به مقدار undefined خطا ندهد (Svelte 5)
	let { id = '', value = $bindable(), class: cls = '', placeholder = '۱۴۰۵/۰۸/۳۰', disabled = false } = $props();

	let text = $state('');
	let invalid = $state(false);
	let focused = $state(false);

	// هر بار مقدار از بیرون عوض شود، متن نمایشی هم به‌روز می‌شود
	$effect(() => {
		if (focused) return;
		text = jalaliInputText(value);
		invalid = false;
	});

	function handleInput(event) {
		text = event.currentTarget.value;
		if (!text.trim()) {
			invalid = false;
			return;
		}
		const iso = parseJalaliInput(text);
		invalid = !iso;
		if (iso) value = iso;
	}

	function handleFocus(event) {
		focused = true;
		event.currentTarget.select();
	}

	function handleBlur() {
		focused = false;
		text = jalaliInputText(value);
		invalid = false;
	}

	/** تغییر روز با کلیدهای بالا/پایین */
	function step(days) {
		const iso = parseJalaliInput(text) || value;
		if (!iso) return;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- شیء محلی و غیرواکنشی است
		const date = new Date(`${iso}T00:00:00Z`);
		date.setUTCDate(date.getUTCDate() + days);
		const next = date.toISOString().slice(0, 10);
		value = next;
		text = jalaliInputText(next);
		invalid = false;
	}

	function handleKeydown(event) {
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			step(1);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			step(-1);
		} else if (event.key === 'Enter') {
			event.currentTarget.blur();
		}
	}
</script>

<div class="relative">
	<input
		{id}
		{disabled}
		{placeholder}
		class="input num !pr-9 {cls} {invalid ? '!border-neg !ring-2 !ring-neg/15' : ''}"
		value={text}
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		onkeydown={handleKeydown}
		inputmode="numeric"
		autocomplete="off"
		aria-invalid={invalid}
		title="تاریخ شمسی — با کلیدهای بالا/پایین یک روز جابه‌جا می‌شود"
	/>
	<span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
			<rect x="3" y="5" width="18" height="16" rx="2.5" />
			<path d="M3 10h18M8 3v4M16 3v4" />
		</svg>
	</span>
</div>
