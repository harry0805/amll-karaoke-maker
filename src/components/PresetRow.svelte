<script lang="ts">
  import { tick } from 'svelte';
  import type { Preset } from '../presets';
  import Icon from './Icon.svelte';
  let {
    preset,
    busy,
    onrename,
    onupdate,
    onexport,
    ondelete,
  }: {
    preset: Preset;
    busy: boolean;
    onrename: (name: string) => boolean;
    onupdate: () => void;
    onexport: () => void;
    ondelete: () => void;
  } = $props();
  let editing = $state(false);
  let name = $state('');
  let field = $state<HTMLInputElement>();
  let renameButton: HTMLButtonElement;
  let heading: HTMLDivElement;
  let headingHeight = $state(28);
  async function rename() {
    headingHeight = heading.getBoundingClientRect().height;
    name = preset.name;
    editing = true;
    await tick();
    field?.focus();
    field?.select();
  }
  async function finish(save: boolean) {
    if (save && (busy || !onrename(name))) return;
    editing = false;
    await tick();
    renameButton.focus();
  }
</script>

<div
  class="preset-library-item rounded-lg border border-solid border-[#35353e] p-[13px] max-[401px]:p-2.5"
>
  <div class="flex min-h-6 items-center justify-between gap-3" bind:this={heading}>
    {#if editing}
      <input
        class="preset-inline-name block w-full min-w-0 rounded border border-solid border-accent-border bg-field px-[5px] py-0 text-[14px] text-foreground outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
        bind:this={field}
        bind:value={name}
        maxlength="80"
        disabled={busy}
        style:height={`${headingHeight}px`}
        aria-label={`New name for ${preset.name}`}
        onkeydown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            void finish(event.key === 'Enter');
          }
        }}
      />
    {:else}
      <strong class="min-w-0 flex-1 text-[14px] leading-6 font-[550] [overflow-wrap:anywhere]"
        >{preset.name}</strong
      >
    {/if}
    <button
      class="grid size-7 flex-none cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent p-[5px] text-[#b5b5c0] outline-offset-[5px] hover:bg-accent-muted hover:text-accent-text focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid disabled:cursor-default disabled:opacity-35 [&>svg]:size-3.5"
      hidden={editing}
      bind:this={renameButton}
      title="Rename preset"
      aria-label={`Rename ${preset.name}`}
      disabled={busy}
      onclick={rename}><Icon name="pencil" /></button
    >
  </div>
  <div class="-mx-[5px] mt-2.5 -mb-1 flex flex-nowrap gap-1 max-[401px]:gap-0.5 [&_svg]:size-3.5">
    {#if editing}
      <button
        class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border-0 bg-transparent px-[7px] py-[5px] text-[12px] whitespace-nowrap text-[#b5b5c0] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:bg-accent-muted enabled:hover:text-accent-text disabled:cursor-default disabled:opacity-35 max-[401px]:gap-1 max-[401px]:px-1"
        disabled={busy}
        onclick={() => finish(true)}><Icon name="check" />Save name</button
      >
      <button
        class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border-0 bg-transparent px-[7px] py-[5px] text-[12px] whitespace-nowrap text-[#b5b5c0] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:bg-accent-muted enabled:hover:text-accent-text disabled:cursor-default disabled:opacity-35 max-[401px]:gap-1 max-[401px]:px-1"
        disabled={busy}
        onclick={() => finish(false)}><Icon name="x" />Cancel</button
      >
    {:else}
      <button
        class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border-0 bg-transparent px-[7px] py-[5px] text-[12px] whitespace-nowrap text-[#b5b5c0] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:bg-accent-muted enabled:hover:text-accent-text disabled:cursor-default disabled:opacity-35 max-[401px]:gap-1 max-[401px]:px-1"
        aria-label={`Update ${preset.name}`}
        disabled={busy}
        onclick={onupdate}><Icon name="save" />Update</button
      >
      <button
        class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border-0 bg-transparent px-[7px] py-[5px] text-[12px] whitespace-nowrap text-[#b5b5c0] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:bg-accent-muted enabled:hover:text-accent-text disabled:cursor-default disabled:opacity-35 max-[401px]:gap-1 max-[401px]:px-1"
        aria-label={`Export ${preset.name}`}
        disabled={busy}
        onclick={onexport}><Icon name="download" />Export</button
      >
      <button
        class="ml-auto inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border-0 bg-transparent px-[7px] py-[5px] text-[12px] whitespace-nowrap text-[#d99a97] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:bg-accent-muted enabled:hover:text-accent-text disabled:cursor-default disabled:opacity-35 max-[401px]:gap-1 max-[401px]:px-1"
        aria-label={`Delete ${preset.name}`}
        disabled={busy}
        onclick={ondelete}><Icon name="trash-2" />Delete</button
      >
    {/if}
  </div>
</div>
