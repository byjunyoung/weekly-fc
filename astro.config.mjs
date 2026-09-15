// astro.config.mjs
// 검색 허용 페이지가 없어(2026-09-14 운영 규칙까지 noindex) sitemap 통합을 뺐다.
// React 는 페이지마다 섬 하나로만 쓴다(2026-09-15 Ant Design 도입 스펙).
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://byjunyoung.github.io',
  base: '/weekly-fc',
  trailingSlash: 'always',
  integrations: [react()],
});
