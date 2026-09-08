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
<main
  class="mx-auto flex h-full max-w-[1560px] flex-col px-10 max-studio:h-auto max-studio:min-h-dvh max-studio:px-5 max-phone:px-3.5"
  id="studio"
>
  <BrandHeader />
  <div
    class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_350px] grid-rows-[minmax(0,1fr)_auto] gap-x-9 gap-y-0 [grid-template-areas:'viewer_steps'_'footer_steps'] max-studio:flex-none max-studio:grid-cols-1 max-studio:grid-rows-[auto_auto_auto] max-studio:gap-y-[30px] max-studio:[grid-template-areas:'viewer'_'steps'_'footer']"
  >
    <Preview {studio} />
    <aside
      class="relative flex min-h-0 flex-col gap-0 [grid-area:steps] max-studio:h-auto studio:before:pointer-events-none studio:before:absolute studio:before:top-0 studio:before:bottom-6 studio:before:-left-[18px] studio:before:w-px studio:before:bg-divider studio:before:content-['']"
      aria-label="Video setup"
    >
      <div
        class="flex flex-none gap-1 border-0 border-b border-solid border-[#303037] pb-3 [&_svg]:size-[15px]"
        role="tablist"
        aria-label="Setup steps"
      >
        {#each steps as step, index}
          <button
            class="flex flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-[7px] border-0 bg-transparent px-1 py-2.5 text-[13px] whitespace-nowrap text-[#a5a5b0] outline-offset-[5px] hover:bg-accent-muted-hover hover:text-accent-text focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid disabled:cursor-default disabled:opacity-35 aria-selected:bg-accent aria-selected:font-semibold aria-selected:text-accent-ink aria-selected:hover:bg-accent-hover aria-selected:hover:text-accent-ink"
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
      <div
        class="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto pt-[22px] pr-2 pb-2 max-studio:flex-none max-studio:[scrollbar-gutter:auto] max-studio:overflow-visible max-studio:pr-0"
        bind:this={scroll}
      >
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
        <div class="mt-6 pb-2" hidden={currentStep === 2}>
          <button
            class="m-0 flex w-full cursor-pointer items-center justify-between rounded-[7px] border-0 bg-accent px-4 py-3.5 text-[15px] font-semibold text-accent-ink no-underline outline-offset-[5px] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid disabled:cursor-default disabled:opacity-35"
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
  class="m-auto max-h-[calc(100dvh-48px)] w-[min(460px,calc(100vw-32px))] rounded-[14px] border border-solid border-[#3b3b43] bg-panel p-[26px] text-foreground shadow-[0_24px_80px_#0008] backdrop:bg-black/60 backdrop:backdrop-blur-[4px]"
  id="compatibility-warning"
  aria-labelledby="compatibility-title"
  aria-describedby="compatibility-description"
  bind:this={compatibilityDialog}
  onclose={() => {
    if (!studio.compatibilityAccepted) tabs[0]?.focus();
  }}
>
  <h2 class="mt-0 mb-2.5 text-[20px] font-semibold" id="compatibility-title">
    This video may not render
  </h2>
  <p class="m-0 text-[14px] leading-[1.6] text-[#aaaab4]" id="compatibility-description">
    You can continue editing, but this source has render compatibility issues.
  </p>
  <ul
    class="mt-5 mb-6 pl-[18px] text-[13px] leading-[1.6] text-[#dec994] [&>li+li]:mt-2.5"
    id="compatibility-reasons"
  >
    {#each studio.compatibilityWarnings as warning}<li>{warning}</li>{/each}
  </ul>
  <div class="flex flex-wrap justify-end gap-2.5">
    <button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-control-border bg-control px-[15px] py-[9px] text-[13px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="stay-source"
      onclick={() => compatibilityDialog.close()}><Icon name="x" /><span>Cancel</span></button
    ><button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-accent bg-accent px-[15px] py-[9px] text-[13px] text-accent-ink outline-offset-[5px] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
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
  class="m-auto max-h-[calc(100dvh-48px)] w-[min(460px,calc(100vw-32px))] rounded-[14px] border border-solid border-[#3b3b43] bg-panel p-[26px] text-foreground shadow-[0_24px_80px_#0008] backdrop:bg-black/60 backdrop:backdrop-blur-[4px]"
  id="preset-font-warning"
  aria-labelledby="preset-font-title"
  aria-describedby="preset-font-description"
  bind:this={fontDialog}
>
  <h2 class="mt-0 mb-2.5 text-[20px] font-semibold" id="preset-font-title">Font unavailable</h2>
  <p class="m-0 text-[14px] leading-[1.6] text-[#aaaab4]" id="preset-font-description">
    {missingFont}
  </p>
  <form method="dialog" class="mt-6 flex flex-wrap justify-end gap-2.5">
    <button
      class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-accent bg-accent px-[15px] py-[9px] text-[13px] text-accent-ink outline-offset-[5px] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
      id="preset-font-confirm">OK</button
    >
  </form>
</dialog>
