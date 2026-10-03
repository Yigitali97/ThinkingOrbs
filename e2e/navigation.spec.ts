// Moving around the site: in-app navigation, titles, focus, scroll restoration,
// back/forward, deep links, and animation loops that stop when orbs leave.

import { COMPONENTS } from '../demo/site/routes';
import { expect, test } from './fixtures';

test('the site opens on the components, and nav links change pages without a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Components');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Components' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Components' }).getByRole('link', { name: COMPONENTS[0].name })).toHaveAttribute('aria-current', 'location');
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));

  for (const [name, path, title] of [
    ['Examples', '/examples', /^Examples/],
    ['Playground', '/playground', /^Playground/],
    ['Components', '/', /^ThinkingOrbs/],
  ] as const) {
    await nav.getByRole('link', { name }).click();
    await expect(page).toHaveURL(new RegExp(`${path}(\\?.*)?$`));
    await expect(page).toHaveTitle(title);
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main')).toBeFocused();
  }
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker), 'no full page reload').toBe(1);

  await nav.getByRole('link', { name: 'Examples' }).click();
  await page.getByRole('link', { name: 'ThinkingOrbs home' }).click();
  await expect(page.locator('h1')).toHaveText('Components');
});

test('the components sidebar jumps to each component and highlights the one on screen', async ({ page }) => {
  await page.goto(`/components/${COMPONENTS[0].slug}`);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Components' })).toHaveAttribute('aria-current', 'true');
  const sidebar = page.getByRole('navigation', { name: 'Components' });
  const current = sidebar.locator('a[aria-current="location"]');
  for (const c of COMPONENTS.slice(1)) {
    await sidebar.getByRole('link', { name: c.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/components#${c.slug}$`));
    await expect(page.locator(`#${c.slug} h2`)).toBeInViewport();
    await expect(current).toHaveText(c.name);
    await expect(sidebar.getByRole('link', { name: c.name, exact: true })).toBeInViewport(); // pinned on phones too
  }
  // …and back up again by scrolling
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(current).toHaveText(COMPONENTS[0].name);
  await expect(page.locator('h1')).toHaveText('Components');
});

test('back and forward restore pages and scroll positions', async ({ page }) => {
  await page.goto('/components/tool-orb');
  const playground = page.locator('#tool-orb').getByRole('link', { name: 'Try every option in the playground' });
  await playground.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(500);
  await playground.click();
  await expect(page.locator('h1')).toHaveText('Playground');
  expect(await page.evaluate(() => window.scrollY), 'new page starts at the top').toBe(0);

  await page.goBack();
  await expect(page.locator('h1')).toHaveText('Components');
  // demos above remount as you return, so the position is close rather than exact
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 300);
  await expect(page.locator('#tool-orb')).toBeInViewport();

  await page.goForward();
  await expect(page.locator('h1')).toHaveText('Playground');
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
  await page.goto('/examples/');
  await expect(page.locator('h1')).toHaveText('Examples');
  await page.goto('/components/reel-orb/');
  await expect(page.locator('h1')).toHaveText('Components');
  await expect(page.locator('#reel-orb h2')).toBeInViewport();
  await page.goto('/components/#search-orb');
  await expect(page.locator('#search-orb h2')).toBeInViewport();
});

test('anchor links scroll to the section, opening it when it is folded', async ({ page }) => {
  await page.goto('/components#search-orb-props');
  await expect(page.locator('#search-orb details')).toHaveAttribute('open', '');
  await expect(page.locator('#search-orb-props')).toBeInViewport();
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
  const sidebar = page.getByRole('navigation', { name: 'Components' });

  // the top of the components page runs the demos near the screen, and nothing else
  await page.goto('/');
  await expect(page.locator(`#${COMPONENTS[0].slug} .doc-demo`)).toHaveAttribute('data-mounted', 'yes');
  const atTop = await loops();
  expect(atTop, 'only the demos near the screen run').toBeLessThan(COMPONENTS.length / 2);

  // pass every component, then come back: the demos left behind have stopped
  for (const c of COMPONENTS) {
    await sidebar.getByRole('link', { name: c.name, exact: true }).click();
    await expect(page.locator(`#${c.slug} .doc-demo`)).toHaveAttribute('data-mounted', 'yes');
    await page.waitForTimeout(250);
  }
  await expect(page.locator(`#${COMPONENTS[0].slug} .doc-demo`)).toHaveAttribute('data-mounted', 'no');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(`#${COMPONENTS[COMPONENTS.length - 1].slug} .doc-demo`)).toHaveAttribute('data-mounted', 'no');
  await expect.poll(loops, { message: 'loops left behind' }).toBe(atTop);

  // leaving the examples stops their loops too
  await page.goto('/examples#agent-run');
  await expect(page.locator('.ar')).toBeVisible();
  const busy = await loops();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Components' }).click();
  await expect(page.locator('h1')).toHaveText('Components');
  expect(busy, 'the examples run their own loops').toBeGreaterThan(0);
  // (a page's last frames can still be winding down just after it leaves)
  await expect.poll(loops, { message: 'only the components page loops are left' }).toBe(atTop);
});

