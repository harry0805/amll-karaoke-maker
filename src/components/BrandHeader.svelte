<script lang="ts">
  import Icon from './Icon.svelte';
</script>

<header
  class="mb-6 flex flex-none items-center justify-between border-0 border-b border-solid border-divider py-5"
>
  <div class="flex items-center gap-3 text-[21px] font-[650] tracking-[-0.6px]">
    <span class="grid size-9 flex-none place-items-center p-0 [&>img]:block [&>img]:size-9"
      ><img src="/icons/karaoke-maker-rounded.svg" width="36" height="36" alt="" /></span
    > Karaoke Maker
  </div>
  <nav class="flex items-center gap-1" aria-label="Help and project links">
    <a
      class="inline-flex size-9 flex-none cursor-pointer items-center justify-center rounded-[7px] text-muted outline-offset-[5px] hover:bg-control hover:text-foreground focus-visible:bg-control focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid [&_svg]:size-[22px]"
      href="/guide/"
      aria-label="Help"
      title="Help"><Icon name="help" /></a
    >
    <a
      class="inline-flex size-9 flex-none cursor-pointer items-center justify-center rounded-[7px] text-muted outline-offset-[5px] hover:bg-control hover:text-foreground focus-visible:bg-control focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
      href="https://github.com/harry0805/amll-karaoke-maker"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View Karaoke Maker on GitHub"
      title="View on GitHub"
      ><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
        ><path
          d="M12 .297C5.37.297 0 5.67 0 12.297c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.838 1.237 1.838 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.334-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 3-.404c1.02.005 2.045.138 3 .404 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
        /></svg
      ></a
    >
  </nav>
</header>
