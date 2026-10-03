// The Hermes site: demo sign-in and its guard, every page's title, and the not-found page.

import { HERMES_PATHS, hermesPageMeta } from '../demo/hermes/routes';
import { expect, signInAs, test } from './fixtures';

test('signed out, a page sends you to sign-in and back after you pick a user', async ({ page }) => {
  await page.goto('/hermes/team');
  await expect(page).toHaveURL(/\/hermes\/sign-in\?next=%2Fhermes%2Fteam$/);
  await expect(page.locator('h1')).toHaveText('Sign in to Hermes');
  await expect(page.getByText('This is a demo. Pick a sample employee to sign in as — no password needed.')).toBeVisible();

  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await expect(page).toHaveURL(/\/hermes\/team$/);
  await expect(page.getByRole('button', { name: /Daniel Okafor/ })).toBeVisible();
  await expect(page.getByText('Demo user', { exact: true })).toBeVisible();
});

test('the user menu switches user and signs out', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/team');
  const menu = page.getByRole('button', { name: /Maya Chen/ });
  await menu.click();
  await page.getByRole('menuitem', { name: /Switch demo user.*Daniel Okafor/ }).click();
  await expect(page.getByRole('button', { name: /Daniel Okafor/ })).toBeVisible();

  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Daniel Okafor/ })).toBeFocused();

  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/hermes\/sign-in$/);
  await expect(page.locator('h1')).toHaveText('Sign in to Hermes');
});

test('a next target outside Hermes is ignored', async ({ page }) => {
  await page.goto('/hermes/sign-in?next=https://evil.test');
  await page.getByRole('button', { name: /Maya Chen/ }).click();
  // the router drops trailing slashes, so Home is /hermes
  await expect(page).toHaveURL(/\/hermes\/?$/);
});

for (const path of HERMES_PATHS) {
  test(`page ${path}`, async ({ page }) => {
    // the sign-in page is the one page a signed-in visitor can still open
    if (path !== '/hermes/sign-in') await signInAs(page, 'p-maya');
    await page.goto(path);
    const meta = hermesPageMeta(path)!;
    await expect(page).toHaveTitle(meta.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', meta.description);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('header h1')).toHaveCount(0);
    const overflow = (await page.evaluate(() => document.documentElement.scrollWidth)) - page.viewportSize()!.width;
    expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0);
  });
}

test('an unknown project shows the not-found page', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/projects/zephyr');
  await expect(page.locator('h1')).toHaveText('No page at /hermes/projects/zephyr');
  await expect(page).toHaveTitle('Page not found · Hermes');
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(/\/hermes\/?$/);
});
