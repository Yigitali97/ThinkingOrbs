// The Hermes site: demo sign-in and its guard, every page's title, the not-found page, and what each page shows per role.

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
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

// ------------------------------------------------------------------ pages

const DEVELOPER_COPY = "Individual hours for other people are visible to managers. Here's your team's total instead.";
const composer = (page: Page) => page.getByRole('textbox', { name: 'Ask Hermes' });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Hermes' }).or(page.getByRole('dialog', { name: 'Hermes' }));

async function ask(page: Page, question: string) {
  await composer(page).fill(question);
  await composer(page).press('Enter');
}

test('Home greets Maya with the glance and the assistant in the page, and no dock', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await expect(page.locator('h1')).toHaveText(/^Good .*Maya$/);
  const glance = page.getByRole('region', { name: 'Today at a glance' });
  for (const label of ['Hours logged this week', 'PRs merged', 'Tickets closed', 'Open blockers']) {
    await expect(glance.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(composer(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Hermes' })).toHaveCount(0);
  // nothing has been cleared yet
  await expect(page.getByRole('region', { name: 'Recent conversations' })).toHaveCount(0);
});

test('a cleared conversation on Home comes back from Recent conversations', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await ask(page, 'How is the team doing?');
  const thread = page.getByRole('main').getByRole('list', { name: 'Conversation' });
  await expect(thread.locator('[data-turn="done"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Clear conversation' }).click();
  await expect(thread).toHaveCount(0);
  await expect(composer(page)).toBeFocused();
  const recent = page.getByRole('region', { name: 'Recent conversations' });
  await expect(recent.getByRole('button', { name: 'How is the team doing?' })).toBeVisible();

  await recent.getByRole('button', { name: 'How is the team doing?' }).click();
  await expect(thread.locator('[data-turn="done"]')).toHaveCount(1);
  await expect(thread.getByText('How is the team doing?', { exact: true })).toBeVisible();
  await expect(recent).toHaveCount(0);
});

test('Team as Sara: her own row and the Platform total, with the Developer copy', async ({ page }) => {
  await signInAs(page, 'p-sara');
  await page.goto('/hermes/team');
  await expect(page.getByText(DEVELOPER_COPY, { exact: true })).toBeVisible();
  const rows = page.getByRole('main').locator('table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('th')).toHaveText('Sara Lindqvist');
  await expect(rows.nth(1).locator('th')).toHaveText('Platform team total');
});

test('Team as Maya: everyone in the delivery teams, one row each', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/team');
  const names = page.getByRole('main').locator('table tbody tr th');
  await expect(names).toHaveCount(12);
  const all = await names.allTextContents();
  expect(all).toContain('Daniel Okafor');
  expect(all).toContain('Omar Reyes');
  expect(all).not.toContain('Maya Chen');
  expect(all).not.toContain('Elena Rossi');
  await expect(page.getByText(DEVELOPER_COPY)).toHaveCount(0);
});

test('Projects as Sara: her team’s two projects, and another team’s project is not found', async ({ page }) => {
  await signInAs(page, 'p-sara');
  await page.goto('/hermes/projects');
  const cards = page.getByRole('main').locator('.as-status');
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole('main').getByRole('link', { name: 'Open Atlas' })).toBeVisible();

  await page.goto('/hermes/projects/beacon');
  await expect(page.locator('h1')).toHaveText('No page at /hermes/projects/beacon');
  await expect(page).toHaveTitle('Page not found · Hermes');
});

test('Atlas as Maya: status, blocked tickets and the budget', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/projects/atlas');
  await expect(page.locator('h1')).toHaveText('Atlas');
  await expect(page.getByRole('main').getByText('At risk', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Blocked tickets' }).locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Budget' })).toBeVisible();
  await expect(page.getByText(/^Last sprint: \d+ \/ \d+ points$/)).toBeVisible();
});

