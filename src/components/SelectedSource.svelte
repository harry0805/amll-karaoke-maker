<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    id,
    nameId,
    removeId,
    label,
    name,
    icon,
    removeLabel,
    disabled,
    onremove,
  }: {
    id: string;
    nameId: string;
    removeId: string;
    label: string;
    name: string;
    icon: 'video' | 'file-music';
    removeLabel: string;
    disabled: boolean;
    onremove: () => void;
  } = $props();
</script>

<div
  {id}
  class="flex items-center gap-3 rounded-lg border border-solid border-accent-border bg-panel p-3.5"
  role="group"
  aria-label={label}
>
  <div class="min-w-0 flex-1">
    <span class="flex items-center gap-2.5 text-[14px] font-medium [&>svg]:text-accent-text">
      <Icon name={icon} />{label}
    </span>
    <p id={nameId} class="mt-[9px] mb-0 truncate text-[14px] text-[#ababba]" title={name}>{name}</p>
  </div>
  <button
    id={removeId}
    type="button"
    class="flex shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-2 text-muted outline-offset-2 hover:bg-control hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-35"
    aria-label={removeLabel}
    title={removeLabel}
    {disabled}
    onclick={onremove}><Icon name="x" /></button
  >
</div>