test('examples start only when you scroll to them', async ({ page }) => {
  await page.goto('/examples');
  const mounted = (slug: string) => page.locator(`#${slug} .example-live`);
  await expect(mounted('chat-app')).toHaveAttribute('data-mounted', 'yes');
  await expect(mounted('ask-flow')).toHaveAttribute('data-mounted', 'no');
  await page.getByRole('navigation', { name: 'Examples' }).getByRole('link', { name: 'Ask and answer' }).click();
  await expect(page).toHaveURL(/\/examples#ask-flow$/);
  await expect(page.locator('#ask-flow')).toBeInViewport();
  await expect(mounted('ask-flow')).toHaveAttribute('data-mounted', 'yes');
  await expect(page.locator('#ask-flow').getByRole('textbox', { name: 'Ask anything...' })).toBeVisible();
});

test('the examples sidebar highlights the example on screen as you scroll', async ({ page }) => {
  await page.goto('/examples');
  const sidebar = page.getByRole('navigation', { name: 'Examples' });
  const current = sidebar.locator('a[aria-current="location"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText('Chat app');
  for (const [slug, name] of [
    ['voice-assistant', 'Voice assistant'],
    ['agent-run', 'Agent run'],
    ['ask-flow', 'Ask and answer'],
  ]) {
    await page.locator(`#${slug} h2`).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(current).toHaveText(name);
    await expect(sidebar.getByRole('link', { name })).toBeInViewport(); // pinned on phones too
  }
  // …and back up again
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(current).toHaveText('Chat app');
  await expect(sidebar.getByRole('link', { name: 'Chat app' })).not.toHaveAttribute('aria-current', 'page');
});

test('each example keeps its usage, props and notes folded until asked', async ({ page }) => {
  await page.goto('/examples');
  for (const [slug, label] of [
    ['chat-app', 'Usage and props'],
    ['voice-assistant', 'Usage and props'],
    ['agent-run', 'Usage'],
    ['ask-flow', 'Usage'],
  ]) {
    const section = page.locator(`#${slug}`);
    const summary = section.locator('summary');
    await expect(summary).toHaveText(label);
    await expect(section.locator('.codeblock')).toBeHidden();
    await summary.click();
    await expect(section.locator('details')).toHaveAttribute('open', '');
    await expect(section.locator('.codeblock')).toBeVisible();
    await expect(section.locator('.notes li').first()).toBeVisible();
    await expect(section.locator('.table-props')).toHaveCount(label === 'Usage and props' ? 1 : 0);
    await summary.press('Enter'); // keyboard closes it again
    await expect(section.locator('.codeblock')).toBeHidden();
  }
});
