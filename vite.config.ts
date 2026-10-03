/// <reference types="vitest/config" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { HERMES_NAME } from './demo/hermes/config';
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

/** One page-set of the build: its HTML entry, every path to write, the title and description of each, and its not-found title. */
export interface SiteBuild {
  shell: string;
  paths: string[];
  meta: (path: string) => PageMeta | null;
  notFound: string;
}

export const SITES: SiteBuild[] = [
  { shell: 'index.html', paths: ALL_PATHS, meta: pageMeta, notFound: `Page not found · ${SITE_NAME}` },
  { shell: 'hermes/index.html', paths: HERMES_PATHS, meta: hermesPageMeta, notFound: `Page not found · ${HERMES_NAME}` },
];

/** One site's not-found shell: its built HTML, retitled. `prefix` is the folder it lives under; the docs site has none. */
export interface NotFoundShell {
  prefix?: string;
  html: string;
  title: string;
}

const NOT_FOUND_DESCRIPTION = 'There is no page at this address.';

/**
 * The 404.html a static host answers every unknown address with. A host has only the one, so it picks the site from the
 * address: under `<base><prefix>/` it writes that site's head (styles and entry script), anywhere else the docs site's.
 * The address stays as typed, so that app's router shows its own not-found page (Hermes signs you in first).
 */
export function notFoundPage(base: string, docs: NotFoundShell, sites: NotFoundShell[]): string {
  const headOf = (shell: NotFoundShell) =>
    withMeta(shell.html, shell.title, NOT_FOUND_DESCRIPTION)
      .match(/<head>([\s\S]*?)<\/head>/)![1]
      .replace(/\s*<meta charset="[^"]*"\s*\/?>/, '');
  const heads = Object.fromEntries([['', headOf(docs)], ...sites.map((s) => [s.prefix!, headOf(s)])]);
  // JSON inside an inline script: `<` escaped so nothing in it can close the script
  const data = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const body = docs.html.match(/<body>([\s\S]*?)<\/body>/)![1];
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <script>
      (function () {
        var heads = ${data(heads)};
        var base = ${data(base)};
        var path = location.pathname;
        var site = '';
        for (var prefix in heads) {
          var root = base + prefix;
          if (prefix && (path === root || path.indexOf(root + '/') === 0)) site = prefix;
        }
        document.write(heads[site]);
      })();
    </script>
  </head>
  <body>${body}</body>
</html>
`;
}

/**
 * Write one HTML file per page (dist/components/search-orb/index.html, dist/hermes/team/index.html, …)
 * with that page's title and description, plus a site-aware 404.html. Every URL then works on any static host,
 * with no rewrite rules, and shows the right title in links.
 */
function prerenderRoutes(): Plugin {
  let outDir = 'dist';
  let base = '/';
  return {
    name: 'prerender-routes',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      base = config.base;
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
      const [docs, ...others] = SITES.map((site, i) => ({ prefix: dirname(site.shell), html: shells[i], title: site.notFound }));
      writeFileSync(join(outDir, '404.html'), notFoundPage(base, docs, others));
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
