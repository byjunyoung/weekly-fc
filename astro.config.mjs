// astro.config.mjs
// 검색 허용 페이지가 없어(2026-09-14 운영 규칙까지 noindex) sitemap 통합을 뺐다.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://byjunyoung.github.io',
  base: '/weekly-fc',
  trailingSlash: 'always',
});
