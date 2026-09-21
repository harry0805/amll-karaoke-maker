<script lang="ts">
  import InfoPopover from './InfoPopover.svelte';
  let {
    id,
    outputId = `${id}-value`,
    label,
    info,
    value,
    min,
    max,
    step = 1,
    disabled = false,
    format = (n: number) => `${n}%`,
    onchange,
  }: {
    id: string;
    outputId?: string;
    label: string;
    info?: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    format?: (n: number) => string;
    onchange: (value: number) => void;
  } = $props();
</script>

<div class="my-[15px] grid grid-cols-[1fr_auto] gap-2 text-[14px]">
  <span class="flex items-center gap-1"
    ><label for={id}>{label}</label>{#if info}<InfoPopover {label} text={info} />{/if}</span
  > <output class="text-[13px] text-[#aaaab4]" id={outputId}>{format(value)}</output><input
    class="col-span-full m-0 w-full cursor-pointer accent-accent outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
    {id}
    type="range"
    {min}
    {max}
    {step}
    {value}
    {disabled}
    oninput={(event) => onchange(event.currentTarget.valueAsNumber)}
  />
</div>
