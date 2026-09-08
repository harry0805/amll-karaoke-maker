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

<div class="preset-library-item">
  <div class="preset-row-heading" bind:this={heading}>
    {#if editing}
      <input
        class="preset-inline-name"
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
      <strong>{preset.name}</strong>
    {/if}
    <button
      class="preset-rename"
      hidden={editing}
      bind:this={renameButton}
      title="Rename preset"
      aria-label={`Rename ${preset.name}`}
      disabled={busy}
      onclick={rename}><Icon name="pencil" /></button
    >
  </div>
  <div class="preset-row-actions">
    {#if editing}
      <button disabled={busy} onclick={() => finish(true)}><Icon name="check" />Save name</button>
      <button disabled={busy} onclick={() => finish(false)}><Icon name="x" />Cancel</button>
    {:else}
      <button aria-label={`Update ${preset.name}`} disabled={busy} onclick={onupdate}
        ><Icon name="save" />Update</button
      >
      <button aria-label={`Export ${preset.name}`} disabled={busy} onclick={onexport}
        ><Icon name="download" />Export</button
      >
      <button
        class="preset-delete-action"
        aria-label={`Delete ${preset.name}`}
        disabled={busy}
        onclick={ondelete}><Icon name="trash-2" />Delete</button
      >
    {/if}
  </div>
</div>
