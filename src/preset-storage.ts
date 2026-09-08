import { parseStoredPresets, serializeStoredPresets, type Preset } from './presets';

export const PRESETS_KEY = 'karaoke-studio.presets.v1';
const SELECTION_KEY = 'karaoke-studio.selected-preset.v2';
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

export function restorePresetLibrary(local: Reader & Writer): Preset[] {
  const saved = local.getItem(PRESETS_KEY);
  if (!saved) return [];
  const presets = parseStoredPresets(saved);
  const normalized = serializeStoredPresets(presets);
  if (normalized !== saved) local.setItem(PRESETS_KEY, normalized);
  return presets;
}

export function persistPresetLibrary(presets: Preset[], local: Writer) {
  local.setItem(PRESETS_KEY, serializeStoredPresets(presets));
}

export function restorePresetSelection(
  presets: Preset[],
  session: Reader & Writer,
  local: Reader,
): string {
  const selected = session.getItem(SELECTION_KEY) || local.getItem(SELECTION_KEY) || 'default';
  const id = presets.some((preset) => preset.id === selected) ? selected : 'default';
  session.setItem(SELECTION_KEY, id);
  return id;
}

export function persistPresetSelection(id: string, session: Writer, local: Writer) {
  let failed = false;
  for (const storage of [session, local]) {
    try {
      storage.setItem(SELECTION_KEY, id);
    } catch {
      failed = true;
    }
  }
  if (failed)
    throw new Error(
      'Some browser storage is unavailable. Preset selection may not survive closing this tab.',
    );
}
