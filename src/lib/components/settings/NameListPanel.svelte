<script>
	import Icon from '../Icon.svelte';
	import Modal from '../Modal.svelte';
	import { toast } from '$lib/ui.svelte.js';

	let {
		title = '',
		icon = 'layers',
		items = [],
		addLabel = 'افزودن',
		placeholder = 'نام',
		onsave = async () => {},
		onremove = null
	} = $props();

	let open = $state(false);
	let form = $state({ name: '' });
	let saving = $state(false);

	function openNew() {
		form = { name: '' };
		open = true;
	}

	function openEdit(item) {
		form = { id: item.id, name: item.name };
		open = true;
	}

	async function save() {
		if (!form.name.trim()) return toast('نام را وارد کنید', 'warn');
		saving = true;
		try {
			await onsave(form);
			open = false;
		} catch (error) {
			toast(error.message, 'err');
		} finally {
			saving = false;
		}
	}
</script>

<div class="card overflow-hidden">
	<div class="flex items-center justify-between border-b border-line px-4 py-3">
		<h3 class="flex items-center gap-2 text-[13px] font-bold text-ink">
			<Icon name={icon} size={15} class="text-muted" />
			{title}
		</h3>
		<button class="btn btn-primary btn-sm" onclick={openNew}>
			<Icon name="plus" size={13} />
			{addLabel}
		</button>
	</div>

	<div class="divide-y divide-line">
		{#each items as item (item.id)}
			<div class="flex items-center justify-between px-4 py-2.5">
				<span class="text-[12.5px] text-ink">{item.name}</span>
				<div class="flex items-center gap-1">
					<button class="btn btn-soft btn-sm !px-2" onclick={() => openEdit(item)} aria-label="ویرایش">
						<Icon name="edit" size={13} />
					</button>
					{#if onremove}
						<button class="btn btn-soft btn-sm !px-2" onclick={() => onremove(item)} aria-label="حذف">
							<Icon name="trash" size={13} />
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	{#if !items.length}
		<p class="py-8 text-center text-[12px] text-muted2">موردی تعریف نشده است</p>
	{/if}
</div>

<Modal open={open} title={form.id ? 'ویرایش' : addLabel} onclose={() => (open = false)} size="sm">
	<label class="label" for="nl-name">{placeholder}</label>
	<input id="nl-name" class="input" bind:value={form.name} />

	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (open = false)}>انصراف</button>
		<button class="btn btn-primary" onclick={save} disabled={saving}>ذخیره</button>
	{/snippet}
</Modal>
