<script lang="ts">
  import { language, setLanguage, t } from '../i18n';
</script>

<div class="language-toggle" role="group" aria-label={$t('language.label')}>
  {#each [{ code: 'en', label: 'EN', name: 'English' }, { code: 'zh', label: '中文', name: '中文' }] as option}
    <button
      type="button"
      lang={option.code}
      aria-label={option.name}
      aria-pressed={$language === option.code}
      onclick={() => setLanguage(option.code === 'zh' ? 'zh' : 'en')}>{option.label}</button
    >
  {/each}
</div>

<style>
  .language-toggle {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 2px;
    margin-right: 8px;
    padding: 2px;
    border: 1px solid var(--color-control-border, #39393e);
    border-radius: 8px;
    background: var(--color-panel, #1b1b20);
  }
  button {
    cursor: pointer;
    padding: 6px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--color-muted, #9a9aa5);
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
    outline-offset: 3px;
  }
  button:hover {
    color: var(--color-foreground, #ededf1);
  }
  button:focus-visible {
    outline: 2px solid var(--color-accent, #f65b53);
  }
  button[aria-pressed='true'] {
    background: var(--color-accent, #f65b53);
    color: var(--color-accent-ink, #280b08);
  }
  @media (width < 561px) {
    .language-toggle {
      margin-right: 0;
    }
  }
</style>
