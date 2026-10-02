// Moving around the site: in-app navigation, titles, focus, scroll restoration,
// back/forward, deep links, and animation loops that stop when orbs leave.

import { COMPONENTS } from '../demo/site/routes';
import { expect, test } from './fixtures';

test('nav links change pages without a reload, and mark the current section', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  const nav = page.getByRole('navigation', { name: 'Main' });

  for (const [name, path, title] of [
    ['Components', '/components', /^Components/],
    ['Examples', '/examples', /^Examples/],
    ['Playground', '/playground', /^Playground/],
  ] as const) {
    await nav.getByRole('link', { name }).click();
    await expect(page).toHaveURL(new RegExp(path));
    await expect(page).toHaveTitle(title);
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main')).toBeFocused();
  }
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker), 'no full page reload').toBe(1);

  await page.getByRole('link', { name: 'ThinkingOrbs home' }).click();
  await expect(page.locator('h1')).toHaveText('Show what your AI is doing.');
  if (!isMobile) await expect(nav.getByRole('link', { name: 'Components' })).not.toHaveAttribute('aria-current');
});

test('a component page marks its section, and prev/next walk through all thirteen', async ({ page }) => {
  await page.goto(`/components/${COMPONENTS[0].slug}`);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Components' })).toHaveAttribute('aria-current', 'true');
  for (let i = 1; i < COMPONENTS.length; i++) {
    await page.getByRole('navigation', { name: 'More components' }).getByRole('link', { name: new RegExp(`Next\\s*${COMPONENTS[i].name}`) }).click();
    await expect(page.locator('h1')).toHaveText(COMPONENTS[i].name);
    expect(await page.evaluate(() => window.scrollY), 'new page starts at the top').toBe(0);
  }
  await expect(page.getByRole('navigation', { name: 'More components' }).getByRole('link', { name: /Next/ })).toHaveCount(0);
});

test('back and forward restore pages and scroll positions', async ({ page }) => {
  await page.goto('/components');
  await page.mouse.wheel(0, 900);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const y = await page.evaluate(() => window.scrollY);
  await page.locator('.gallery-card', { hasText: 'SearchOrb' }).click();
  await expect(page.locator('h1')).toHaveText('SearchOrb');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.goBack();
  await expect(page.locator('h1')).toHaveText('Components');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 40);

  await page.goForward();
  await expect(page.locator('h1')).toHaveText('SearchOrb');
});

test('modifier clicks are left to the browser', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'phones have no Ctrl/⌘-click');
  await page.goto('/');
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Examples' }).click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] }),
  ]);
  await popup.waitForLoadState();
  expect(new URL(popup.url()).pathname).toBe('/examples');
  await expect(page).toHaveURL(/\/$/);
});

test('deep links load straight into the page, with a trailing slash too', async ({ page }) => {
  await page.goto('/examples/agent-run/');
  await expect(page.locator('h1')).toHaveText('Agent run');
  await page.goto('/components/reel-orb');
  await expect(page.locator('h1')).toHaveText('ReelOrb');
  await page.goto('/components/#props');
  await expect(page.locator('h1')).toHaveText('Components');
});

test('anchor links scroll to the section', async ({ page }) => {
  await page.goto('/components/search-orb#props');
  await expect(page.locator('#props')).toBeInViewport();
});

test('skip link jumps to the content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('home hero cycles through moments, and stops when you pick one', async ({ page }) => {
  await page.goto('/');
  const state = page.locator('.hero-caption-state');
  await expect(state).toHaveText('Listening');
  await expect(state).toHaveText('Thinking', { timeout: 6000 });
  await page.getByRole('button', { name: 'Using tools' }).click();
  await expect(page.getByRole('button', { name: 'Using tools' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(5000);
  await expect(state).toHaveText('Using tools');
  await page.locator('.hero-caption a').click();
  await expect(page.locator('h1')).toHaveText('ToolOrb');
});

test('with reduced motion the hero holds still', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.hero-caption-state')).toHaveText('Listening');
  await page.waitForTimeout(5000);
  await expect(page.locator('.hero-caption-state')).toHaveText('Listening');
  await context.close();
});

test('animation loops stop when orbs leave the page', async ({ page }) => {
  // Each running loop re-registers the same callback every frame, so the number
  // of distinct callbacks seen in a window is the number of live loops,
  // however fast or slow the frames are.
  await page.addInitScript(() => {
    const w = window as unknown as { rafFns: Set<FrameRequestCallback> };
    w.rafFns = new Set();
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      w.rafFns.add(cb);
      return raf(cb);
    };
  });
  const loops = async () => {
    await page.evaluate(() => (window as unknown as { rafFns: Set<unknown> }).rafFns.clear());
    await page.waitForTimeout(1500);
    return page.evaluate(() => (window as unknown as { rafFns: Set<unknown> }).rafFns.size);
  };
  const toExamples = async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Examples' }).click();
    await expect(page.locator('h1')).toHaveText('Examples');
  };

  await page.goto('/examples/agent-run');
  const busy = await loops();
  // the examples index has one orb: the StatusOrb in the header
  await toExamples();
  const quiet = await loops();
  expect(busy, 'the agent run has its own loops').toBeGreaterThan(quiet);
  expect(quiet, 'only the header loop is left').toBe(1);

  // visit every component page in the app, then leave: nothing keeps running
  for (const c of COMPONENTS) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Components' }).click();
    await page.locator('.gallery-card', { hasText: c.name }).click();
    await expect(page.locator('h1')).toHaveText(c.name);
    await page.waitForTimeout(250);
  }
  await toExamples();
  expect(await loops(), 'loops left behind').toBe(1);
});

test('the components gallery only runs the orbs on screen', async ({ page }) => {
  await page.goto('/components');
  const on = () => page.locator('.gallery-thumb[data-inview="on"]').count();
  const total = await page.locator('.gallery-thumb').count();
  expect(total).toBe(13);
  expect(await on()).toBeLessThan(total);
  await page.locator('.gallery-card', { hasText: 'ReelOrb' }).scrollIntoViewIfNeeded();
  await expect(page.locator('.gallery-card', { hasText: 'ReelOrb' }).locator('.gallery-thumb')).toHaveAttribute('data-inview', 'on');
  await expect(page.locator('.gallery-card', { hasText: 'AssistantOrb' }).locator('.gallery-thumb')).toHaveAttribute('data-inview', 'off');
});
