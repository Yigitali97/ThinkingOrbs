import { describe, expect, it } from 'vitest';
import { ENTRIES } from '../playground/registry';
import { DOCS } from './docs';
import { highlight } from './highlight';
import { isActive, normalisePath, parseHref, stripBase } from './router';
import { ALL_PATHS, COMPONENTS, EXAMPLES, GROUPS, pageMeta, SITE_LINKS } from './routes';
import { withMeta } from '../../vite.config';
import { COMPANY } from '../hermes/store';
import { HERMES_PATHS, hermesPageMeta, hermesProjectId } from '../hermes/routes';
import * as orbs from '../../src/orbs';

describe('routes', () => {
  it('has a page title and description for every path', () => {
    for (const path of ALL_PATHS) {
      const meta = pageMeta(path);
      expect(meta, path).not.toBeNull();
      expect(meta!.title.length, path).toBeGreaterThan(5);
      expect(meta!.description.length, path).toBeGreaterThan(20);
    }
  });

  it('treats trailing slashes as the same page and unknown paths as missing', () => {
    expect(pageMeta('/components/')).toEqual(pageMeta('/components'));
    expect(pageMeta('/components/nope')).toBeNull();
    expect(pageMeta('/examples/nope')).toBeNull();
    expect(pageMeta('/nope')).toBeNull();
  });

  it('lists each of the thirteen orbs once, in a known group, matching an export', () => {
    expect(COMPONENTS).toHaveLength(13);
    expect(new Set(COMPONENTS.map((c) => c.slug)).size).toBe(13);
    for (const c of COMPONENTS) {
      expect(GROUPS).toContain(c.group);
      expect(orbs, c.name).toHaveProperty(c.name);
      expect(c.tint).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('only names real orbs in examples', () => {
    const names = new Set(COMPONENTS.map((c) => c.name));
    for (const e of EXAMPLES) for (const used of e.uses) expect(names.has(used), `${e.slug}: ${used}`).toBe(true);
  });
});

describe('site links', () => {
  it('links the Hermes site, which lives outside the docs app', () => {
    expect(SITE_LINKS).toHaveLength(1);
    expect(SITE_LINKS[0].href).toBe('/hermes/');
    expect(SITE_LINKS[0].name).toBe('Hermes');
    expect(SITE_LINKS[0].tint).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('docs', () => {
  it('documents every component, with className and style', () => {
    for (const c of COMPONENTS) {
      const doc = DOCS[c.slug];
      expect(doc, c.slug).toBeDefined();
      expect(doc.usage).toContain(c.name);
      const props = doc.props.map((p) => p.name);
      expect(props).toContain('className');
      expect(props).toContain('style');
      expect(new Set(props).size, `${c.slug} has duplicate props`).toBe(props.length);
    }
    expect(Object.keys(DOCS).sort()).toEqual(COMPONENTS.map((c) => c.slug).sort());
  });

  it('every playground entry has a component page', () => {
    const names = COMPONENTS.map((c) => c.name);
    for (const e of ENTRIES) expect(names).toContain(e.name);
    expect(ENTRIES).toHaveLength(13);
  });
});

describe('router helpers', () => {
  it('splits hrefs into path, search and hash', () => {
    expect(parseHref('/playground?orb=search-orb#x')).toEqual({ path: '/playground', search: '?orb=search-orb', hash: '#x' });
    expect(parseHref('/components/')).toEqual({ path: '/components', search: '', hash: '' });
    expect(parseHref('/?')).toEqual({ path: '/', search: '', hash: '' });
  });

  it('normalises paths', () => {
    expect(normalisePath('')).toBe('/');
    expect(normalisePath('//a//b/')).toBe('/a/b');
    expect(normalisePath('/components/index.html')).toBe('/components');
  });

  it('strips the deploy base only at a segment boundary', () => {
    expect(stripBase('/orbs/components', '/orbs')).toBe('/components');
    expect(stripBase('/orbs', '/orbs')).toBe('/');
    expect(stripBase('/orbsx/components', '/orbs')).toBe('/orbsx/components');
    expect(stripBase('/components', '')).toBe('/components');
  });

  it('marks section links active for nested pages only', () => {
    expect(isActive('/components/search-orb', '/components', true)).toBe(true);
    expect(isActive('/components/search-orb', '/components')).toBe(false);
    expect(isActive('/componentsx', '/components', true)).toBe(false);
    expect(isActive('/examples', '/', true)).toBe(false);
  });
});

describe('highlight', () => {
  it('round-trips the source exactly', () => {
    for (const c of COMPONENTS) {
      const code = DOCS[c.slug].usage;
      expect(highlight(code).map((t) => t.text).join('')).toBe(code);
    }
  });

  it('recognises comments, strings, tags, props and keywords', () => {
    const kinds = (src: string) => highlight(src).filter((t) => t.kind !== 'plain' && t.kind !== 'punct').map((t) => [t.kind, t.text]);
    expect(kinds(`import { A } from './orbs'; // hi`)).toEqual([
      ['keyword', 'import'],
      ['keyword', 'from'],
      ['string', "'./orbs'"],
      ['comment', '// hi'],
    ]);
    expect(kinds(`<A size={20} label="x" />`)).toEqual([
      ['tag', '<A'],
      ['attr', 'size'],
      ['number', '20'],
      ['attr', 'label'],
      ['string', '"x"'],
      ['tag', '/>'],
    ]);
  });
});

describe('prerendered pages', () => {
  const shell =
    '<title>Old</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta property="og:description" content="old" />';
  it('swaps in the page title and description, escaped', () => {
    const html = withMeta(shell, 'A <b> & "c"', 'Desc');
    expect(html).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
    expect(html).toContain('<meta name="description" content="Desc" />');
    expect(html).toContain('<meta property="og:title" content="A &lt;b&gt; &amp; &quot;c&quot;" />');
    expect(html).not.toContain('old');
  });
});

describe('Hermes routes', () => {
  it('has a title and description for every path, with no duplicates', () => {
    for (const path of HERMES_PATHS) {
      const meta = hermesPageMeta(path);
      expect(meta, path).not.toBeNull();
      expect(meta!.title, path).toMatch(/Hermes/);
      expect(meta!.description.length, path).toBeGreaterThan(20);
    }
    expect(new Set(HERMES_PATHS).size).toBe(HERMES_PATHS.length);
  });

  it('titles pages "<Page> · Hermes" and the home page with its promise', () => {
    expect(hermesPageMeta('/hermes')!.title).toBe('Hermes: ask anything about Brightline Labs');
    expect(hermesPageMeta('/hermes/team')!.title).toBe('Team · Hermes');
    expect(hermesPageMeta('/hermes/projects/atlas')!.title).toBe('Atlas · Hermes');
  });

  it('knows exactly the projects of the generated company', () => {
    const projectPaths = HERMES_PATHS.filter((p) => p.startsWith('/hermes/projects/'));
    expect(projectPaths.sort()).toEqual(COMPANY.projects.map((p) => `/hermes/projects/${p.id}`).sort());
  });

  it('treats trailing slashes as the same page and unknown paths as missing', () => {
    expect(hermesPageMeta('/hermes/')).toEqual(hermesPageMeta('/hermes'));
    expect(hermesPageMeta('/hermes/nope')).toBeNull();
    expect(hermesPageMeta('/hermes/projects/zephyr')).toBeNull();
    expect(hermesPageMeta('/nope')).toBeNull();
  });

  it('reads the project id from a project page path, and only for a project that exists', () => {
    expect(hermesProjectId('/hermes/projects/atlas')).toBe('atlas');
    expect(hermesProjectId('/hermes/projects/atlas/')).toBe('atlas');
    expect(hermesProjectId('/hermes/projects/zephyr')).toBeNull();
    expect(hermesProjectId('/hermes/projects')).toBeNull();
    expect(hermesProjectId('/hermes/projects/atlas/extra')).toBeNull();
  });
});
