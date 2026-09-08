<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { presetDefaults as defaults, pickPresetSettings, type PresetSettings } from '../settings';
  import {
    parseStoredPresets,
    presetLabel,
    MAX_PRESETS,
    mergePresets,
    parsePresets,
    presetName,
    serializePresets,
    type Preset,
  } from '../presets';
  import {
    PRESETS_KEY,
    restorePresetLibrary,
    persistPresetLibrary,
    restorePresetSelection,
    persistPresetSelection,
  } from '../preset-storage';
  import Icon from './Icon.svelte';
  import PresetRow from './PresetRow.svelte';

  let {
    settings,
    busy,
    active,
    onapply,
  }: {
    settings: PresetSettings;
    busy: boolean;
    active: boolean;
    onapply: (settings: PresetSettings) => void;
  } = $props();
  let presets = $state<Preset[]>([]);
  let activeId = $state('default');
  let name = $state('');
  let importing = $state(false);
  let error = $state('');
  let managerError = $state('');
  let panelOpen = $state(false);
  let panel: HTMLElement;
  let select: HTMLSelectElement;
  let switchDialog: HTMLDialogElement;
  let actionDialog: HTMLDialogElement;
  let pendingId = $state<string>();
  let action = $state<{ title: string; description: string; label: string; run: () => void }>();
  let actionError = $state('');
  let reopenManager = false;
  let libraryVersion = $state(0);
  const modified = $derived(
    presetLabel('', presets.find((p) => p.id === activeId)?.settings || defaults, settings) !== '',
  );
  const pendingName = $derived(presets.find((p) => p.id === pendingId)?.name || 'Default');

  function message(text: string) {
    if (panelOpen) managerError = text;
    else error = text;
  }
  function safely(fn: () => void) {
    try {
      fn();
      return true;
    } catch (cause) {
      message(String(cause));
      return false;
    }
  }
  function rememberSelection() {
    persistPresetSelection(activeId, sessionStorage, localStorage);
  }
  function persist(next: Preset[], id = activeId) {
    persistPresetLibrary(next, localStorage);
    presets = next;
    activeId = next.some((p) => p.id === id) ? id : 'default';
    rememberSelection();
    message('');
  }
  function apply(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (id !== 'default' && !preset)
      throw new Error('That preset is no longer available. Choose another preset.');
    activeId = id;
    onapply(pickPresetSettings(preset?.settings || defaults));
    rememberSelection();
    error = '';
  }
  function positionPanel() {
    if (!panel?.matches(':popover-open')) return;
    const sidebar = select.closest('aside')!.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 32);
    const left =
      sidebar.left >= width + 28 ? sidebar.left - width - 16 : (window.innerWidth - width) / 2;
    const top = Math.max(16, Math.min(sidebar.top + 48, window.innerHeight - 300));
    Object.assign(panel.style, {
      width: `${width}px`,
      left: `${left}px`,
      top: `${top}px`,
      maxHeight: `${Math.max(160, window.innerHeight - top - 16)}px`,
    });
  }
  async function confirm(description: string, label: string, run: () => void) {
    action = {
      title:
        label === 'Reset changes'
          ? 'Reset modified settings?'
          : label === 'Delete preset'
            ? 'Delete preset?'
            : 'Update preset?',
      description,
      label,
      run,
    };
    actionError = '';
    reopenManager = panel.matches(':popover-open');
    if (reopenManager) panel.hidePopover();
    await tick();
    actionDialog.showModal();
  }
  function closeAction() {
    if (actionDialog.open) return;
    action = undefined;
    if (reopenManager && active) panel.showPopover();
    reopenManager = false;
  }
  async function switchPreset(event: Event) {
    const target = (event.currentTarget as HTMLSelectElement).value;
    select.value = activeId;
    if (busy || target === activeId) return;
    if (!modified) {
      safely(() => apply(target));
      return;
    }
    pendingId = target;
    await tick();
    switchDialog.showModal();
  }
  function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    safely(() => {
      if (presets.length >= MAX_PRESETS) throw new Error('You can store up to 100 presets.');
      const preset = {
        id: crypto.randomUUID(),
        name: presetName(name),
        settings: pickPresetSettings(settings),
      };
      persist([...presets, preset], preset.id);
      name = '';
    });
  }
  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy || importing) return;
    importing = true;
    try {
      if (file.size > 1024 * 1024) throw new Error('Preset files must be smaller than 1 MB.');
      const incoming = parsePresets(await file.text());
      if (busy) throw new Error('Wait for the video export to finish before importing presets.');
      persist(mergePresets(presets, incoming));
    } catch (cause) {
      message(String(cause));
    } finally {
      importing = false;
    }
  }
  function exportPreset(preset: Preset) {
    safely(() => {
      const url = URL.createObjectURL(
        new Blob([serializePresets([preset])], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download =
        (preset.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'preset') + '.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      message('');
    });
  }
  function storageChanged(event: StorageEvent) {
    if (event.key !== PRESETS_KEY) return;
    if (actionDialog.open || switchDialog.open) {
      actionDialog.close();
      switchDialog.close();
      message('Presets changed in another tab. Please choose the action again.');
    }
    safely(() => {
      presets = event.newValue ? parseStoredPresets(event.newValue) : [];
      if (!presets.some((p) => p.id === activeId)) activeId = 'default';
      libraryVersion++;
    });
  }
  onMount(() => {
    try {
      presets = restorePresetLibrary(localStorage);
    } catch {
      error =
        'Saved settings could not be restored. You can still adjust settings and import presets.';
    }
    try {
      activeId = restorePresetSelection(presets, sessionStorage, localStorage);
    } catch {
      /* Presets remain usable without storage. */
    }
  });
  $effect(() => {
    if (!active && panel) panel.hidePopover();
  });
</script>

<svelte:window onstorage={storageChanged} onresize={positionPanel} onscroll={positionPanel} />
<section
  class="mb-6 border-0 border-b border-solid border-divider pb-6 last:mb-0 last:border-0 last:pb-0"
>
  <div class="flex items-center justify-between gap-3">
    <h2
      class="mt-0 mb-0 flex items-center gap-[9px] text-[16px] font-semibold [&>svg]:text-accent-text"
    >
      <Icon name="bookmark" />Preset
    </h2>
  </div>
  <select
    class="mt-3 block w-full rounded-md border border-solid border-[#39393f] bg-field p-2.5 text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
    id="preset-select"
    aria-label="Preset"
    bind:this={select}
    value={activeId}
    disabled={busy}
    onchange={switchPreset}
  >
    <option value="default"
      >{activeId === 'default' ? presetLabel('Default', defaults, settings) : 'Default'}</option
    >
    {#each presets as preset (preset.id)}<option value={preset.id}
        >{activeId === preset.id
          ? presetLabel(preset.name, preset.settings, settings)
          : preset.name}</option
      >{/each}
  </select>
  <div class="mt-2.5 flex flex-wrap gap-2 max-[381px]:flex-col">
    <button
      class="inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-solid border-accent-border bg-accent-muted px-2 py-3 text-[13px] font-medium text-accent-text outline-offset-[5px] hover:bg-accent-muted-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="preset-open"
      popovertarget="preset-panel"
      aria-controls="preset-panel"
      aria-expanded={panelOpen}><Icon name="library" /><span>Manage presets</span></button
    >
    <button
      class="inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-solid border-control-border bg-control px-2 py-3 text-[13px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border enabled:hover:bg-accent-muted enabled:hover:text-accent-text disabled:cursor-default disabled:opacity-35"
      id="preset-reset"
      type="button"
      disabled={busy || !modified}
      onclick={() => {
        const id = activeId;
        void confirm(
          `Discard your modified settings and restore the settings to "${presets.find((p) => p.id === id)?.name || 'Default'}" preset?`,
          'Reset changes',
          () => apply(id),
        );
      }}><Icon name="rotate-ccw" /><span>Reset changes</span></button
    >
  </div>
  <p
    id="preset-status"
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted empty:hidden data-[error=true]:text-error [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
    data-error={!!error}
    role="status"
    aria-live="polite"
  >
    {error}
  </p>
</section>
<div
  class="fixed inset-auto m-0 w-[min(380px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-solid border-[#3b3b43] bg-panel p-[22px] text-foreground shadow-[0_16px_60px_#0008] backdrop:bg-transparent max-[401px]:p-3.5"
  id="preset-panel"
  popover="auto"
  role="dialog"
  aria-labelledby="preset-title"
  bind:this={panel}
  ontoggle={(event) => {
    panelOpen = event.newState === 'open';
    positionPanel();
  }}
>
  <div class="mb-4 flex items-center justify-between">
    <h2 class="mt-0 mb-0 text-[18px] font-semibold" id="preset-title">Manage presets</h2>
    <button
      class="grid size-[30px] cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent p-[5px] text-[#eee] outline-offset-[5px] hover:bg-[#303038] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid disabled:cursor-default disabled:opacity-35 [&>svg]:size-5 [&>svg]:stroke-[1.6]"
      id="preset-close"
      popovertarget="preset-panel"
      popovertargetaction="hide"
      aria-label="Close presets"
      title="Close presets"><Icon name="x" /></button
    >
  </div>
  <form
    id="preset-create-form"
    class="mb-5 border-0 border-b border-solid border-[#34343c] pb-[22px]"
    onsubmit={create}
  >
    <label class="block text-[13px] leading-[1.5] text-[#b8b8c2]" for="preset-name"
      >Save current settings as a new preset</label
    >
    <div class="mt-2.5 flex gap-2">
      <input
        class="m-0 block w-full min-w-0 flex-1 rounded-md border border-solid border-[#39393f] bg-field p-2.5 text-[13px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
        id="preset-name"
        type="text"
        maxlength="80"
        placeholder="Preset name"
        autocomplete="off"
        required
        bind:value={name}
        disabled={busy}
      /><button
        class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-accent bg-accent px-[15px] py-[9px] text-[13px] text-accent-ink outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border enabled:hover:bg-accent-hover disabled:cursor-default disabled:opacity-35"
        id="preset-save"
        type="submit"
        disabled={busy || !name.trim() || presets.length >= MAX_PRESETS}
        ><Icon name="save" /><span>Save</span></button
      >
    </div>
  </form>
  <div class="mb-3 flex items-center justify-between">
    <h3 class="m-0 text-[14px]">Saved presets</h3>
    <label
      class="relative inline-flex items-center justify-center gap-[7px] overflow-hidden rounded-[7px] border border-solid border-control-border bg-transparent px-[9px] py-1.5 text-[12px] text-[#eee] focus-within:outline-2 focus-within:outline-offset-[3px] focus-within:outline-accent focus-within:outline-solid hover:not-has-[:disabled]:border-accent-border has-[:disabled]:opacity-35"
      ><Icon name="upload" />Import preset<input
        class="absolute inset-0 w-full cursor-pointer opacity-0 outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
        id="preset-import"
        type="file"
        accept=".json,application/json"
        aria-label="Import preset JSON"
        disabled={busy || importing}
        onchange={importFile}
      /></label
    >
  </div>
  <div
    class="grid max-h-none gap-2.5 overflow-y-auto p-0.5"
    id="preset-list"
    aria-label="Saved presets"
  >
    {#key libraryVersion}
      {#each presets as preset (preset.id)}
        <PresetRow
          {preset}
          {busy}
          onrename={(name) =>
            safely(() =>
              persist(
                presets.map((p) => (p.id === preset.id ? { ...p, name: presetName(name) } : p)),
              ),
            )}
          onupdate={() => {
            void confirm(
              `Replace the settings saved in "${preset.name}" with your current settings?`,
              'Update preset',
              () =>
                persist(
                  presets.map((p) =>
                    p.id === preset.id ? { ...p, settings: pickPresetSettings(settings) } : p,
                  ),
                ),
            );
          }}
          onexport={() => exportPreset(preset)}
          ondelete={() => {
            void confirm(
              `Delete "${preset.name}"? Your current settings will stay unchanged.`,
              'Delete preset',
              () => persist(presets.filter((p) => p.id !== preset.id)),
            );
          }}
        />
      {:else}
        <div class="rounded-lg border border-dashed border-[#3b3b43] px-[18px] py-6 text-center">
          <strong class="text-[14px] font-medium text-[#c8c8d0]">No saved presets yet</strong>
          <p class="mt-2 mb-0 text-[12px] leading-[1.6] text-[#94949f]">
            Save your current settings above, or import a preset to get started.
          </p>
        </div>
      {/each}
    {/key}
  </div>
  <p
    id="preset-manager-status"
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted empty:hidden data-[error=true]:text-error [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
    data-error={!!managerError}
    role="status"
    aria-live="polite"
  >
    {managerError}
  </p>
</div>
<dialog
  class="m-auto max-h-[calc(100dvh-48px)] w-[min(460px,calc(100vw-32px))] rounded-[14px] border border-solid border-[#3b3b43] bg-panel p-[26px] text-foreground shadow-[0_24px_80px_#0008] backdrop:bg-black/60 backdrop:backdrop-blur-[4px]"
  id="preset-switch-warning"
  aria-labelledby="preset-switch-title"
  aria-describedby="preset-switch-description"
  bind:this={switchDialog}
  oncancel={() => (pendingId = undefined)}
  onclose={() => {
    if (!switchDialog.open) select.focus();
  }}
>
  <h2 class="mt-0 mb-2.5 text-[20px] font-semibold" id="preset-switch-title">
    Replace modified settings?
  </h2>
  <p class="m-0 text-[14px] leading-[1.6] text-[#aaaab4]" id="preset-switch-description">
    Switching to "{pendingName}" will replace your modified settings. These changes have not been
    saved to a preset.
  </p>
  <div class="mt-6 flex flex-wrap justify-end gap-2.5">
    <button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-control-border bg-control px-[15px] py-[9px] text-[13px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="preset-switch-cancel"
      onclick={() => {
        pendingId = undefined;
        switchDialog.close();
      }}><Icon name="x" /><span>Cancel</span></button
    ><button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-accent bg-accent px-[15px] py-[9px] text-[13px] text-accent-ink outline-offset-[5px] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="preset-switch-confirm"
      disabled={busy}
      onclick={() => {
        if (pendingId && safely(() => apply(pendingId!))) switchDialog.close();
      }}>Switch preset</button
    >
  </div>
</dialog>
<dialog
  class="m-auto max-h-[calc(100dvh-48px)] w-[min(460px,calc(100vw-32px))] rounded-[14px] border border-solid border-[#3b3b43] bg-panel p-[26px] text-foreground shadow-[0_24px_80px_#0008] backdrop:bg-black/60 backdrop:backdrop-blur-[4px]"
  id="preset-action-dialog"
  aria-labelledby="preset-action-title"
  aria-describedby="preset-action-description"
  bind:this={actionDialog}
  onclose={closeAction}
>
  <h2 class="mt-0 mb-2.5 text-[20px] font-semibold" id="preset-action-title">
    {action?.title || ''}
  </h2>
  <p class="m-0 text-[14px] leading-[1.6] text-[#aaaab4]" id="preset-action-description">
    {action?.description || ''}
  </p>
  <p
    id="preset-action-error"
    class="my-3.5 text-[13px] leading-[1.6] [overflow-wrap:anywhere] text-error empty:hidden"
    role="alert"
  >
    {actionError}
  </p>
  <div class="mt-6 flex flex-wrap justify-end gap-2.5">
    <button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-control-border bg-control px-[15px] py-[9px] text-[13px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="preset-action-cancel"
      onclick={() => actionDialog.close()}><Icon name="x" /><span>Cancel</span></button
    ><button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-accent bg-accent px-[15px] py-[9px] text-[13px] text-accent-ink outline-offset-[5px] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35 data-[danger=true]:border-[#e9a29a] data-[danger=true]:bg-[#e9a29a] data-[danger=true]:text-[#301511]"
      id="preset-action-confirm"
      data-danger={action?.label === 'Delete preset'}
      disabled={busy}
      onclick={() => {
        if (!action || busy) return;
        try {
          action.run();
          actionDialog.close();
        } catch (cause) {
          actionError = String(cause);
        }
      }}
      ><Icon
        name={action?.label === 'Delete preset'
          ? 'trash-2'
          : action?.label === 'Reset changes'
            ? 'rotate-ccw'
            : 'save'}
      />{action?.label || ''}</button
    >
  </div>
</dialog>
