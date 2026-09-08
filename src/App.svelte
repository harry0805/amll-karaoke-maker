<script lang="ts">
  import { tick } from 'svelte';
  import { Studio } from './studio.svelte';
  import { deviceFontNames } from './font-catalog';
  import type { Settings } from './settings';
  import BrandHeader from './components/BrandHeader.svelte';
  import StudioFooter from './components/StudioFooter.svelte';
  import Preview from './components/Preview.svelte';
  import SourcePanel from './components/SourcePanel.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import PresetManager from './components/PresetManager.svelte';
  import ExportPanel from './components/ExportPanel.svelte';
  import Icon from './components/Icon.svelte';

  const studio = new Studio();
  const steps = [
    { id: 'source', label: 'Source', icon: 'folder-open' },
    { id: 'settings', label: 'Settings', icon: 'sliders-horizontal' },
    { id: 'export', label: 'Render', icon: 'film' },
  ] as const;
  let currentStep = $state(0);
  let pendingStep = 1;
  let navigationRequest = 0;
  let tabs = $state<HTMLButtonElement[]>([]);
  let scroll: HTMLDivElement;
  let compatibilityDialog: HTMLDialogElement;
  let fontDialog: HTMLDialogElement;
  let missingFont = $state('');

  async function selectStep(index: number, focus = false) {
    currentStep = index;
    await tick();
    scroll.scrollTop = 0;
    if (focus) tabs[index]?.focus();
  }
  async function requestStep(index: number, focus = false) {
    const request = ++navigationRequest;
    if (index === 0) {
      await selectStep(index, focus);
      return;
    }
    const result = await studio.canLeaveSource();
    if (request !== navigationRequest || result === 'stale') return;
    if (result === 'warn') {
      pendingStep = index;
      await selectStep(0);
      compatibilityDialog.showModal();
      return;
    }
    await selectStep(index, focus);
  }
  function tabKey(event: KeyboardEvent, index: number) {
    let target: number;
    if (event.key === 'ArrowRight') target = (index + 1) % steps.length;
    else if (event.key === 'ArrowLeft') target = (index + steps.length - 1) % steps.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = steps.length - 1;
    else return;
    event.preventDefault();
    void requestStep(target, true);
  }
  function applySettings(settings: Settings) {
    studio.configure(settings);
  }
  $effect(() => {
    const deviceName = deviceFontNames[studio.settings.font as keyof typeof deviceFontNames];
    const font = studio.deviceFonts.find((font) => font.key === studio.settings.font);
    if (deviceName && font && !font.available) {
      missingFont = `This preset uses "${deviceName}", which is unavailable on this device. Install it on your system and reload this page, or choose another font in Settings. A fallback font is being used for now.`;
      const frame = requestAnimationFrame(() => fontDialog.showModal());
      return () => cancelAnimationFrame(frame);
    }
  });
</script>

<svelte:window
  onbeforeunload={(event) => {
    if (studio.exporting) {
      event.preventDefault();
      event.returnValue = '';
    }
  }}
/>
<main id="studio">
  <BrandHeader />
  <div class="workspace">
    <Preview {studio} />
    <aside aria-label="Video setup">
      <div class="step-tabs" role="tablist" aria-label="Setup steps">
        {#each steps as step, index}
          <button
            id={`tab-${step.id}`}
            role="tab"
            aria-controls={`step-${step.id}`}
            aria-selected={currentStep === index}
            tabindex={currentStep === index ? 0 : -1}
            bind:this={tabs[index]}
            onclick={() => requestStep(index)}
            onkeydown={(event) => tabKey(event, index)}
            ><Icon name={step.icon} /><span>{step.label}</span></button
          >
        {/each}
      </div>
      <div class="step-scroll" bind:this={scroll}>
        <div
          id="step-source"
          role="tabpanel"
          aria-labelledby="tab-source"
          tabindex="0"
          hidden={currentStep !== 0}
        >
          <SourcePanel {studio} />
        </div>
        <div
          id="step-settings"
          role="tabpanel"
          aria-labelledby="tab-settings"
          tabindex="0"
          hidden={currentStep !== 1}
        >
          <PresetManager
            settings={studio.settings}
            busy={studio.exporting}
            active={currentStep === 1}
            onapply={applySettings}
          />
          <SettingsPanel {studio} />
        </div>
        <div
          id="step-export"
          role="tabpanel"
          aria-labelledby="tab-export"
          tabindex="0"
          hidden={currentStep !== 2}
        >
          <ExportPanel {studio} />
        </div>
        <div class="step-actions" hidden={currentStep === 2}>
          <button
            class="primary"
            id="next-step"
            hidden={currentStep === 2}
            onclick={() => requestStep(Math.min(2, currentStep + 1), true)}
            ><span id="next-step-label"
              >{currentStep === 0 ? 'Next: Settings' : 'Next: Render'}</span
            ><span aria-hidden="true"><Icon name="arrow-right" /></span></button
          >
        </div>
      </div>
    </aside>
    <StudioFooter />
  </div>
</main>
<dialog
  class="studio-dialog"
  id="compatibility-warning"
  aria-labelledby="compatibility-title"
  aria-describedby="compatibility-description"
  bind:this={compatibilityDialog}
  onclose={() => {
    if (!studio.compatibilityAccepted) tabs[0]?.focus();
  }}
>
  <h2 id="compatibility-title">This video may not render</h2>
  <p class="dialog-description" id="compatibility-description">
    You can continue editing, but this source has render compatibility issues.
  </p>
  <ul id="compatibility-reasons">
    {#each studio.compatibilityWarnings as warning}<li>{warning}</li>{/each}
  </ul>
  <div class="compatibility-actions">
    <button id="stay-source" onclick={() => compatibilityDialog.close()}
      ><Icon name="x" /><span>Cancel</span></button
    ><button
      id="proceed-anyway"
      onclick={() => {
        studio.compatibilityAccepted = true;
        compatibilityDialog.close();
        void selectStep(pendingStep, true);
      }}>Proceed anyway</button
    >
  </div>
</dialog>
<dialog
  class="studio-dialog"
  id="preset-font-warning"
  aria-labelledby="preset-font-title"
  aria-describedby="preset-font-description"
  bind:this={fontDialog}
>
  <h2 id="preset-font-title">Font unavailable</h2>
  <p class="dialog-description" id="preset-font-description">{missingFont}</p>
  <form method="dialog" class="compatibility-actions">
    <button id="preset-font-confirm">OK</button>
  </form>
</dialog>
