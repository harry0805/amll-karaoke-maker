import { deviceFontNames } from './font-catalog';

/** Probe only these known names. local() never requests font enumeration permission. */
export async function setupDeviceFonts(group: HTMLOptGroupElement) {
  const options = await Promise.all(Object.entries(deviceFontNames).map(async ([key, name]) => {
    const option = new Option(name, key);
    try {
      const names = [name, `${name} Regular`, `${name.replaceAll(" ", "")}-Regular`];
      const source = names.map(face => `local(${JSON.stringify(face)})`).join(", ");
      await new FontFace("Device font check", source).load();
    } catch {
      // Keep the value for saved presets, but omit unavailable faces from the menu.
      // A restored selection continues using its CSS fallback stack.
      option.hidden = true;
      option.disabled = true;
      option.textContent = `${name} (device fallback)`;
    }
    return option;
  }));
  group.replaceChildren(...options);
}
