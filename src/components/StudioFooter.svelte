<script lang="ts">
  import { t } from '../i18n';
  import LinkedText from './LinkedText.svelte';
</script>

<footer
  class="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 pt-[22px] pb-6 text-[12px] tracking-normal text-muted [grid-area:footer] max-studio:border-0 max-studio:border-t max-studio:border-solid max-studio:border-divider max-studio:pt-5 max-phone:text-[10px] [&_a]:text-accent-text [&_a]:underline-offset-[3px]"
  aria-label={$t('studioFooter.projectLinks')}
>
  <span
    ><LinkedText messageKey="studioFooter.renderedWithLink"
      >{#snippet link()}<a
          class="cursor-pointer outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
          href="https://github.com/amll-dev/applemusic-like-lyrics"
          target="_blank"
          rel="noopener noreferrer">AMLL</a
        >{/snippet}</LinkedText
    ></span
  ><span class="ml-auto max-studio:ml-0"
    ><LinkedText messageKey="studioFooter.reportIssue"
      >{#snippet link()}<a
          class="cursor-pointer outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
          href="https://github.com/harry0805/amll-karaoke-maker/issues"
          target="_blank"
          rel="noopener noreferrer">{$t('studioFooter.reportHere')}</a
        >{/snippet}</LinkedText
    ></span
  >
</footer>
