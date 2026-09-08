<script lang="ts">
  import type { StudioState } from '../studio.svelte';
  import { bundledFamilies } from '../font-catalog';
  import { fontLicenseURL } from '../font-runtime';
  import type { PresetSettings } from '../settings';
  import Icon from './Icon.svelte';
  import RangeControl from './RangeControl.svelte';
  let { studio }: { studio: StudioState } = $props();
  const outline = (value: number) => (value ? `${value}%` : 'Off');
  const placement = [
    { key: 'height', label: 'Lyric area', min: 1, max: 100 },
    {
      key: 'lineSpacing',
      label: 'Line spacing',
      min: 0.75,
      max: 1.5,
      step: 0.05,
      format: (n: number) => `${n.toFixed(2)}×`,
    },
    { key: 'bottom', label: 'Bottom margin', min: 0, max: 80 },
    { key: 'horizontalMargin', label: 'Horizontal margin', min: 0, max: 40 },
  ] as const;
  const background = [
    { key: 'shade', label: 'Background opacity', id: 'shade-control' },
    { key: 'shadeHeight', label: 'Shade height', id: 'shadeHeight' },
    { key: 'shadeFadeStart', label: 'Fade begins', id: 'shadeFadeStart' },
  ] as const;
</script>

<section
  class="mb-6 border-0 border-b border-solid border-divider pb-6 last:mb-0 last:border-0 last:pb-0"
