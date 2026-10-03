// The Hermes assistant: the dock, the panel and its shortcuts, answers with blocks, persistence across pages and the mobile sheet.

import type { Page } from '@playwright/test';
import { expect, signInAs, test } from './fixtures';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Hermes' }).or(page.getByRole('dialog', { name: 'Hermes' }));
const composer = (page: Page) => page.getByRole('textbox', { name: 'Ask Hermes' });

async function ask(page: Page, question: string) {
  await composer(page).fill(question);
  await composer(page).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/team');
  await expect(page.locator('h1')).toHaveText('Team');
});

test('the dock opens the panel on the composer, and Esc brings focus back', async ({ page }) => {
  const dock = page.getByRole('button', { name: 'Open Hermes' });
  await dock.click();
  await expect(panel(page)).toBeVisible();
  await expect(composer(page)).toBeFocused();
  // an empty thread greets and suggests
  await expect(panel(page).getByText('Hi Maya. Ask me about the team, hours, projects, code, Teams or AWS.')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'How are the projects going?' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(dock).toBeFocused();
});

test('/ and Ctrl+K open the panel, and / typed in the composer stays text', async ({ page }) => {
  await page.locator('body').press('/');
  await expect(panel(page)).toBeVisible();
  await expect(composer(page)).toBeFocused();

  await composer(page).pressSequentially('a/');
  await expect(panel(page)).toBeVisible();
  await expect(composer(page)).toHaveValue(/\/$/);

  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await page.keyboard.press('Control+K');
  await expect(panel(page)).toBeVisible();
  await expect(composer(page)).toBeFocused();
});

test('the Ask button in the header opens the panel', async ({ page }) => {
  const ask = page.getByRole('banner').getByRole('button', { name: 'Ask Hermes' });
  await ask.click();
  await expect(composer(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(ask).toBeFocused();
});

test('a projects question answers with a status card per project', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await ask(page, 'How are the projects going?');
  await expect(panel(page).getByText(/^(On track|At risk|Off track)$/)).toHaveCount(4);
  await expect(panel(page).getByText(/project.* on track\./).first()).toBeVisible();
  // once the answer is in, there's no live activity row next to it
  await expect(panel(page).locator('.ca-activity')).toHaveCount(0);
  await expect(panel(page).getByRole('link', { name: /Atlas/ }).first()).toBeVisible();
});

test('the conversation and a running answer survive a page change', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await ask(page, 'How is the team doing?');
  if (isMobile) {
    // the sheet is modal on a phone: close it, change page, and come back to it
    await page.keyboard.press('Escape');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();
    await page.getByRole('button', { name: 'Open Hermes' }).click();
  } else {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();
  }
  await expect(page).toHaveURL(/\/hermes\/projects$/);
  await expect(panel(page).locator('dl')).toBeVisible();
  await expect(panel(page).getByText('How is the team doing?')).toBeVisible();
  await expect(page).toHaveURL(/\/hermes\/projects$/);
});

test('a second question mid-answer stops the first', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await ask(page, 'How is the team doing?');
  await expect(panel(page).getByRole('button', { name: 'Stop' })).toBeVisible();
  // Maya (CTO) has no tickets of her own, so the second question is one whose answer for her carries a table
  await ask(page, 'How many hours did developers work this week?');
  const turns = panel(page).locator('[data-turn]');
  await expect(turns).toHaveCount(2);
  await expect(turns.nth(0).getByText('Stopped.')).toBeVisible();
  await expect(turns.nth(1).locator('table.as-table')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Send' })).toBeVisible();
});

test('a status update comes back as a draft that copies', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await ask(page, 'Write a status update for the team');
  await expect(panel(page).getByText('Demo — not sent')).toBeVisible();
  const draft = (await panel(page).locator('pre').textContent()) ?? '';
  expect(draft.length).toBeGreaterThan(20);
  await panel(page).getByRole('button', { name: 'Copy' }).click();
  await expect(panel(page).getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(draft);
});

test('clear, expand and close from the panel header', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await panel(page).getByRole('button', { name: 'How are the projects going?' }).click();
  await expect(panel(page).getByText('How are the projects going?')).toBeVisible();
  await expect(composer(page)).toBeFocused();

  await panel(page).getByRole('button', { name: 'Expand' }).click();
  await expect(panel(page)).toHaveAttribute('data-expanded', 'true');
  await panel(page).getByRole('button', { name: 'Collapse' }).click();
  await expect(panel(page)).not.toHaveAttribute('data-expanded', 'true');

  await panel(page).getByRole('button', { name: 'Clear conversation' }).click();
  await expect(panel(page).getByText(/^Hi Maya\./)).toBeVisible();

  await panel(page).getByRole('button', { name: 'Close' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Hermes' })).toBeFocused();
});

test('an answer that lands while the panel is closed leaves a badge, and switching user clears it', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await ask(page, 'What are my open tickets?');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open Hermes' }).getByRole('img', { name: 'New answer' })).toBeVisible();

  await page.getByRole('button', { name: /Maya Chen/ }).click();
  await page.getByRole('menuitem', { name: /Switch demo user.*Daniel Okafor/ }).click();
  await expect(page.getByRole('button', { name: /Daniel Okafor/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'New answer' })).toHaveCount(0);
});

test('on a phone the panel is a modal sheet that fits the screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Pixel 7 only');
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await expect(page.getByRole('dialog', { name: 'Hermes' })).toHaveAttribute('aria-modal', 'true');
  await expect(composer(page)).toBeFocused();
  await ask(page, 'How many hours did developers work this week?');
  await expect(panel(page).locator('svg[role="img"]')).toBeVisible();
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(width);
  // focus stays inside the sheet
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
});
