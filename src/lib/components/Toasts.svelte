<script>
	import { ui, dismiss } from '$lib/ui.svelte.js';
	import Icon from './Icon.svelte';
</script>

<div class="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-[min(420px,92vw)] -translate-x-1/2 flex-col gap-2">
	{#each ui.toasts as t (t.id)}
		<div
			class="pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-lg backdrop-blur rise"
			style="background:{t.type === 'err' ? '#fff5f5' : t.type === 'warn' ? '#fffaf0' : '#f3fbf6'};border-color:{t.type ===
			'err'
				? '#f3c9c9'
				: t.type === 'warn'
					? '#f0dcb8'
					: '#c6e6d3'};color:{t.type === 'err' ? '#a12c2c' : t.type === 'warn' ? '#8a5c10' : '#1a6b47'}"
		>
			<span class="mt-0.5 shrink-0">
				<Icon name={t.type === 'err' ? 'alert' : t.type === 'warn' ? 'info' : 'checkCircle'} size={16} />
			</span>
			<span class="flex-1 leading-6">{t.message}</span>
			<button class="mt-0.5 opacity-50 hover:opacity-100" onclick={() => dismiss(t.id)} aria-label="بستن">
				<Icon name="x" size={14} />
			</button>
		</div>
	{/each}
</div>
