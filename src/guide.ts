import { mount } from 'svelte';
import { t } from './i18n';
import type { MessageKey } from './messages';
import LanguageToggle from './components/LanguageToggle.svelte';
import { localizePageMetadata } from './page-metadata';

localizePageMetadata('guide');
mount(LanguageToggle, { target: document.getElementById('guide-language')! });

// Retain the static English article for no-JavaScript readers and search engines.
// Reuse real links when translating whole sentences, without inserting HTML.
const elements = [...document.querySelectorAll<HTMLElement>('[data-i18n]')].map((element) => ({
  element,
  key: element.dataset.i18n as MessageKey,
  link: element.querySelector<HTMLAnchorElement>('[data-i18n-link]'),
}));

t.subscribe((translate) => {
  for (const { element, key, link } of elements) {
    const text = translate(key);
    if (link) {
      const parts = text.split('{link}');
      element.replaceChildren();
      parts.forEach((part, index) => {
        if (index) element.append(link);
        element.append(document.createTextNode(part));
      });
    } else element.textContent = text;
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', translate(element.dataset.i18nAriaLabel as MessageKey));
  }
});