>
  <h2
    class="mt-0 mb-[17px] flex items-center gap-[9px] text-[16px] font-semibold [&>svg]:text-accent-text"
  >
    <Icon name="palette" />Lyric style
  </h2>
  <RangeControl
    id="fontSize"
    label="Text size"
    value={studio.presetSettings.fontSize}
    min={1}
    max={15}
    step={0.1}
    disabled={studio.session.exporting}
    onchange={(value) => studio.updatePresetSetting('fontSize', value)}
  />
  <label class="block text-[14px]"
    >Font<select
      class="mt-2 block w-full rounded-md border border-solid border-[#39393f] bg-field p-2.5 text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
      id="font"
      value={studio.presetSettings.font}
      disabled={studio.session.exporting}
      onchange={(event) =>
        studio.updatePresetSetting('font', event.currentTarget.value as PresetSettings['font'])}
    >
      <optgroup label="Bundled fonts"
        ><option value="nunito">Nunito</option><option value="inter">Inter</option><option
          value="robotoCondensed">Roboto Condensed</option
        ><option value="notoSerif">Noto Serif</option></optgroup
      >
      <option value="custom">Custom font</option>
      <optgroup id="device-fonts" label="Device fonts"
        >{#each studio.session.deviceFonts as font}<option
            value={font.key}
            disabled={!font.available}
            hidden={!font.available}>{font.name}{font.available ? '' : ' (device fallback)'}</option
          >{/each}</optgroup
      >
    </select></label
  >
  <p
    id="font-license-hint"
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
    hidden={!bundledFamilies[studio.presetSettings.font]}
  >
    <a
      class="cursor-pointer outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
      id="font-licenses"
      href={fontLicenseURL}
      target="_blank"
      rel="noopener noreferrer">Bundled font licenses</a
    >
  </p>
  <div class="mt-3.5" id="custom-font-controls" hidden={studio.presetSettings.font !== 'custom'}>
    <label
      class="relative mb-2.5 block cursor-pointer rounded-lg border border-solid border-[#36363d] bg-panel p-3.5 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent focus-within:outline-solid hover:border-accent-border"
      ><span class="flex items-center gap-2.5 text-[12px] text-muted [&>svg]:text-accent-text"
        ><strong class="text-[14px] font-medium text-foreground">Custom font</strong></span
      ><input
        class="absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
        id="custom-font-file"
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        disabled={studio.session.exporting || studio.session.fontUploadBusy}
        onchange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void studio.changeCustomFont(file);
        }}
      /><span class="mt-[9px] block truncate text-[14px] text-[#ababba]" id="custom-font-name"
        >{studio.session.customName || 'Choose font'}</span
      ></label
    >
    <button
      class="cursor-pointer rounded-[7px] border border-solid border-control-border bg-control px-[9px] py-1.5 text-[12px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="custom-font-remove"
      hidden={!studio.session.customName}
      disabled={studio.session.exporting || studio.session.fontUploadBusy}
      onclick={() => studio.changeCustomFont()}>Remove font</button
    >
    <p
      class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
    >
      TTF, OTF, WOFF, or WOFF2, up to 32 MB. Font files are not included in presets.
    </p>
  </div>
  <p
    id="font-status"
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted empty:hidden [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
    role="status"
  >
    {studio.session.fontError ||
      (studio.session.fontLoading || studio.session.fontUploadBusy ? 'Loading font…' : '')}
  </p>
  <div class="mt-5 border-0 border-t border-solid border-[#303037] pt-4">
    <h3 class="m-0 text-[14px] font-medium">Colors and outline</h3>
    <div class="mt-4 flex gap-[18px]">
      <label class="flex-1 text-[14px]"
        >Text color<input
          class="mt-2 block h-[38px] w-full cursor-pointer rounded-md border border-solid border-[#39393f] bg-field p-[3px] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
          id="textColor"
          type="color"
          value={studio.presetSettings.textColor}
          disabled={studio.session.exporting}
          oninput={(event) => studio.updatePresetSetting('textColor', event.currentTarget.value)}
        /></label
      ><label class="flex-1 text-[14px]"
        >Outline color<input
          class="mt-2 block h-[38px] w-full cursor-pointer rounded-md border border-solid border-[#39393f] bg-field p-[3px] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
          id="outlineColor"
          type="color"
          value={studio.presetSettings.outlineColor}
          disabled={studio.session.exporting}
          oninput={(event) => studio.updatePresetSetting('outlineColor', event.currentTarget.value)}
        /></label
      >
    </div>
    <RangeControl
      id="outlineWidth"
      label="Outline thickness"
      value={studio.presetSettings.outlineWidth}
      min={0}
      max={12}
      format={outline}
      disabled={studio.session.exporting}
      onchange={(value) => studio.updatePresetSetting('outlineWidth', value)}
    />
    <p
      class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
    >
      Set outline thickness to 0 to turn it off.
    </p>
  </div>
  <label class="mt-4 flex cursor-pointer items-center gap-2 text-[14px]"
    ><input
      class="m-0 accent-accent outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
      id="useDuetColors"
      type="checkbox"
      aria-controls="duet-style"
      checked={studio.presetSettings.useDuetColors}
      disabled={studio.session.exporting}
      onchange={(event) => studio.updatePresetSetting('useDuetColors', event.currentTarget.checked)}
    /> Use different settings for duet</label
  >
  <div
    id="duet-style"
    class="mt-5 border-0 border-t border-solid border-[#303037] pt-4"
    hidden={!studio.presetSettings.useDuetColors}
  >
    <h3 class="m-0 text-[14px] font-medium">Duet colors and outline</h3>
    <div class="mt-4 flex gap-[18px]">
      <label class="flex-1 text-[14px]"
        >Duet text color<input
          class="mt-2 block h-[38px] w-full cursor-pointer rounded-md border border-solid border-[#39393f] bg-field p-[3px] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
          id="duetColor"
          type="color"
          value={studio.presetSettings.duetColor}
          disabled={studio.session.exporting}
          oninput={(event) => studio.updatePresetSetting('duetColor', event.currentTarget.value)}
        /></label
      ><label class="flex-1 text-[14px]"
        >Duet outline color<input
          class="mt-2 block h-[38px] w-full cursor-pointer rounded-md border border-solid border-[#39393f] bg-field p-[3px] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
          id="duetOutlineColor"
          type="color"
          value={studio.presetSettings.duetOutlineColor}
          disabled={studio.session.exporting}
          oninput={(event) =>
            studio.updatePresetSetting('duetOutlineColor', event.currentTarget.value)}
        /></label
      >
    </div>
    <RangeControl
      id="duetOutlineWidth"
      label="Duet outline thickness"
      value={studio.presetSettings.duetOutlineWidth}
      min={0}
      max={12}
      format={outline}
      disabled={studio.session.exporting}
      onchange={(value) => studio.updatePresetSetting('duetOutlineWidth', value)}
    />
  </div>
</section>
<section
  class="mb-6 border-0 border-b border-solid border-divider pb-6 last:mb-0 last:border-0 last:pb-0"
>
  <h2
    class="mt-0 mb-[17px] flex items-center gap-[9px] text-[16px] font-semibold [&>svg]:text-accent-text"
  >
    <Icon name="move" />Lyric placement
  </h2>
  {#each placement as control}
    <RangeControl
      id={control.key}
      {...control}
      value={studio.presetSettings[control.key]}
      disabled={studio.session.exporting}
      onchange={(value) => studio.updatePresetSetting(control.key, value)}
    />
  {/each}
</section>
<section
  class="mb-6 border-0 border-b border-solid border-divider pb-6 last:mb-0 last:border-0 last:pb-0"
>
  <h2 class="mt-0 mb-[17px] text-[16px] font-semibold">Background</h2>
  <div class="mt-4 flex gap-[18px]">
    <label class="flex-1 text-[14px]"
      >Background color<input
        class="mt-2 block h-[38px] w-full cursor-pointer rounded-md border border-solid border-[#39393f] bg-field p-[3px] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
        id="backgroundColor"
        type="color"
        value={studio.presetSettings.backgroundColor}
        disabled={studio.session.exporting}
        oninput={(event) =>
          studio.updatePresetSetting('backgroundColor', event.currentTarget.value)}
      /></label
    >
  </div>
  {#each background as control}
    <RangeControl
      id={control.id}
      outputId={`${control.key}-value`}
      label={control.label}
      min={0}
      max={100}
      value={studio.presetSettings[control.key]}
      disabled={studio.session.exporting}
      onchange={(value) => studio.updatePresetSetting(control.key, value)}
    />
  {/each}
</section>
<p
  id="settings-error"
  class="my-3.5 text-[13px] leading-[1.6] [overflow-wrap:anywhere] text-error"
  role="alert"
  hidden={!studio.session.errors.settings}
>
  {studio.session.errors.settings}
</p>
