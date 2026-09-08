<script lang="ts">
  import type { Studio } from '../studio.svelte';
  import { bundledFamilies } from '../font-catalog';
  import { fontLicenseURL } from '../font-runtime';
  import type { Settings } from '../settings';
  import Icon from './Icon.svelte';
  import RangeControl from './RangeControl.svelte';
  let { studio }: { studio: Studio } = $props();
  const outline = (value: number) => (value ? `${value}%` : 'Off');
  const placement = [
    { key: 'fontSize', label: 'Text size', min: 1, max: 15, step: 0.1 },
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
    { key: 'height', label: 'Lyric area', min: 1, max: 100 },
  ] as const;
  const background = [
    { key: 'shade', label: 'Background opacity', id: 'shade-control' },
    { key: 'shadeHeight', label: 'Shade height', id: 'shadeHeight' },
    { key: 'shadeFadeStart', label: 'Fade begins', id: 'shadeFadeStart' },
  ] as const;
</script>

<section class="panel">
  <h2><Icon name="palette" />Lyric style</h2>
  <label class="font-label"
    >Font<select
      id="font"
      value={studio.settings.font}
      disabled={studio.exporting}
      onchange={(event) =>
        studio.updateSetting('font', event.currentTarget.value as Settings['font'])}
    >
      <optgroup label="Bundled fonts"
        ><option value="nunito">Nunito</option><option value="inter">Inter</option><option
          value="robotoCondensed">Roboto Condensed</option
        ><option value="notoSerif">Noto Serif</option></optgroup
      >
      <option value="custom">Custom font</option>
      <optgroup id="device-fonts" label="Device fonts"
        >{#each studio.deviceFonts as font}<option
            value={font.key}
            disabled={!font.available}
            hidden={!font.available}>{font.name}{font.available ? '' : ' (device fallback)'}</option
          >{/each}</optgroup
      >
    </select></label
  >
  <p id="font-license-hint" class="hint" hidden={!bundledFamilies[studio.settings.font]}>
    <a id="font-licenses" href={fontLicenseURL} target="_blank" rel="noopener noreferrer"
      >Bundled font licenses</a
    >
  </p>
  <div id="custom-font-controls" hidden={studio.settings.font !== 'custom'}>
    <label class="file-picker"
      ><span><strong>Custom font</strong></span><input
        id="custom-font-file"
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        disabled={studio.exporting || studio.fontUploadBusy}
        onchange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void studio.changeCustomFont(file);
        }}
      /><span id="custom-font-name">{studio.customName || 'Choose font'}</span></label
    >
    <button
      id="custom-font-remove"
      hidden={!studio.customName}
      disabled={studio.exporting || studio.fontUploadBusy}
      onclick={() => studio.changeCustomFont()}>Remove font</button
    >
    <p class="hint">
      TTF, OTF, WOFF, or WOFF2, up to 32 MB. Font files are not included in presets.
    </p>
  </div>
  <p id="font-status" class="hint" role="status">
    {studio.fontError || (studio.fontLoading || studio.fontUploadBusy ? 'Loading font…' : '')}
  </p>
  <div class="style-subsection">
    <h3>Colors and outline</h3>
    <div class="color-controls">
      <label
        >Text color<input
          id="textColor"
          type="color"
          value={studio.settings.textColor}
          disabled={studio.exporting}
          oninput={(event) => studio.updateSetting('textColor', event.currentTarget.value)}
        /></label
      ><label
        >Outline color<input
          id="outlineColor"
          type="color"
          value={studio.settings.outlineColor}
          disabled={studio.exporting}
          oninput={(event) => studio.updateSetting('outlineColor', event.currentTarget.value)}
        /></label
      >
    </div>
    <RangeControl
      id="outlineWidth"
      label="Outline thickness"
      value={studio.settings.outlineWidth}
      min={0}
      max={12}
      format={outline}
      disabled={studio.exporting}
      onchange={(value) => studio.updateSetting('outlineWidth', value)}
    />
    <p class="hint">Set outline thickness to 0 to turn it off.</p>
  </div>
  <label class="checkbox-label"
    ><input
      id="useDuetColors"
      type="checkbox"
      aria-controls="duet-style"
      checked={studio.settings.useDuetColors}
      disabled={studio.exporting}
      onchange={(event) => studio.updateSetting('useDuetColors', event.currentTarget.checked)}
    /> Use different settings for duet</label
  >
  <div id="duet-style" class="style-subsection" hidden={!studio.settings.useDuetColors}>
    <h3>Duet colors and outline</h3>
    <div class="color-controls">
      <label
        >Duet text color<input
          id="duetColor"
          type="color"
          value={studio.settings.duetColor}
          disabled={studio.exporting}
          oninput={(event) => studio.updateSetting('duetColor', event.currentTarget.value)}
        /></label
      ><label
        >Duet outline color<input
          id="duetOutlineColor"
          type="color"
          value={studio.settings.duetOutlineColor}
          disabled={studio.exporting}
          oninput={(event) => studio.updateSetting('duetOutlineColor', event.currentTarget.value)}
        /></label
      >
    </div>
    <RangeControl
      id="duetOutlineWidth"
      label="Duet outline thickness"
      value={studio.settings.duetOutlineWidth}
      min={0}
      max={12}
      format={outline}
      disabled={studio.exporting}
      onchange={(value) => studio.updateSetting('duetOutlineWidth', value)}
    />
  </div>
</section>
<section class="panel">
  <h2><Icon name="move" />Lyric placement</h2>
  {#each placement as control}
    <RangeControl
      id={control.key}
      {...control}
      value={studio.settings[control.key]}
      disabled={studio.exporting}
      onchange={(value) => studio.updateSetting(control.key, value)}
    />
  {/each}
</section>
<section class="panel">
  <h2>Background</h2>
  <div class="color-controls">
    <label
      >Background color<input
        id="backgroundColor"
        type="color"
        value={studio.settings.backgroundColor}
        disabled={studio.exporting}
        oninput={(event) => studio.updateSetting('backgroundColor', event.currentTarget.value)}
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
      value={studio.settings[control.key]}
      disabled={studio.exporting}
      onchange={(value) => studio.updateSetting(control.key, value)}
    />
  {/each}
</section>
<p id="settings-error" class="step-error" role="alert" hidden={!studio.errors.settings}>
  {studio.errors.settings}
</p>
