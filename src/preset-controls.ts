import { createIcon, type IconName } from './icons';
import { defaults, type Settings } from './settings';
import { parseStoredPresets, serializeStoredPresets, presetLabel, restoreCurrentSettings, persistCurrentSettings, PRESETS_KEY, MAX_PRESETS, mergePresets, parsePresets, presetName, serializePresets, type Preset } from './presets';

export function setupPresets(getSettings: () => Settings, applySettings: (settings: Settings) => void) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const select = $<HTMLSelectElement>('preset-select');
  const name = $<HTMLInputElement>('preset-name');
  const panel = $('preset-panel');
  const positionPanel = () => {
    if (!panel.matches(':popover-open')) return;
    const sidebar = document.querySelector('aside')!.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 32);
    const left = sidebar.left >= width + 28 ? sidebar.left - width - 16 : (window.innerWidth - width) / 2;
    const top = Math.max(16, Math.min(sidebar.top + 48, window.innerHeight - 300));
    panel.style.width = width + 'px';
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
    panel.style.maxHeight = Math.max(160, window.innerHeight - top - 16) + 'px';
  };
  panel.addEventListener('toggle', () => {
    $('preset-open').setAttribute('aria-expanded', String(panel.matches(':popover-open')));
    positionPanel();
  });
  window.addEventListener('resize', positionPanel);
  window.addEventListener('scroll', positionPanel, { passive: true });
  let presets: Preset[] = [];
  let busy = false;
  let importing = false;
  const message = (text: string, error = false) => {
    const target = panel.matches(':popover-open') ? $('preset-manager-status') : $('preset-status');
    target.textContent = error ? text : ''; target.classList.toggle('preset-error', error);
  };
  let activeId = 'default';
  let pendingId: string | undefined;
  const switchDialog = $<HTMLDialogElement>('preset-switch-warning');
  const actionDialog = $<HTMLDialogElement>('preset-action-dialog');
  let pendingAction: (() => void) | undefined;
  let reopenManager = false;
  const confirmAction = (question: string, label: string, callback: () => void) => {
    pendingAction = callback;
    $('preset-action-title').textContent = label === 'Reset changes' ? 'Reset modified settings?' : label === 'Delete preset' ? 'Delete preset?' : 'Update preset?';
    $('preset-action-description').textContent = question;
    $('preset-action-confirm').replaceChildren(createIcon(label === 'Delete preset' ? 'trash-2' : label === 'Reset changes' ? 'rotate-ccw' : 'save'), label);
    $('preset-action-error').textContent = '';
    $('preset-action-confirm').classList.toggle('danger', label === 'Delete preset');
    reopenManager = panel.matches(':popover-open');
    if (reopenManager) panel.hidePopover();
    actionDialog.showModal();
  };
  $('preset-action-cancel').addEventListener('click', () => actionDialog.close());
  actionDialog.addEventListener('close', () => {
    pendingAction = undefined;
    if (reopenManager && !$('step-settings').hidden) panel.showPopover();
    reopenManager = false;
  });
  $('preset-action-confirm').addEventListener('click', () => {
    if (busy || !pendingAction) return;
    try { pendingAction(); actionDialog.close(); }
    catch (error) { $('preset-action-error').textContent = String(error); }
  });
  const selectionKey = 'karaoke-studio.selected-preset.v2';
  const isModified = () => {
    const saved = presets.find(p => p.id === activeId)?.settings || defaults;
    const current = getSettings();
    return (Object.keys(defaults) as (keyof Settings)[]).some(key => saved[key] !== current[key]);
  };
  const updateLabels = () => {
    activeId = select.value;
    for (const option of select.options) {
      const preset = presets.find(p => p.id === option.value);
      const title = preset?.name || 'Default';
      option.text = option.value === select.value ? presetLabel(title, preset?.settings || defaults, getSettings()) : title;
    }
    $<HTMLButtonElement>('preset-reset').disabled = busy || !isModified();
  };
  const rememberSelection = () => {
    for (const storage of [sessionStorage, localStorage]) storage.setItem(selectionKey, select.value);
  };
  const updateButtons = () => {
    $<HTMLButtonElement>('preset-reset').disabled = busy || !isModified();
    $<HTMLInputElement>('preset-import').disabled = busy || importing;
    panel.querySelectorAll<HTMLButtonElement>('button:not(#preset-close)').forEach(button => { button.disabled = busy; });
    $<HTMLButtonElement>('preset-save').disabled = busy || !name.value.trim() || presets.length >= MAX_PRESETS;
  };
  name.addEventListener('input', updateButtons);
  const exportPreset = (preset: Pick<Preset, 'name' | 'settings'>) => {
    const url = URL.createObjectURL(new Blob([serializePresets([preset])], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = (preset.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'preset') + '.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    message('Exported ' + preset.name + '.');
  };
  const refresh = (id = 'default') => {
    select.replaceChildren(new Option('Default', 'default'));
    for (const preset of presets) select.add(new Option(preset.name, preset.id));
    select.value = Array.from(select.options).some(option => option.value === id) ? id : 'default';
    const list = $('preset-list'); list.replaceChildren();
    if (!presets.length) {
      const empty = document.createElement('div'); empty.className = 'preset-empty';
      const title = document.createElement('strong'); title.textContent = 'No saved presets yet';
      const hint = document.createElement('p'); hint.textContent = 'Save your current settings above, or import a preset to get started.';
      empty.append(title, hint); list.append(empty);
    }
    for (const preset of presets) {
      const row = document.createElement('div'); row.className = 'preset-library-item';
      const heading = document.createElement('div'); heading.className = 'preset-row-heading';
      const title = document.createElement('strong'); title.textContent = preset.name; heading.append(title);
      const actions = document.createElement('div'); actions.className = 'preset-row-actions';
      const action = (label: string, callback: () => void) => {
        const button = document.createElement('button'); button.type = 'button';
        const actionIcons: Record<string, IconName> = { Rename: 'pencil', Update: 'save', Export: 'download', Delete: 'trash-2' };
        button.append(createIcon(actionIcons[label]!), label);
        button.setAttribute('aria-label', label + ' ' + preset.name);
        button.addEventListener('click', () => { if (!busy) safely(callback); });
        actions.append(button); return button;
      };
      {
        action('Rename', () => {
          const previousActions = Array.from(actions.children);
          const field = document.createElement('input'); field.className = 'preset-inline-name'; field.value = preset.name; field.maxLength = 80;
          field.setAttribute('aria-label', 'New name for ' + preset.name);
          const headingHeight = heading.getBoundingClientRect().height;
          field.style.height = headingHeight + 'px';
          title.replaceWith(field);
          const save = document.createElement('button'); save.append(createIcon('check'), 'Save name'); save.type = 'button';
          const cancel = document.createElement('button'); cancel.append(createIcon('x'), 'Cancel'); cancel.type = 'button';
          const restore = () => {
            field.replaceWith(title); actions.replaceChildren(...previousActions);
            (previousActions[0] as HTMLButtonElement)?.focus();
          };
          const commit = () => {
            if (busy) return;
            safely(() => {
              const value = presetName(field.value);
              persist(presets.map(p => p.id === preset.id ? { ...p, name: value } : p)); message('');
            });
          };
          save.addEventListener('click', commit); cancel.addEventListener('click', restore);
          field.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commit(); }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); restore(); }
          });
          actions.replaceChildren(save, cancel); field.focus(); field.select();
        });
        action('Update', () => confirmAction('Replace the settings saved in "' + preset.name + '" with your current settings?', 'Update preset', () => {
          persist(presets.map(p => p.id === preset.id ? { ...p, settings: { ...getSettings() } } : p)); message('Updated ' + preset.name + '.');
        }));
      }
      action('Export', () => exportPreset(preset));
      action('Delete', () => confirmAction('Delete "' + preset.name + '"? Your current settings will stay unchanged.', 'Delete preset', () => {
        persist(presets.filter(p => p.id !== preset.id), select.value === preset.id ? 'default' : select.value); message('Deleted ' + preset.name + '.');
      })).className = 'preset-delete-action';
      row.append(heading, actions); list.append(row);
    }
    updateButtons();
    updateLabels();
  };
  const persist = (next: Preset[], id = select.value) => {
    // Save first so quota/private-mode failures cannot look like a successful save.
    localStorage.setItem(PRESETS_KEY, serializeStoredPresets(next));
    presets = next; refresh(id); rememberSelection();
  };
  const safely = (fn: () => void) => {
    try { fn(); } catch (error) { message(String(error), true); }
  };
  try {
    const saved = localStorage.getItem(PRESETS_KEY);
    if (saved) {
      presets = parseStoredPresets(saved);
      const normalized = serializeStoredPresets(presets);
      if (normalized !== saved) localStorage.setItem(PRESETS_KEY, normalized);
    }

  } catch { message('Saved settings could not be restored. You can still adjust settings and import presets.', true); }
  try {
    const current = restoreCurrentSettings(sessionStorage, localStorage);
    if (current) applySettings(current);
    else sessionStorage.setItem('karaoke-studio.settings.v1', JSON.stringify(getSettings()));
  } catch { message('Session storage is unavailable. Settings may not survive closing this tab.', true); }
  let restoredSelection = 'default';
  try {
    restoredSelection = sessionStorage.getItem(selectionKey) || localStorage.getItem(selectionKey) || 'default';
    sessionStorage.setItem(selectionKey, restoredSelection);
  } catch { /* Presets remain usable when storage is unavailable. */ }
  refresh(restoredSelection);
  const applyPreset = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (id !== 'default' && !preset) throw new Error('That preset is no longer available. Choose another preset.');
    select.value = id;
    applySettings({ ...(preset?.settings || defaults) });
    updateLabels(); rememberSelection();
    $('preset-status').textContent = '';
  };
  $('preset-reset').addEventListener('click', () => safely(() => {
    if (busy || !isModified()) return;
    const id = activeId;
    const title = presets.find(p => p.id === id)?.name || 'Default';
    confirmAction('Discard your modified settings and restore the settings to "' + title + '" preset?', 'Reset changes', () => applyPreset(id));
  }));
  select.addEventListener('change', () => safely(() => {
    const targetId = select.value;
    // Restore the actual selection while the user decides, including on Escape.
    select.value = activeId;
    if (busy || targetId === activeId) return;
    if (!isModified()) { applyPreset(targetId); return; }
    pendingId = targetId;
    const title = presets.find(p => p.id === targetId)?.name || 'Default';
    $('preset-switch-description').textContent = 'Switching to "' + title + '" will replace your modified settings. These changes have not been saved to a preset.';
    switchDialog.showModal();
  }));
  $('preset-switch-cancel').addEventListener('click', () => switchDialog.close());
  switchDialog.addEventListener('close', () => { pendingId = undefined; select.focus(); });
  $('preset-switch-confirm').addEventListener('click', () => safely(() => {
    if (busy || pendingId === undefined) return;
    applyPreset(pendingId);
    switchDialog.close();
  }));
  $('preset-create-form').addEventListener('submit', event => {
    event.preventDefault();
    safely(() => {
      if (busy) return;
      if (presets.length >= MAX_PRESETS) throw new Error('You can store up to 100 presets.');
      const title = presetName(name.value);
      const preset = { id: crypto.randomUUID(), name: title, settings: { ...getSettings() } };
      persist([...presets, preset], preset.id); name.value = ''; updateButtons(); message('');
    });
  });
  $<HTMLInputElement>('preset-import').addEventListener('change', async event => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file || busy || importing) return;
    importing = true; updateButtons();
    try {
      if (file.size > 1024 * 1024) throw new Error('Preset files must be smaller than 1 MB.');
      const incoming = parsePresets(await file.text());
      if (busy) throw new Error('Wait for the video export to finish before importing presets.');
      persist(mergePresets(presets, incoming));
      message(`Imported ${incoming.length} preset${incoming.length === 1 ? '' : 's'}. Select one to apply it.`);
    } catch (error) { message(String(error), true); }
    finally { importing = false; updateButtons(); }
  });
  // Share preset library edits across tabs without replacing their current settings.
  window.addEventListener("storage", event => {
    if (event.key !== PRESETS_KEY) return;
    // Existing callbacks refer to the library the user reviewed. Ask again
    // after another tab changes it instead of applying a stale confirmation.
    if (actionDialog.open || switchDialog.open) {
      actionDialog.close(); switchDialog.close();
      message('Presets changed in another tab. Please choose the action again.', true);
    }
    safely(() => {
      const selectedId = select.value;
      const draftName = name.value;
      presets = event.newValue ? parseStoredPresets(event.newValue) : [];
      refresh(selectedId);
      name.value = draftName;
    });
  });
  return {
    changed() {
      safely(() => {
        persistCurrentSettings(getSettings(), sessionStorage, localStorage);
        updateLabels(); rememberSelection();
        $('preset-status').textContent = ''; 
      });
    },
    setBusy(value: boolean) {
      busy = value;
      $('preset-panel').querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button:not(#preset-close), select').forEach(el => { el.disabled = busy; });
      updateButtons();
    },
  };
}
