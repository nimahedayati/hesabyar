<script>
	import { fmt, parseNum } from '$lib/format.js';

	// بدون مقدار پیش‌فرض تا اتصال به مقدار undefined خطا ندهد (Svelte 5)
	let { value = $bindable(), class: cls = 'input', placeholder = '۰', disabled = false, align = 'right', onchange = null, ...rest } = $props();

	let text = $state(fmt(value ?? 0));
	let focused = $state(false);

	// وقتی مقدار از بیرون تغییر کند (و کاربر در حال تایپ نیست) قالب‌بندی می‌شود
	$effect(() => {
		const v = Number(value) || 0;
		if (!focused && parseNum(text) !== v) text = fmt(v);
	});

	function onInput(e) {
		const v = parseNum(e.target.value);
		value = v;
		text = fmt(v);
		onchange?.(v);
	}
</script>

<input
	{...rest}
	{disabled}
	{placeholder}
	class="{cls} {align === 'left' ? '!text-left' : ''}"
	value={text}
	oninput={onInput}
	onfocus={() => (focused = true)}
	onblur={() => {
		focused = false;
		text = fmt(Number(value) || 0);
	}}
	inputmode="numeric"
	autocomplete="off"
/>