test('Atlas as Sara: no budget', async ({ page }) => {
  await signInAs(page, 'p-sara');
  await page.goto('/hermes/projects/atlas');
  await expect(page.getByRole('region', { name: 'Blocked tickets' }).locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('main').getByText(/budget/i)).toHaveCount(0);
});

test('on a project page, "How is this one doing?" answers about that project', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/projects/atlas');
  await expect(page.locator('h1')).toHaveText('Atlas');
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await panel(page).getByRole('button', { name: 'How is this one doing?' }).click();
  await expect(panel(page).locator('[data-turn="done"]')).toHaveCount(1);
  await expect(panel(page).getByText(/Atlas is (on track|at risk|off track)/)).toBeVisible();
});

test('Connections: a simulated Jira outage shows on the page and in the answer', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/connections');
  const rows = page.getByRole('main').getByRole('listitem');
  for (const system of ['Directory', 'Clockify', 'Jira', 'GitHub', 'Teams', 'AWS']) {
    await expect(rows.filter({ has: page.getByRole('heading', { name: system, exact: true }) })).toContainText('Connected');
  }
  for (const later of ['Slack', 'Google Drive', 'Salesforce']) {
    await expect(rows.filter({ has: page.getByRole('heading', { name: later, exact: true }) })).toContainText('Coming later');
  }

  const jira = rows.filter({ has: page.getByRole('heading', { name: 'Jira', exact: true }) });
  await jira.getByRole('checkbox', { name: /Simulate an outage/ }).check();
  await expect(jira).toContainText('Outage (simulated)');

  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await ask(page, 'How is the team doing?');
  await expect(panel(page).getByText("Jira didn't respond, so closed tickets and blockers aren't included.")).toBeVisible();
});

// ------------------------------------------------------------------ smoke, roles and switching

const MANAGER_COPY = 'Individual hours outside your team are visible to leadership. Other teams are shown as totals.';

// Every Hermes page: right title, one h1, no sideways scroll (at this project's viewport and at 375px), no serious axe violations.
for (const path of HERMES_PATHS) {
  test(`smoke ${path}`, async ({ page }) => {
    // the sign-in page is the one page a signed-in visitor can still open
    if (path !== '/hermes/sign-in') await signInAs(page, 'p-maya');
    await page.goto(path);
    await expect(page).toHaveTitle(hermesPageMeta(path)!.title);
    const h1 = page.locator('h1:visible');
    await expect(h1).toHaveCount(1);
    await expect(h1).toBeVisible();

    const overflow = async () => (await page.evaluate(() => document.documentElement.scrollWidth)) - (await page.evaluate(() => window.innerWidth));
    expect(await overflow(), 'page is wider than the viewport').toBeLessThanOrEqual(0);

    // measure contrast once the page's fade-in has finished
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.route')!).opacity)).toBe('1');
    const axe = await new AxeBuilder({ page }).include('main').include('header').exclude('canvas').exclude('svg').analyze();
    const serious = axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    expect(serious, 'accessibility violations').toEqual([]);

    // and again at exactly 375px wide, once the page has re-laid itself out
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.locator('h1:visible')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.route')!).opacity)).toBe('1');
    expect(await overflow(), 'page is wider than 375px').toBeLessThanOrEqual(0);
  });
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await expect(composer(page)).toBeFocused();
}

// The side panel overlays the header's user menu below 1400px and the phone's sheet is modal, so close the panel first (a running reply
// keeps going), switch user through the menu, then reopen the panel.
async function switchTo(page: Page, from: string, to: string) {
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(from) }).click();
  await page.getByRole('menuitem', { name: new RegExp(`Switch demo user.*${to}`) }).click();
  await expect(page.getByRole('button', { name: new RegExp(to) })).toBeVisible();
  await openPanel(page);
}

