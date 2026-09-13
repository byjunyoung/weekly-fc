// astro.config.mjs
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://byjunyoung.github.io',
  base: '/weekly-fc',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => /\/weekly-fc\/rules\/$/.test(page) })],
});
