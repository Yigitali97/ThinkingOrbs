/// <reference types="vitest/config" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { HERMES_PATHS, hermesPageMeta } from './demo/hermes/routes';
import { ALL_PATHS, PageMeta, pageMeta, SITE_NAME } from './demo/site/routes';

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

/** One page-set of the build: its HTML entry, every path to write, and the title and description of each. */
export interface SiteBuild {
  shell: string;
  paths: string[];
  meta: (path: string) => PageMeta | null;
}

export const SITES: SiteBuild[] = [
  { shell: 'index.html', paths: ALL_PATHS, meta: pageMeta },
  { shell: 'hermes/index.html', paths: HERMES_PATHS, meta: hermesPageMeta },
];

/**
 * Write one HTML file per page (dist/components/search-orb/index.html, dist/hermes/team/index.html, …)
 * with that page's title and description, plus a 404.html. Every URL then works on any static host,
 * with no rewrite rules, and shows the right title in links.
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
      // read every built shell before writing anything: a site's first page overwrites its own shell
      const shells = SITES.map((site) => readFileSync(join(outDir, site.shell), 'utf8'));
      SITES.forEach((site, i) => {
        for (const path of site.paths) {
          const meta = site.meta(path)!;
          const file = path === '/' ? join(outDir, 'index.html') : join(outDir, path, 'index.html');
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, withMeta(shells[i], meta.title, meta.description));
        }
      });
      writeFileSync(join(outDir, '404.html'), withMeta(shells[0], `Page not found · ${SITE_NAME}`, 'There is no page at this address.'));
    },
  };
}

/**
 * In dev and preview, a page URL under a second entry (/hermes/team) has no file of its own, so the
 * server would answer with the docs shell. Send those requests to that entry's index.html instead.
 * In preview, a page the build already wrote (dist/hermes/team/index.html) is served as that file, so its title and description show.
 */
export function siteFallback(prefixes: string[]): Plugin {
  let base = '/';
  let outDir = 'dist';
  let preview = false;
  const rewrite = (req: { url?: string; method?: string; headers: { accept?: string } }) => {
    if (req.method !== 'GET' || !req.url || !req.headers.accept?.includes('text/html')) return;
    const [path, query = ''] = req.url.split('?');
    if (/\.[a-z0-9]+$/i.test(path)) return;
    for (const prefix of prefixes) {
      const root = base + prefix;
      if (path === root || path.startsWith(root + '/')) {
        const page = path.replace(/\/+$/, '');
        const written = preview && existsSync(join(outDir, page.slice(base.length), 'index.html'));
        req.url = `${written ? page : root}/index.html${query ? '?' + query : ''}`;
        return;
      }
    }
  };
  return {
    name: 'site-fallback',
    configResolved(config) {
      base = config.base;
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => (rewrite(req), next()));
    },
    configurePreviewServer(server) {
      preview = true;
      server.middlewares.use((req, _res, next) => (rewrite(req), next()));
    },
  };
}

// BASE_PATH=/ThinkingOrbs/ npm run build — for hosting under a sub-path (e.g. GitHub Pages)
const base = process.env.BASE_PATH ? '/' + process.env.BASE_PATH.replace(/^\/+|\/+$/g, '') + '/' : '/';

export default defineConfig({
  base: base === '//' ? '/' : base,
  plugins: [react(), prerenderRoutes(), siteFallback(['hermes'])],
  server: { port: 5318 },
  preview: { port: 5319 },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: { input: { main: 'index.html', hermes: 'hermes/index.html' } },
  },
  test: {
    include: ['src/**/*.test.ts', 'demo/**/*.test.ts', 'demo/**/*.test.tsx', '*.test.ts'],
    environment: 'node',
  },
});
