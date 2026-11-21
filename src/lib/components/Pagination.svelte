<script>
	import Icon from './Icon.svelte';
	import { fmt } from '$lib/format.js';

	let { page = 1, pages = 1, total = 0, pageSize = 25, onchange = () => {} } = $props();

	const first = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
	const last = $derived(Math.min(page * pageSize, total));

	function go(target) {
		if (target < 1 || target > pages || target === page) return;
		onchange(target);
	}
</script>

<div class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
	<span class="text-[11.5px] text-muted">
		{fmt(first)} تا {fmt(last)} از {fmt(total)} مورد
	</span>
	<div class="flex items-center gap-1">
		<button class="btn btn-soft btn-sm !px-2" onclick={() => go(page - 1)} disabled={page <= 1} aria-label="قبلی">
			<Icon name="chevron" size={13} class="rotate-180" />
		</button>
		<span class="px-1 text-[11.5px] text-ink2">صفحه {fmt(page)} از {fmt(pages)}</span>
		<button class="btn btn-soft btn-sm !px-2" onclick={() => go(page + 1)} disabled={page >= pages} aria-label="بعدی">
			<Icon name="chevron" size={13} />
		</button>
	</div>
</div>
