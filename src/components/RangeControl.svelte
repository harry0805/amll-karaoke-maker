<script lang="ts">
  let {
    id,
    outputId = `${id}-value`,
    label,
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
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    format?: (n: number) => string;
    onchange: (value: number) => void;
  } = $props();
</script>

<label class="control" for={id}
  >{label} <output id={outputId}>{format(value)}</output><input
    {id}
    type="range"
    {min}
    {max}
    {step}
    {value}
    {disabled}
    oninput={(event) => onchange(event.currentTarget.valueAsNumber)}
  /></label
>
