<script lang="ts">
  import { onMount } from 'svelte';
  let { label, text }: { label: string; text: string } = $props();
  const id = $props.id();
  let trigger: HTMLButtonElement;
  let panel: HTMLDivElement;
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancelClose() {
    clearTimeout(timer);
  }
  function close() {
    cancelClose();
    panel?.hidePopover();
  }
  function position() {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 24);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    const height = panel.getBoundingClientRect().height;
    panel.style.top = `${Math.max(12, rect.bottom + height + 10 > window.innerHeight ? rect.top - height - 8 : rect.bottom + 8)}px`;
  }
  function show() {
    cancelClose();
    panel.showPopover();
    position();
  }
  function reposition() {
    if (panel?.matches(':popover-open')) position();
  }
  function leave(event: PointerEvent) {
    if (event.pointerType === 'mouse') timer = setTimeout(close, 180);
  }
  onMount(() => {
    document.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', close);
    return () => {
      cancelClose();
      document.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', close);
    };
  });
</script>

<button
  bind:this={trigger}
  type="button"
  aria-label={`About ${label}`}
  aria-controls={id}
  aria-expanded={open}
  aria-haspopup="dialog"
  class="inline-grid size-6 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-muted hover:text-accent-text focus-visible:outline-2 focus-visible:outline-accent"
  onpointerenter={(event) => {
    if (event.pointerType === 'mouse') show();
  }}
  onpointerleave={leave}
  onclick={() => {
    if (open) close();
    else show();
  }}
>
  <span
    aria-hidden="true"
    class="grid size-4 place-items-center rounded-full border border-solid border-current font-serif text-[12px] leading-none"
    >i</span
  >
</button>
<div
  bind:this={panel}
  {id}
  popover="auto"
  role="dialog"
  tabindex="-1"
  aria-label={`About ${label}`}
  class="fixed m-0 rounded-lg border border-solid border-divider bg-[#24242b] p-3 text-[13px] leading-relaxed text-[#eee] shadow-xl"
  ontoggle={() => {
    open = panel.matches(':popover-open');
  }}
  onpointerenter={cancelClose}
  onpointerleave={leave}
>
  {text}
</div>
