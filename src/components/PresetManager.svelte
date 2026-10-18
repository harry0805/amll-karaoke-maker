<script lang="ts">
  import { message, errorMessage, type DisplayMessage } from '../messages';
  import { LocalizedError } from '../messages';

  import { t, translateMessage } from '../i18n';

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
  let error = $state<DisplayMessage>('');
  let managerError = $state<DisplayMessage>('');
  let panelOpen = $state(false);
  let panel: HTMLElement;
  let select: HTMLSelectElement;
  let switchDialog: HTMLDialogElement;
  let actionDialog: HTMLDialogElement;
  let pendingId = $state<string>();
  const actionMessages = {
    reset: { title: 'presetManager.resetTitle', label: 'presetManager.resetChanges' },
    delete: { title: 'presetManager.deleteTitle', label: 'presetManager.deleteAction' },
    update: { title: 'presetManager.updateTitle', label: 'presetManager.updateAction' },
  } as const;
  let action = $state<{
    kind: keyof typeof actionMessages;
    description: DisplayMessage;
    run: () => void;
  }>();
  let actionError = $state<DisplayMessage>('');
  let reopenManager = false;
  let libraryVersion = $state(0);
  const modified = $derived(
    presetLabel('', presets.find((p) => p.id === activeId)?.settings || defaults, settings) !== '',
  );
  const pendingName = $derived(
    presets.find((p) => p.id === pendingId)?.name || $t('presetManager.default'),
  );

  function showMessage(text: DisplayMessage) {
    if (panelOpen) managerError = text;
    else error = text;
  }
  function safely(fn: () => void) {
    try {
      fn();
      return true;
    } catch (cause) {
      showMessage(errorMessage(cause));
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
    showMessage('');
  }
  function apply(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (id !== 'default' && !preset)
      throw new LocalizedError('presetManager.thatPresetIsNoLongerAvailableChoose');
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
  async function confirm(
    description: DisplayMessage,
    kind: keyof typeof actionMessages,
    run: () => void,
  ) {
    action = {
      description,
      kind,
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
      if (presets.length >= MAX_PRESETS)
        throw new LocalizedError('presetManager.youCanStoreUpTo100Presets');
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
      if (file.size > 1024 * 1024)
        throw new LocalizedError('presetManager.presetFilesMustBeSmallerThan1');
      const incoming = parsePresets(await file.text());
      if (busy) throw new LocalizedError('presetManager.waitForTheVideoExportToFinish');
      persist(mergePresets(presets, incoming));
    } catch (cause) {
      showMessage(errorMessage(cause));
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
      showMessage('');
    });
  }
  function storageChanged(event: StorageEvent) {
    if (event.key !== PRESETS_KEY) return;
    if (actionDialog.open || switchDialog.open) {
      actionDialog.close();
      switchDialog.close();
      showMessage(message('presetManager.presetsChanged'));
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
      error = message('presetManager.restoreFailed');
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
      <Icon name="bookmark" />{$t('presetManager.preset')}
    </h2>
  </div>
  <select
    class="mt-3 block w-full rounded-md border border-solid border-[#39393f] bg-field p-2.5 text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
    id="preset-select"
    aria-label={$t('presetManager.preset')}
    bind:this={select}
    value={activeId}
    disabled={busy}
    onchange={switchPreset}
  >
    <option value="default"
      >{activeId === 'default'
        ? presetLabel(
            $t('presetManager.default'),
            defaults,
            settings,
            $t('presetManager.modifiedSuffix'),
          )
        : $t('presetManager.default')}</option
    >
    {#each presets as preset (preset.id)}<option value={preset.id}
        >{activeId === preset.id
          ? presetLabel(preset.name, preset.settings, settings, $t('presetManager.modifiedSuffix'))
          : preset.name}</option
      >{/each}
  </select>
  <div class="mt-2.5 flex flex-wrap gap-2 max-[381px]:flex-col">
    <button
      class="inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-solid border-accent-border bg-accent-muted px-2 py-3 text-[13px] font-medium text-accent-text outline-offset-[5px] hover:bg-accent-muted-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="preset-open"
      popovertarget="preset-panel"
      aria-controls="preset-panel"
      aria-expanded={panelOpen}
      ><Icon name="library" /><span>{$t('presetManager.managePresets')}</span></button
    >
    <button
      class="inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-solid border-control-border bg-control px-2 py-3 text-[13px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border enabled:hover:bg-accent-muted enabled:hover:text-accent-text disabled:cursor-default disabled:opacity-35"
      id="preset-reset"
      type="button"
      disabled={busy || !modified}
      onclick={() => {
        const id = activeId;
        void confirm(
          message('presetManager.resetDescription', {
            name: presets.find((p) => p.id === id)?.name || $t('presetManager.default'),
          }),
          'reset',
          () => apply(id),
        );
      }}><Icon name="rotate-ccw" /><span>{$t('presetManager.resetChanges')}</span></button
    >
  </div>
  <p
    id="preset-status"
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted empty:hidden data-[error=true]:text-error [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
    data-error={!!error}
    role="status"
    aria-live="polite"
  >
    {$translateMessage(error)}
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
    <h2 class="mt-0 mb-0 text-[18px] font-semibold" id="preset-title">
      {$t('presetManager.managePresets')}
    </h2>
    <button
      class="grid size-[30px] cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent p-[5px] text-[#eee] outline-offset-[5px] hover:bg-[#303038] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid disabled:cursor-default disabled:opacity-35 [&>svg]:size-5 [&>svg]:stroke-[1.6]"
      id="preset-close"
      popovertarget="preset-panel"
      popovertargetaction="hide"
      aria-label={$t('presetManager.closePresets')}
      title={$t('presetManager.closePresets')}><Icon name="x" /></button
    >
  </div>
  <form
    id="preset-create-form"
    class="mb-5 border-0 border-b border-solid border-[#34343c] pb-[22px]"
    onsubmit={create}
  >
    <label class="block text-[13px] leading-[1.5] text-[#b8b8c2]" for="preset-name"
      >{$t('presetManager.saveCurrentSettingsAsANewPreset')}</label
    >
    <div class="mt-2.5 flex gap-2">
      <input
        class="m-0 block w-full min-w-0 flex-1 rounded-md border border-solid border-[#39393f] bg-field p-2.5 text-[13px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
        id="preset-name"
        type="text"
        maxlength="80"
        placeholder={$t('presetManager.presetName')}
        autocomplete="off"
        required
        bind:value={name}
        disabled={busy}
      /><button
        class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-accent bg-accent px-[15px] py-[9px] text-[13px] text-accent-ink outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border enabled:hover:bg-accent-hover disabled:cursor-default disabled:opacity-35"
        id="preset-save"
        type="submit"
        disabled={busy || !name.trim() || presets.length >= MAX_PRESETS}
        ><Icon name="save" /><span>{$t('presetManager.save')}</span></button
      >
    </div>
  </form>
  <div class="mb-3 flex items-center justify-between">
    <h3 class="m-0 text-[14px]">{$t('presetManager.savedPresets')}</h3>
    <label
      class="relative inline-flex items-center justify-center gap-[7px] overflow-hidden rounded-[7px] border border-solid border-control-border bg-transparent px-[9px] py-1.5 text-[12px] text-[#eee] focus-within:outline-2 focus-within:outline-offset-[3px] focus-within:outline-accent focus-within:outline-solid hover:not-has-[:disabled]:border-accent-border has-[:disabled]:opacity-35"
      ><Icon name="upload" />{$t('presetManager.importPreset')}<input
        class="absolute inset-0 w-full cursor-pointer opacity-0 outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
        id="preset-import"
        type="file"
        accept=".json,application/json"
        aria-label={$t('presetManager.importPresetJSON')}
        disabled={busy || importing}
        onchange={importFile}
      /></label
    >
  </div>
  <div
    class="grid max-h-none gap-2.5 overflow-y-auto p-0.5"
    id="preset-list"
    aria-label={$t('presetManager.savedPresets')}
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
              message('presetManager.replaceSettings', { name: preset.name }),
              'update',
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
              message('presetManager.deleteDescription', { name: preset.name }),
              'delete',
              () => persist(presets.filter((p) => p.id !== preset.id)),
            );
          }}
        />
      {:else}
        <div class="rounded-lg border border-dashed border-[#3b3b43] px-[18px] py-6 text-center">
          <strong class="text-[14px] font-medium text-[#c8c8d0]"
            >{$t('presetManager.noSavedPresetsYet')}</strong
          >
          <p class="mt-2 mb-0 text-[12px] leading-[1.6] text-[#94949f]">
            {$t('presetManager.saveYourCurrentSettingsAboveOrImport')}
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
    {$translateMessage(managerError)}
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
    {$t('presetManager.replaceModifiedSettings')}
  </h2>
  <p class="m-0 text-[14px] leading-[1.6] text-[#aaaab4]" id="preset-switch-description">
    {$t('presetManager.switchDescription', { name: pendingName })}
  </p>
  <div class="mt-6 flex flex-wrap justify-end gap-2.5">
    <button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-control-border bg-control px-[15px] py-[9px] text-[13px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="preset-switch-cancel"
      onclick={() => {
        pendingId = undefined;
        switchDialog.close();
      }}><Icon name="x" /><span>{$t('presetManager.cancel')}</span></button
    ><button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-accent bg-accent px-[15px] py-[9px] text-[13px] text-accent-ink outline-offset-[5px] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="preset-switch-confirm"
      disabled={busy}
      onclick={() => {
        if (pendingId && safely(() => apply(pendingId!))) switchDialog.close();
      }}>{$t('presetManager.switchPreset')}</button
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
    {action ? $t(actionMessages[action.kind].title) : ''}
  </h2>
  <p class="m-0 text-[14px] leading-[1.6] text-[#aaaab4]" id="preset-action-description">
    {$translateMessage(action?.description || '')}
  </p>
  <p
    id="preset-action-error"
    class="my-3.5 text-[13px] leading-[1.6] [overflow-wrap:anywhere] text-error empty:hidden"
    role="alert"
  >
    {$translateMessage(actionError)}
  </p>
  <div class="mt-6 flex flex-wrap justify-end gap-2.5">
    <button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-control-border bg-control px-[15px] py-[9px] text-[13px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="preset-action-cancel"
      onclick={() => actionDialog.close()}
      ><Icon name="x" /><span>{$t('presetManager.cancel')}</span></button
    ><button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-accent bg-accent px-[15px] py-[9px] text-[13px] text-accent-ink outline-offset-[5px] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35 data-[danger=true]:border-[#e9a29a] data-[danger=true]:bg-[#e9a29a] data-[danger=true]:text-[#301511]"
      id="preset-action-confirm"
      data-danger={action?.kind === 'delete'}
      disabled={busy}
      onclick={() => {
        if (!action || busy) return;
        try {
          action.run();
          actionDialog.close();
        } catch (cause) {
          actionError = errorMessage(cause);
        }
      }}
      ><Icon
        name={action?.kind === 'delete'
          ? 'trash-2'
          : action?.kind === 'reset'
            ? 'rotate-ccw'
            : 'save'}
      />{action ? $t(actionMessages[action.kind].label) : ''}</button
    >
  </div>
</dialog>
