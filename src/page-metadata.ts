import { t } from './i18n';

export function localizePageMetadata(page: 'app' | 'guide') {
  return t.subscribe((translate) => {
    const title = translate(page === 'guide' ? 'page.guideTitle' : 'page.appTitle');
    const description = translate(
      page === 'guide' ? 'page.guideDescription' : 'page.appDescription',
    );
    document.title = title;
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[property="og:title"], meta[name="twitter:title"]',
    ))
      meta.content = title;
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]',
    ))
      meta.content = description;
  });
}
