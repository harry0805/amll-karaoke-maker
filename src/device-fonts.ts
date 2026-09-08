import { deviceFontNames } from './font-catalog';

/** Probe known names without requesting font enumeration permission. */
export async function detectDeviceFonts() {
  return Promise.all(
    Object.entries(deviceFontNames).map(async ([key, name]) => {
      let available = true;
      try {
        const names = [name, `${name} Regular`, `${name.replaceAll(' ', '')}-Regular`];
        await new FontFace(
          'Device font check',
          names.map((face) => `local(${JSON.stringify(face)})`).join(', '),
        ).load();
      } catch {
        available = false;
      }
      return { key, name, available };
    }),
  );
}
