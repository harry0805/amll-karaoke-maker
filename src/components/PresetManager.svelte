<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { defaults, appearanceSettings, applyAppearance, type Settings } from '../settings';
  import {
    parseStoredPresets,
    serializeStoredPresets,
    presetLabel,
    restoreCurrentSettings,
    persistCurrentSettings,
    PRESETS_KEY,
    MAX_PRESETS,
    mergePresets,
    parsePresets,
    presetName,
    serializePresets,
    type Preset,
  } from '../presets';
  import Icon from './Icon.svelte';
  import PresetRow from './PresetRow.svelte';

  let {
    settings,
    busy,
    active,
    onapply,
  }: { settings: Settings; busy: boolean; active: boolean; onapply: (settings: Settings) => void } =
    $props();
  const selectionKey = 'karaoke-studio.selected-preset.v2';
  let presets = $state<Preset[]>([]);
  let activeId = $state('default');
  let name = $state('');
  let importing = $state(false);
  let restored = $state(false);
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
    for (const storage of [sessionStorage, localStorage]) storage.setItem(selectionKey, activeId);
  }
  function persist(next: Preset[], id = activeId) {
    localStorage.setItem(PRESETS_KEY, serializeStoredPresets(next));
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
    onapply(applyAppearance(settings, preset?.settings || defaults));
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
        settings: appearanceSettings(settings),
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
      const saved = localStorage.getItem(PRESETS_KEY);
      if (saved) {
        presets = parseStoredPresets(saved);
        const normalized = serializeStoredPresets(presets);
        if (normalized !== saved) localStorage.setItem(PRESETS_KEY, normalized);
      }
    } catch {
      error =
        'Saved settings could not be restored. You can still adjust settings and import presets.';
    }
    try {
      const current = restoreCurrentSettings(sessionStorage, localStorage);
      if (current) onapply(current);
    } catch {
      error = 'Session storage is unavailable. Settings may not survive closing this tab.';
    }
    try {
      const selected =
        sessionStorage.getItem(selectionKey) || localStorage.getItem(selectionKey) || 'default';
      activeId = presets.some((p) => p.id === selected) ? selected : 'default';
      sessionStorage.setItem(selectionKey, activeId);
    } catch {
      /* Settings remain usable without storage. */
    }
    restored = true;
  });
  $effect(() => {
    if (!restored) return;
    const current = { ...settings };
    untrack(() =>
      safely(() => {
        persistCurrentSettings(current, sessionStorage, localStorage);
        rememberSelection();
      }),
    );
  });
  $effect(() => {
    if (!active && panel) panel.hidePopover();
  });
</script>

<svelte:window onstorage={storageChanged} onresize={positionPanel} onscroll={positionPanel} />
<section class="panel preset-main">
  <div class="preset-section-heading"><h2><Icon name="bookmark" />Preset</h2></div>
  <select
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
  <div class="preset-main-actions">
    <button
      id="preset-open"
      popovertarget="preset-panel"
      aria-controls="preset-panel"
      aria-expanded={panelOpen}><Icon name="library" /><span>Manage presets</span></button
    >
    <button
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
  <p id="preset-status" class="hint" class:preset-error={!!error} role="status" aria-live="polite">
    {error}
  </p>
</section>
<div
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
  <div class="preset-panel-header">
    <h2 id="preset-title">Manage presets</h2>
    <button
      id="preset-close"
      popovertarget="preset-panel"
      popovertargetaction="hide"
      aria-label="Close presets"
      title="Close presets"><Icon name="x" /></button
    >
  </div>
  <form id="preset-create-form" class="preset-create-form" onsubmit={create}>
    <label class="font-label" for="preset-name">Save current settings as a new preset</label>
    <div class="preset-create-row">
      <input
        id="preset-name"
        type="text"
        maxlength="80"
        placeholder="Preset name"
        autocomplete="off"
        required
        bind:value={name}
        disabled={busy}
      /><button
        id="preset-save"
        type="submit"
        disabled={busy || !name.trim() || presets.length >= MAX_PRESETS}
        ><Icon name="save" /><span>Save</span></button
      >
    </div>
  </form>
  <div class="preset-library-heading">
    <h3>Saved presets</h3>
    <label class="preset-import-label"
      ><Icon name="upload" />Import preset<input
        id="preset-import"
        type="file"
        accept=".json,application/json"
        aria-label="Import preset JSON"
        disabled={busy || importing}
        onchange={importFile}
      /></label
    >
  </div>
  <div id="preset-list" aria-label="Saved presets">
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
                    p.id === preset.id ? { ...p, settings: appearanceSettings(settings) } : p,
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
        <div class="preset-empty">
          <strong>No saved presets yet</strong>
          <p>Save your current settings above, or import a preset to get started.</p>
        </div>
      {/each}
    {/key}
  </div>
  <p
    id="preset-manager-status"
    class="hint"
    class:preset-error={!!managerError}
    role="status"
    aria-live="polite"
  >
    {managerError}
  </p>
</div>
<dialog
  class="studio-dialog"
  id="preset-switch-warning"
  aria-labelledby="preset-switch-title"
  aria-describedby="preset-switch-description"
  bind:this={switchDialog}
  oncancel={() => (pendingId = undefined)}
  onclose={() => {
    if (!switchDialog.open) select.focus();
  }}
>
  <h2 id="preset-switch-title">Replace modified settings?</h2>
  <p class="dialog-description" id="preset-switch-description">
    Switching to "{pendingName}" will replace your modified settings. These changes have not been
    saved to a preset.
  </p>
  <div class="compatibility-actions">
    <button
      id="preset-switch-cancel"
      onclick={() => {
        pendingId = undefined;
        switchDialog.close();
      }}><Icon name="x" /><span>Cancel</span></button
    ><button
      id="preset-switch-confirm"
      disabled={busy}
      onclick={() => {
        if (pendingId && safely(() => apply(pendingId!))) switchDialog.close();
      }}>Switch preset</button
    >
  </div>
</dialog>
<dialog
  class="studio-dialog"
  id="preset-action-dialog"
  aria-labelledby="preset-action-title"
  aria-describedby="preset-action-description"
  bind:this={actionDialog}
  onclose={closeAction}
>
  <h2 id="preset-action-title">{action?.title || ''}</h2>
  <p class="dialog-description" id="preset-action-description">{action?.description || ''}</p>
  <p id="preset-action-error" class="step-error" role="alert">{actionError}</p>
  <div class="compatibility-actions">
    <button id="preset-action-cancel" onclick={() => actionDialog.close()}
      ><Icon name="x" /><span>Cancel</span></button
    ><button
      id="preset-action-confirm"
      class:danger={action?.label === 'Delete preset'}
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
