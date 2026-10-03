// Every page, loaded directly: renders, has the right title, one h1, no
// horizontal scroll, no errors, no serious accessibility violations.

import AxeBuilder from '@axe-core/playwright';
import { ALL_PATHS, pageMeta } from '../demo/site/routes';
import { expect, pixels, test } from './fixtures';

for (const path of ALL_PATHS) {
  test(`page ${path}`, async ({ page }) => {
    await page.goto(path);
    const meta = pageMeta(path)!;
    await expect(page).toHaveTitle(meta.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', meta.description);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();

    // the page's main orb (its largest canvas) draws
    await page.evaluate(() => {
      const all = [...document.querySelectorAll('main canvas')];
      const area = (c: Element) => c.getBoundingClientRect().width * c.getBoundingClientRect().height;
      all.sort((a, b) => area(b) - area(a))[0]?.setAttribute('data-main-orb', '');
    });
    const canvas = page.locator('main canvas[data-main-orb]');
    if (await canvas.count()) {
      await canvas.scrollIntoViewIfNeeded();
      await expect.poll(async () => (await pixels(canvas)).lit, { message: 'first orb draws' }).toBeGreaterThan(0.002);
    }

    // no sideways scrolling at any viewport
    // (compare with the device width: mobile browsers widen the layout viewport to fit wide content)
    const overflow = (await page.evaluate(() => document.documentElement.scrollWidth)) - page.viewportSize()!.width;
    expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);

    // measure contrast once the page's fade-in has finished
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.route')!).opacity)).toBe('1');
    const axe = await new AxeBuilder({ page }).include('main').include('header').exclude('canvas').analyze();
    const serious = axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    expect(serious, 'accessibility violations').toEqual([]);
  });
}

// Static hosts serve dist/404.html for unknown paths; vite preview serves the
// app shell. Either way the app renders its own not-found page.
test('unknown pages show the not-found page', async ({ page }) => {
  await page.goto('/components/not-a-real-orb');
  await expect(page.locator('h1')).toHaveText('No page at /components/not-a-real-orb');
  await expect(page).toHaveTitle(/Page not found/);
  await page.getByRole('link', { name: 'Browse components' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('h1')).toHaveText('AssistantOrb');
});