test('role difference: Maya sees every developer, Sara only herself and her team total', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/team');
  await openPanel(page);
  await ask(page, 'How many hours did developers work this week?');
  const table = panel(page).locator('[data-turn="done"]').last().locator('table.as-table');
  await expect(table).toBeVisible();
  expect(await table.locator('tbody tr').count(), 'rows for every developer').toBeGreaterThan(2);

  await switchTo(page, 'Maya Chen', 'Sara Lindqvist');
  await expect(panel(page).getByText(/^Hi Sara\./)).toBeVisible();
  await expect(panel(page).locator('[data-turn]')).toHaveCount(0);

  await ask(page, 'How many hours did developers work this week?');
  const answer = panel(page).locator('[data-turn="done"]');
  await expect(answer).toHaveCount(1);
  await expect(answer.getByText(DEVELOPER_COPY, { exact: true })).toBeVisible();
  const rows = answer.locator('table.as-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('th, td').first()).toHaveText('You');
  await expect(rows.nth(1).locator('th, td').first()).toHaveText('Platform team total');
});

test('switching user while a reply is still being written leaves an empty thread and no old answer', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/team');
  await openPanel(page);
  const asked = Date.now();
  await ask(page, 'How is the team doing?');
  // the question is in; do not wait for the reply
  await expect(panel(page).locator('[data-turn]')).toHaveCount(1);

  await switchTo(page, 'Maya Chen', 'Sara Lindqvist');

  const stats = panel(page).locator('.as-stat');
  const turns = panel(page).locator('[data-turn]');
  // at least 3 s, and long enough to outlast the old reply, which takes about 7 s to finish
  const until = Math.max(Date.now() + 3000, asked + 10_000);
  let polls = 0;
  while (Date.now() < until) {
    expect(await turns.count(), 'the old question or reply came back').toBe(0);
    expect(await stats.count(), 'a stat block from the old reply appeared').toBe(0);
    polls++;
    await page.waitForTimeout(100);
  }
  expect(polls).toBeGreaterThan(10);
  // the thread still works for the new user
  await expect(panel(page).getByText(/^Hi Sara\./)).toBeVisible();
  await ask(page, 'How is the team doing?');
  await expect(panel(page).locator('[data-turn="done"]')).toHaveCount(1);
});

test('AWS costs: Maya gets the chart and the cause, Daniel is told they are for leadership', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/team');
  await openPanel(page);
  await ask(page, 'Why did AWS costs go up?');
  const answer = panel(page).locator('[data-turn="done"]');
  await expect(answer).toHaveCount(1);
  await expect(answer.locator('svg[role="img"]')).toBeVisible();
  await expect(answer.getByText(/12 extra instances/)).toBeVisible();

  await switchTo(page, 'Maya Chen', 'Daniel Okafor');
  await expect(panel(page).locator('[data-turn]')).toHaveCount(0);
  await ask(page, 'Why did AWS costs go up?');
  const denied = panel(page).locator('[data-turn="done"]');
  await expect(denied).toHaveCount(1);
  await expect(denied.getByText(/AWS costs are visible to leadership\./)).toBeVisible();
  await expect(denied.getByText(/I can show AWS service health instead\./)).toBeVisible();
  await expect(denied.locator('svg[role="img"]')).toHaveCount(0);
});

test('Team as Daniel (Manager): Platform people by name, the other team as a total, and the Manager copy', async ({ page }) => {
  await signInAs(page, 'p-daniel');
  await page.goto('/hermes/team');
  const rows = page.getByRole('main').locator('table tbody tr');
  await expect(page.getByText(MANAGER_COPY, { exact: true })).toBeVisible();
  await expect(rows.filter({ hasText: 'Product team total' })).toHaveCount(1);
  const names = await page.getByRole('main').locator('table tbody tr th').allTextContents();
  expect(names).toContain('Product team total');
  expect(names).toContain('Sara Lindqvist');
  expect(names).not.toContain('Platform team total');
  // every row besides the Product total is a named Platform person
  expect(names.length).toBeGreaterThan(3);
  for (const row of await rows.all()) {
    const name = await row.locator('th').innerText();
    if (name !== 'Product team total') await expect(row).toContainText('Platform');
  }
  await expect(page.getByText(DEVELOPER_COPY)).toHaveCount(0);
});
