/// <reference types="vitest/config" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { ALL_PATHS, pageMeta, SITE_NAME } from './demo/site/routes';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Swap the title and description of the built index.html for one page. */
export function withMeta(html: string, title: string, description: string) {
  const t = escape(title);
  const d = escape(description);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`);
}

/**
 * Write one HTML file per page (dist/components/search-orb/index.html, …) with
 * that page's title and description, plus a 404.html. Every URL then works on
 * any static host, with no rewrite rules, and shows the right title in links.
 */
function prerenderRoutes(): Plugin {
  let outDir = 'dist';
  return {
    name: 'prerender-routes',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const shell = readFileSync(join(outDir, 'index.html'), 'utf8');
      for (const path of ALL_PATHS) {
        const meta = pageMeta(path)!;
        const file = path === '/' ? join(outDir, 'index.html') : join(outDir, path, 'index.html');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, withMeta(shell, meta.title, meta.description));
      }
      writeFileSync(join(outDir, '404.html'), withMeta(shell, `Page not found · ${SITE_NAME}`, 'There is no page at this address.'));
    },
  };
}

// BASE_PATH=/ThinkingOrbs/ npm run build — for hosting under a sub-path (e.g. GitHub Pages)
const base = process.env.BASE_PATH ? '/' + process.env.BASE_PATH.replace(/^\/+|\/+$/g, '') + '/' : '/';

export default defineConfig({
  base: base === '//' ? '/' : base,
  plugins: [react(), prerenderRoutes()],
  server: { port: 5318 },
  preview: { port: 5319 },
  build: { target: 'es2020', sourcemap: true },
  test: {
    include: ['src/**/*.test.ts', 'demo/**/*.test.ts', 'demo/**/*.test.tsx', '*.test.ts'],
    environment: 'node',
  },
});
