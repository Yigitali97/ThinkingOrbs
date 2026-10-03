// The Hermes workspace: demo sign-in and its guard, the rail, the conversation and the canvas that shows a dashboard beside it
// (a modal sheet below 1024px), every route's title, one h1 and accessibility, and what each view shows per role.
// The bot: the first screen's hero with the systems orbit and the brief, the docked bot, and that it is always on screen.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { HERMES_PATHS, hermesPageMeta } from '../demo/hermes/routes';
import { expect, signInAs, test } from './fixtures';

const DEVELOPER_COPY = "Individual hours for other people are visible to managers. Here's your team's total instead.";
const MANAGER_COPY = 'Individual hours outside your team are visible to leadership. Other teams are shown as totals.';

const narrow = (page: Page) => page.viewportSize()!.width < 1024;
const composer = (page: Page) => page.getByRole('textbox', { name: 'Ask Hermes' });
const conversation = (page: Page) => page.getByRole('region', { name: 'Conversation', exact: true });
const canvas = (page: Page) => page.locator('[data-canvas]');
const rail = (page: Page) => page.locator('[data-rail]');
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Menu' });
const dashboards = (page: Page) => page.getByRole('navigation', { name: 'Dashboards' });
const turns = (page: Page) => conversation(page).locator('[data-turn]');
const brief = (page: Page) => page.locator('[data-brief]');
const systemButtons = (page: Page) => page.getByRole('button', { name: /^Ask about / });
const MAYA_ONLY = 'Platform and Product';

/**
 * Whether a bot is on screen: inside the viewport, and the topmost thing at its middle is the bot or the button laid over it,
 * so a sheet, a drawer or its backdrop isn't covering it.
 */
function botOnScreen(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-bot]')].some((bot) => {
      const r = bot.getBoundingClientRect();
      if (r.width < 40 || r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight) return false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (bot.contains(hit) || !!hit.closest('[data-bot-host]')?.contains(bot));
    }),
  );
}

/** Records every state the conversation's bot shows, from now on. */
async function recordBotStates(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __states: string[] };
    w.__states = [];
    const tick = () => {
      const s = document.querySelector<HTMLElement>('[data-bot-host] [data-bot]')?.dataset.state;
      if (s && w.__states[w.__states.length - 1] !== s) w.__states.push(s);
      requestAnimationFrame(tick);
    };
    tick();
  });
  return () => page.evaluate(() => (window as unknown as { __states: string[] }).__states);
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function ask(page: Page, question: string) {
  await composer(page).fill(question);
  await composer(page).press('Enter');
}

/** On a desktop the rail is always there; below 1024px it is a drawer behind the Menu button. */
async function openRail(page: Page) {
  if (!narrow(page)) return;
  if (await drawer(page).count()) return;
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(drawer(page)).toBeVisible();
}

async function closeRail(page: Page) {
  if (!narrow(page) || !(await drawer(page).count())) return;
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
}

/** Opens a dashboard from the rail. */
async function openDashboard(page: Page, name: string) {
  await openRail(page);
  await dashboards(page).getByRole('link', { name, exact: true }).click();
  await expect(canvas(page)).toBeVisible();
}

async function closeCanvas(page: Page) {
  await canvas(page).getByRole('button', { name: 'Close' }).click();
  await expect(canvas(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/hermes$/);
}

/** Switches demo user through the rail's user menu. Below 1024px the canvas sheet is modal, so the caller closes it first. */
async function switchTo(page: Page, from: string, to: string) {
  await openRail(page);
  await rail(page).getByRole('button', { name: new RegExp(from) }).click();
  await page.getByRole('menuitem', { name: new RegExp(`Switch demo user.*${to}`) }).click();
  await expect(rail(page).getByRole('button', { name: new RegExp(to) })).toBeVisible();
  await closeRail(page);
}

/** Waits for the canvas to finish sliding in, and any screen to finish fading in. */
async function settled(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-canvas], .route')].every((el) => el.getAnimations().every((a) => a.playState !== 'running')),
      ),
    )
    .toBe(true);
}

// ------------------------------------------------------------------ sign-in

test('signed out, a page sends you to sign-in and back after you pick a user', async ({ page }) => {
  await page.goto('/hermes/team');
  await expect(page).toHaveURL(/\/hermes\/sign-in\?next=%2Fhermes%2Fteam$/);
  await expect(page.locator('h1')).toHaveText('Sign in to Hermes');
  await expect(page.getByText('This is a demo. Pick a sample employee to sign in as — no password needed.')).toBeVisible();
  await expect(page.locator('[data-bot]')).toBeVisible();

  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await expect(page).toHaveURL(/\/hermes\/team$/);
  await expect(canvas(page).getByRole('heading', { level: 2, name: 'Team' })).toBeAttached();
  if (narrow(page)) await closeCanvas(page);
  await openRail(page);
  await expect(rail(page).getByRole('button', { name: /Daniel Okafor/ })).toBeVisible();
  await expect(rail(page).getByText('Demo user', { exact: true })).toBeVisible();
});

test('the user menu switches user and signs out', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await openRail(page);
  const menu = rail(page).getByRole('button', { name: /Maya Chen/ });
  // aria-controls points at the menu only while it exists
  await expect(menu).not.toHaveAttribute('aria-controls');
  await menu.click();
  const controls = await menu.getAttribute('aria-controls');
  await expect(page.locator(`[id="${controls}"]`)).toHaveRole('menu');
  await page.getByRole('menuitem', { name: /Switch demo user.*Daniel Okafor/ }).click();
  const daniel = rail(page).getByRole('button', { name: /Daniel Okafor/ });
  await expect(daniel).toBeVisible();
  await expect(page.locator('h1')).toHaveText(/^Good .*Daniel$/);

  await daniel.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toHaveCount(0);
  await expect(daniel).toBeFocused();

  await daniel.click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/hermes\/sign-in$/);
  await expect(page.locator('h1')).toHaveText('Sign in to Hermes');
});

test('a next target outside Hermes is ignored', async ({ page }) => {
  await page.goto('/hermes/sign-in?next=https://evil.test');
  await page.getByRole('button', { name: /Maya Chen/ }).click();
  // the router drops trailing slashes, so the conversation is /hermes
  await expect(page).toHaveURL(/\/hermes\/?$/);
});

// ------------------------------------------------------------------ every route

// Each route: right title and description, exactly one h1 in the DOM (Ruling R2), no sideways scroll at this project's width
// and at 375px, and no serious axe violations once the canvas has slid in.
for (const path of HERMES_PATHS) {
  test(`route ${path}`, async ({ page }) => {
    // the sign-in page is the one page a signed-in visitor can still open
    if (path !== '/hermes/sign-in') await signInAs(page, 'p-maya');
    await page.goto(path);
    const meta = hermesPageMeta(path)!;
    await expect(page).toHaveTitle(meta.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', meta.description);
    await expect(page.locator('h1')).toHaveCount(1);

    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow(), 'page is wider than the viewport').toBeLessThanOrEqual(0);

    await settled(page);
    const axe = await new AxeBuilder({ page }).include('body').exclude('canvas').exclude('svg').analyze();
    const serious = axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    expect(serious, 'accessibility violations').toEqual([]);

    // and again at exactly 375px wide, once the page has re-laid itself out
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.locator('h1')).toHaveCount(1);
    await settled(page);
    expect(await overflow(), 'page is wider than 375px').toBeLessThanOrEqual(0);
  });
}

test('mid-conversation the one h1 is a visually hidden Hermes', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await expect(page.locator('h1')).toHaveText(/^Good (morning|afternoon|evening), Maya$/);
  await expect(page.locator('h1')).toBeVisible();
  await ask(page, 'How is the team doing?');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Hermes');
  const box = await page.locator('h1').boundingBox();
  expect(box!.width * box!.height).toBeLessThanOrEqual(1);
});

// ------------------------------------------------------------------ the bot

test('first screen: the bot on its pedestal among the systems, a greeting, the composer, three chips and a brief', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  const hero = page.locator('.hero [data-bot]');
  await expect(hero).toBeVisible();
  expect((await hero.boundingBox())!.height).toBeGreaterThanOrEqual(160);
  await expect(page.locator('h1')).toHaveText(/^Good (morning|afternoon|evening), Maya$/);
  await expect(systemButtons(page)).toHaveCount(6);
  for (const name of ['Directory', 'Clockify', 'Jira', 'GitHub', 'Teams', 'AWS']) {
    await expect(page.getByRole('button', { name: `Ask about ${name}` })).toBeVisible();
  }
  await expect(composer(page)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Suggestions' }).getByRole('button')).toHaveCount(3);
  await expect(page.locator('.glance')).toHaveCount(0);
  await expect(brief(page)).toContainText('PRs merged', { timeout: 10_000 });
  await expect(brief(page)).toHaveAttribute('data-brief', 'done');
  // the brief is not an answer: no "Stopped." and no thread yet
  await expect(turns(page)).toHaveCount(0);
  expect(await botOnScreen(page)).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the brief as Sara is about the Platform team', async ({ page }) => {
  await signInAs(page, 'p-sara');
  await page.goto('/hermes');
  await expect(brief(page)).toContainText('Platform', { timeout: 10_000 });
  await expect(brief(page)).not.toContainText(MAYA_ONLY);
});

test('while the brief reads the systems, they light up on the orbit', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await expect(page.locator('[data-system][data-active="true"]').first()).toBeAttached({ timeout: 10_000 });
  await expect(brief(page)).toHaveAttribute('data-brief', 'done', { timeout: 10_000 });
  await expect(page.locator('[data-system][data-active="true"]')).toHaveCount(0);
});

test('a system on the orbit asks about it', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await page.getByRole('button', { name: 'Ask about AWS' }).click();
  await expect(conversation(page).getByText('Why did AWS costs go up?', { exact: true })).toBeVisible();
  await expect(turns(page)).toHaveAttribute('data-turn', 'done', { timeout: 20_000 });
});

test('the bot thinks, speaks, then rests as an answer comes in, and the dock names the systems it reads', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  const states = await recordBotStates(page);
  await ask(page, 'How is the team doing?');
  await expect(page.locator('.docked-status')).toContainText(/^Reading /);
  await expect(turns(page)).toHaveAttribute('data-turn', 'done', { timeout: 20_000 });
  await expect(page.locator('.docked-status')).toHaveCount(0);
  await expect.poll(states).toContain('idle');
  const seen = await states();
  const thinking = seen.indexOf('thinking');
  const speaking = seen.indexOf('speaking', thinking);
  expect(thinking, `states seen: ${seen.join(' → ')}`).toBeGreaterThanOrEqual(0);
  expect(speaking, `states seen: ${seen.join(' → ')}`).toBeGreaterThan(thinking);
  expect(['idle', 'happy']).toContain(seen[seen.length - 1]);
});

test('clicking the docked bot puts you in the message box', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await ask(page, 'How is the team doing?');
  await composer(page).blur();
  await page.getByRole('button', { name: 'Write to Hermes' }).click();
  await expect(composer(page)).toBeFocused();
});

// Review Focus 1: at every width, on every signed-in route, the bot stays on screen, over the sheet and beside the drawer too.
for (const width of [1280, 900, 375]) {
  test(`the bot is always on screen at ${width}px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'the widths are set on the desktop project');
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: 812 });
    await signInAs(page, 'p-maya');
    for (const path of HERMES_PATHS.filter((p) => p !== '/hermes/sign-in')) {
      await page.goto(path);
      await expect(composer(page)).toBeAttached();
      if (width < 1024 && path !== '/hermes') {
        // the sheet is open on arrival: the bot is above it, then close it, ask, and come back to it
        await expect(canvas(page)).toBeVisible();
        await settled(page);
        expect(await botOnScreen(page), `${path}, sheet over the first screen`).toBe(true);
        await closeCanvas(page);
        await ask(page, 'How is the team doing?');
        await page.goBack();
        await expect(canvas(page)).toBeVisible();
        await settled(page);
      } else {
        await ask(page, 'How is the team doing?');
      }
      await expect(turns(page)).toHaveCount(1);
      expect(await botOnScreen(page), `${path} at ${width}px`).toBe(true);
      if (width < 1024) {
        const sheetOpen = (await canvas(page).count()) > 0;
        if (sheetOpen) await closeCanvas(page);
        await openRail(page);
        expect(await botOnScreen(page), `${path} with the drawer open`).toBe(true);
        const bot = (await page.locator('[data-bot-host] [data-bot]').boundingBox())!;
        expect(overlaps(bot, (await drawer(page).boundingBox())!), 'the bot sits beside the drawer').toBe(false);
        await closeRail(page);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} is wider than ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test('over the sheet the bot keeps clear of the close button and the view', async ({ page }) => {
  test.skip(!narrow(page), 'the sheet is below 1024px');
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/connections');
  await expect(canvas(page)).toBeVisible();
  await settled(page);
  expect(await botOnScreen(page)).toBe(true);
  const bot = (await page.locator('[data-bot-host] [data-bot]').boundingBox())!;
  expect(overlaps(bot, (await canvas(page).getByRole('button', { name: 'Close' }).boundingBox())!)).toBe(false);
  expect(overlaps(bot, (await canvas(page).locator('.canvas-body').boundingBox())!), 'the view scrolls above the bot').toBe(false);
});

test('Show me the team dashboard: wide, the canvas opens beside the conversation and the composer keeps focus', async ({ page }) => {
  test.skip(narrow(page), 'the canvas opens beside the conversation from 1024px');
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await ask(page, 'Show me the team dashboard');
  await expect(page).toHaveURL(/\/hermes\/team$/);
  await expect(canvas(page).getByRole('heading', { level: 2, name: 'Team' })).toBeAttached();
  // Review Focus 4: the turn stays and the reply that opened it finishes
  await expect(turns(page)).toHaveCount(1);
  await expect(turns(page)).toHaveAttribute('data-turn', 'done', { timeout: 20_000 });
  await expect(turns(page).getByText("Here's the Team dashboard.")).toBeVisible();
  // Ruling R6: Hermes opening a view never takes your focus
  await expect(composer(page)).toBeFocused();
  await page.keyboard.type('and the projects');
  await expect(composer(page)).toHaveValue('and the projects');
  // closing it gives focus back to the composer, which had it
  await closeCanvas(page);
  await expect(composer(page)).toBeFocused();
});

test('Show me the team dashboard: narrow, the answer offers Open Team instead of covering the conversation', async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 375, height: 812 });
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await ask(page, 'Show me the team dashboard');
  await expect(turns(page)).toHaveAttribute('data-turn', 'done', { timeout: 20_000 });
  const chip = turns(page).getByRole('link', { name: 'Open Team' });
  await expect(chip).toBeVisible();
  await expect(page).toHaveURL(/\/hermes$/);
  await expect(canvas(page)).toHaveCount(0);
  await expect(composer(page)).toBeFocused();
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/hermes\/team$/);
  await expect(page.getByRole('dialog', { name: 'Team' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(canvas(page)).toHaveCount(0);
  await expect(chip).toBeFocused();
});

test('closing the canvas returns focus to the control that opened the view now showing', async ({ page }) => {
  test.skip(narrow(page), 'desktop rail');
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await dashboards(page).getByRole('link', { name: 'Team', exact: true }).click();
  await expect(canvas(page)).toBeFocused();
  const projects = dashboards(page).getByRole('link', { name: 'Projects', exact: true });
  await projects.click();
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Projects');
  await expect(canvas(page)).toBeFocused();
  await closeCanvas(page);
  await expect(projects).toBeFocused();
});

// Review Focus 2: the brief racing a question, a new conversation and a user switch
test('a question asked while the brief streams stops the brief and is answered', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await expect(brief(page)).toHaveAttribute('data-brief', /^(working|writing)$/);
  await ask(page, 'How is the team doing?');
  await expect(turns(page)).toHaveAttribute('data-turn', 'done', { timeout: 20_000 });
  // the brief stopped: what it had said stays, with no "Stopped." note; with nothing said, it isn't shown at all
  expect(await brief(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-brief')))).toEqual(
    expect.not.arrayContaining(['working', 'writing', 'done']),
  );
  await expect(conversation(page).getByText('Stopped.')).toHaveCount(0);
  await expect(turns(page).locator('.as-stat')).toBeVisible();

  await openRail(page);
  await rail(page).getByRole('button', { name: 'New conversation' }).click();
  await expect(page.locator('h1')).toHaveText(/^Good .*Maya$/);
  await expect(page.locator('.hero [data-bot]')).toBeVisible();
  await expect(brief(page)).toContainText('PRs merged', { timeout: 10_000 });
  await openRail(page);
  await expect(rail(page).getByRole('button', { name: 'How is the team doing?', exact: true })).toBeVisible();
  await expect(rail(page).getByRole('button', { name: /PRs merged/ })).toHaveCount(0);
});

test('switching user mid-brief shows only the new user’s greeting and brief', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await expect(brief(page)).toHaveAttribute('data-brief', /^(working|writing)$/);
  await switchTo(page, 'Maya Chen', 'Sara Lindqvist');
  await expect(page.locator('h1')).toHaveText(/^Good .*Sara$/);
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    expect(await page.locator('body').innerText(), 'Maya’s brief came back').not.toContain(MAYA_ONLY);
    await page.waitForTimeout(100);
  }
  await expect(brief(page)).toContainText('the Platform team', { timeout: 10_000 });
  await expect(brief(page)).toHaveCount(1);
});

// ------------------------------------------------------------------ layout and routing

test('/hermes shows the rail and the conversation, and no canvas', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await expect(conversation(page)).toBeVisible();
  await expect(composer(page)).toBeVisible();
  await expect(canvas(page)).toHaveCount(0);
  if (narrow(page)) {
    await expect(dashboards(page)).toHaveCount(0);
    await openRail(page);
  }
  await expect(rail(page).getByRole('button', { name: 'New conversation' })).toBeVisible();
  await expect(dashboards(page).getByRole('link', { name: 'Team', exact: true })).toBeVisible();
  // no top header, dock or side panel any more
  await expect(page.getByRole('button', { name: 'Open Hermes' })).toHaveCount(0);
  await expect(page.locator('.as-panel, .as-dock, .topbar')).toHaveCount(0);
});

test('/hermes/team shows the canvas with Team and the conversation beside or under it', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/team');
  await expect(canvas(page)).toBeVisible();
  await expect(canvas(page).getByRole('heading', { level: 2, name: 'Team' })).toBeAttached();
  await expect(canvas(page).locator('table tbody tr').first()).toBeVisible();
  await expect(conversation(page)).toBeAttached();
  if (narrow(page)) {
    await expect(page.getByRole('dialog', { name: 'Team' })).toHaveAttribute('aria-modal', 'true');
  } else {
    await expect(page.getByRole('complementary', { name: 'Team' })).toBeVisible();
    await expect(composer(page)).toBeVisible();
    const c = (await canvas(page).boundingBox())!;
    const talk = (await conversation(page).boundingBox())!;
    expect(talk.x + talk.width, 'the conversation sits beside the canvas').toBeLessThanOrEqual(c.x + 1);
    expect(c.width).toBeGreaterThanOrEqual(420);
  }
});

test('closing the canvas goes back to /hermes, and back and forward toggle it', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await openDashboard(page, 'Team');
  await expect(page).toHaveURL(/\/hermes\/team$/);
  await closeCanvas(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/hermes\/team$/);
  await expect(canvas(page).getByRole('heading', { level: 2, name: 'Team' })).toBeAttached();
  await page.goForward();
  await expect(page).toHaveURL(/\/hermes$/);
  await expect(canvas(page)).toHaveCount(0);
});

test('opening and closing the canvas through the rail never stops a reply that is streaming', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await ask(page, 'How is the team doing?');
  await expect(turns(page)).toHaveAttribute('data-turn', /^(working|writing)$/);
  await openDashboard(page, 'Team');
  // below 1024px the sheet covers the rail, so close it before picking the next one
  if (narrow(page)) await closeCanvas(page);
  await openDashboard(page, 'Projects');
  await closeCanvas(page);
  // still the same reply, still running, and it finishes
  await expect(turns(page)).toHaveCount(1);
  await expect(turns(page)).toHaveAttribute('data-turn', /^(working|writing|done)$/);
  await expect(turns(page)).toHaveAttribute('data-turn', 'done', { timeout: 20_000 });
  await expect(turns(page).getByText('Stopped.')).toHaveCount(0);
  await expect(turns(page).locator('.as-stat')).toBeVisible();
});

test('a link in an answer opens its view in the canvas and keeps the conversation', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await ask(page, 'How are the projects going?');
  await expect(turns(page)).toHaveAttribute('data-turn', 'done', { timeout: 20_000 });
  await turns(page).getByRole('link', { name: 'Open Atlas' }).click();
  await expect(page).toHaveURL(/\/hermes\/projects\/atlas$/);
  await expect(canvas(page).getByRole('heading', { level: 2, name: 'Atlas' })).toBeAttached();
  await expect(turns(page)).toHaveCount(1);
});

test('opening a view moves focus to the canvas, and closing it returns focus to the rail link', async ({ page }) => {
  test.skip(narrow(page), 'desktop rail');
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  const team = dashboards(page).getByRole('link', { name: 'Team', exact: true });
  await team.focus();
  await page.keyboard.press('Enter');
  await expect(canvas(page)).toBeFocused();
  await closeCanvas(page);
  await expect(team).toBeFocused();
});

test('/ and Ctrl+K go to the composer, and / typed in the composer stays text', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await page.locator('body').press('/');
  await expect(composer(page)).toBeFocused();
  await composer(page).pressSequentially('a/');
  await expect(composer(page)).toHaveValue('a/');
  await composer(page).blur();
  await page.keyboard.press('Control+K');
  await expect(composer(page)).toBeFocused();
});

// ------------------------------------------------------------------ the rail

test('rail: dashboard links open their view and mark it as current', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await openRail(page);
  for (const name of ['Team', 'Projects', 'Connections']) {
    await expect(dashboards(page).getByRole('link', { name, exact: true })).not.toHaveAttribute('aria-current');
  }
  await openDashboard(page, 'Projects');
  await expect(page).toHaveURL(/\/hermes\/projects$/);
  await expect(canvas(page).getByRole('heading', { level: 2, name: 'Projects' })).toBeAttached();
  // below 1024px picking a link closes the drawer, and the sheet covers the rail
  if (narrow(page)) {
    await expect(drawer(page)).toHaveCount(0);
    return;
  }
  await expect(dashboards(page).getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute('aria-current', 'page');
  await openDashboard(page, 'Team');
  await expect(dashboards(page).getByRole('link', { name: 'Team', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(dashboards(page).getByRole('link', { name: 'Projects', exact: true })).not.toHaveAttribute('aria-current');
  // a project counts as being in Projects
  await page.goto('/hermes/projects/atlas');
  await expect(dashboards(page).getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute('aria-current', 'true');
});

test('rail: New conversation files the current one away, and picking it brings it back', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await ask(page, 'How is the team doing?');
  await expect(turns(page)).toHaveAttribute('data-turn', 'done', { timeout: 20_000 });

  await openRail(page);
  const current = rail(page).getByRole('button', { name: /How is the team doing\?.*Current conversation/ });
  await expect(current).toHaveAttribute('aria-current', 'true');
  await rail(page).getByRole('button', { name: 'New conversation' }).click();
  await expect(turns(page)).toHaveCount(0);
  await expect(composer(page)).toBeFocused();
  await expect(page.locator('h1')).toHaveText(/^Good .*Maya$/);

  await openRail(page);
  const past = rail(page).getByRole('button', { name: 'How is the team doing?', exact: true });
  await expect(past).toBeVisible();
  await past.click();
  await expect(turns(page)).toHaveCount(1);
  await expect(turns(page)).toHaveAttribute('data-turn', 'done');
  await expect(conversation(page).getByText('How is the team doing?', { exact: true })).toBeVisible();
  await openRail(page);
  await expect(rail(page).getByRole('button', { name: 'How is the team doing?', exact: true })).toHaveCount(0);
});

test('rail: at 1024px and up it collapses to an icon strip and expands again', async ({ page }) => {
  test.skip(narrow(page), 'desktop rail');
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  const wide = (await rail(page).boundingBox())!.width;
  expect(wide).toBeGreaterThanOrEqual(220);
  await rail(page).getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect.poll(async () => (await rail(page).boundingBox())!.width).toBeLessThanOrEqual(72);
  // the links keep their names as icons
  await expect(dashboards(page).getByRole('link', { name: 'Team', exact: true })).toBeVisible();
  await rail(page).getByRole('button', { name: 'Expand sidebar' }).click();
  await expect.poll(async () => (await rail(page).boundingBox())!.width).toBeGreaterThanOrEqual(220);
});

// ------------------------------------------------------------------ below 1024px

for (const width of [900, 0]) {
  test(`below 1024px${width ? ` (${width}px)` : ''}: Menu opens the rail as a drawer, and the canvas is a modal sheet`, async ({
    page,
    isMobile,
  }) => {
    if (width) {
      test.skip(isMobile, 'the phone runs the 0 case');
      await page.setViewportSize({ width, height: 800 });
    } else {
      test.skip(!isMobile, 'Pixel 7 only');
    }
    await signInAs(page, 'p-maya');
    await page.goto('/hermes');
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.click();
    await expect(drawer(page)).toHaveAttribute('aria-modal', 'true');
    for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'Tab stays in the drawer').toBe(true);
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);
    await expect(menu).toBeFocused();

    // the backdrop closes it too
    await menu.click();
    await page.locator('[data-rail-backdrop]').click({ position: { x: page.viewportSize()!.width - 10, y: 200 } });
    await expect(drawer(page)).toHaveCount(0);

    await openDashboard(page, 'Team');
    const sheet = page.getByRole('dialog', { name: 'Team' });
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet).toBeFocused();
    for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-canvas]')), 'Tab stays in the sheet').toBe(true);
    await page.keyboard.press('Escape');
    await expect(canvas(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/hermes$/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

// ------------------------------------------------------------------ not found and hidden projects

test('an unknown address shows a Not found canvas beside the conversation', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/projects/zephyr');
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Not found');
  await expect(canvas(page).getByRole('heading', { level: 2, name: 'No page at /hermes/projects/zephyr' })).toBeAttached();
  await expect(page).toHaveTitle('Page not found · Hermes');
  await expect(conversation(page)).toBeAttached();
  await closeCanvas(page);
});

test('Sara at Beacon, another team’s project: a Not found canvas and the conversation intact', async ({ page }) => {
  await signInAs(page, 'p-sara');
  await page.goto('/hermes/projects/beacon');
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Not found');
  await expect(page).toHaveTitle('Page not found · Hermes');
  await expect(canvas(page).getByText(/budget/i)).toHaveCount(0);
  await expect(conversation(page)).toBeAttached();
  await expect(composer(page)).toBeAttached();
});

test('Maya sees Beacon’s budget; switching to Sara turns the canvas into Not found at once', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/projects/beacon');
  await expect(canvas(page).getByRole('heading', { name: 'Budget' })).toBeVisible();
  if (narrow(page)) {
    // the sheet is modal: close it, switch, and come back to the same address
    await closeCanvas(page);
    await switchTo(page, 'Maya Chen', 'Sara Lindqvist');
    await page.goBack();
  } else {
    await switchTo(page, 'Maya Chen', 'Sara Lindqvist');
  }
  await expect(page).toHaveURL(/\/hermes\/projects\/beacon$/);
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Not found');
  await expect(canvas(page).getByRole('heading', { name: 'Budget' })).toHaveCount(0);
  await expect(page).toHaveTitle('Page not found · Hermes');
});

test('Maya sees Atlas’s budget; as Sara the same view has none', async ({ page }) => {
  test.skip(narrow(page), 'the switch with the canvas open needs the desktop rail');
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/projects/atlas');
  await expect(canvas(page).getByRole('heading', { name: 'Budget' })).toBeVisible();
  await switchTo(page, 'Maya Chen', 'Sara Lindqvist');
  await expect(canvas(page).getByRole('region', { name: 'Blocked tickets' }).locator('tbody tr')).toHaveCount(3);
  await expect(canvas(page).getByText(/budget/i)).toHaveCount(0);
});

// A static host (GitHub Pages) has no file for an unknown address, so it answers with dist/404.html and a 404 status.
// The preview server rewrites /hermes/* instead, so route those requests to 404.html here, the way the host would.
test.describe('on a static host', () => {
  // an array option is passed as [value, options], or Playwright would read the array itself as that pair
  test.use({ allowErrors: [[/\/hermes\/projects\/zephyr$/, /\/hermes\/nowhere$/, /\/no-such-page$/, /status of 404/], { scope: 'test' }] });
  const serve404 = async (page: Page, path: string) => {
    const html = readFileSync(join(process.cwd(), 'dist', '404.html'), 'utf8');
    await page.route(`**${path}`, (route) => route.fulfill({ status: 404, contentType: 'text/html', body: html }));
  };

  test('an unknown Hermes address shows the Hermes workspace with a Not found canvas', async ({ page }) => {
    await serve404(page, '/hermes/projects/zephyr');
    await signInAs(page, 'p-maya');
    await page.goto('/hermes/projects/zephyr');
    await expect(canvas(page).getByRole('heading', { level: 2, name: 'No page at /hermes/projects/zephyr' })).toBeAttached();
    await expect(page).toHaveTitle('Page not found · Hermes');
    await expect(conversation(page)).toBeAttached();
  });

  test('signed out, it goes through the Hermes sign-in first', async ({ page }) => {
    await serve404(page, '/hermes/nowhere');
    await page.goto('/hermes/nowhere');
    await expect(page).toHaveURL(/\/hermes\/sign-in\?next=%2Fhermes%2Fnowhere$/);
    await expect(page.locator('h1')).toHaveText('Sign in to Hermes');
  });

  test('an unknown docs address still shows the docs not-found page', async ({ page }) => {
    await serve404(page, '/no-such-page');
    await page.goto('/no-such-page');
    await expect(page.locator('h1')).toHaveText('No page at /no-such-page');
    await expect(page).toHaveTitle(/^Page not found · ThinkingOrbs$/);
  });
});

// ------------------------------------------------------------------ views by role, through the canvas

test('Team as Sara: her own row and the Platform total, with the Developer copy', async ({ page }) => {
  await signInAs(page, 'p-sara');
  await page.goto('/hermes/team');
  await expect(canvas(page).getByText(DEVELOPER_COPY, { exact: true })).toBeVisible();
  const rows = canvas(page).locator('table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('th')).toHaveText('Sara Lindqvist');
  await expect(rows.nth(1).locator('th')).toHaveText('Platform team total');
});

test('Team as Maya: everyone in the delivery teams, one row each', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/team');
  const names = canvas(page).locator('table tbody tr th');
  await expect(names).toHaveCount(12);
  const all = await names.allTextContents();
  expect(all).toContain('Daniel Okafor');
  expect(all).toContain('Omar Reyes');
  expect(all).not.toContain('Maya Chen');
  expect(all).not.toContain('Elena Rossi');
  await expect(page.getByText(DEVELOPER_COPY)).toHaveCount(0);
});

test('Team as Daniel (Manager): Platform people by name, the other team as a total, and the Manager copy', async ({ page }) => {
  await signInAs(page, 'p-daniel');
  await page.goto('/hermes/team');
  const rows = canvas(page).locator('table tbody tr');
  await expect(canvas(page).getByText(MANAGER_COPY, { exact: true })).toBeVisible();
  await expect(rows.filter({ hasText: 'Product team total' })).toHaveCount(1);
  const names = await canvas(page).locator('table tbody tr th').allTextContents();
  expect(names).toContain('Product team total');
  expect(names).toContain('Sara Lindqvist');
  expect(names).not.toContain('Platform team total');
  expect(names.length).toBeGreaterThan(3);
  for (const row of await rows.all()) {
    const name = await row.locator('th').innerText();
    if (name !== 'Product team total') await expect(row).toContainText('Platform');
  }
  await expect(page.getByText(DEVELOPER_COPY)).toHaveCount(0);
});

test('Projects as Sara: her team’s two projects, and Open Atlas swaps the canvas to Atlas', async ({ page }) => {
  await signInAs(page, 'p-sara');
  await page.goto('/hermes/projects');
  const cards = canvas(page).locator('.as-status');
  await expect(cards).toHaveCount(2);
  await canvas(page).getByRole('link', { name: 'Open Atlas' }).click();
  await expect(page).toHaveURL(/\/hermes\/projects\/atlas$/);
  await expect(canvas(page).getByRole('heading', { level: 2, name: 'Atlas' })).toBeAttached();
});

test('Atlas as Maya: status, blocked tickets and the budget', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/projects/atlas');
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Atlas');
  await expect(canvas(page).getByText('At risk', { exact: true })).toBeVisible();
  await expect(canvas(page).getByRole('region', { name: 'Blocked tickets' }).locator('tbody tr')).toHaveCount(3);
  await expect(canvas(page).getByRole('heading', { name: 'Budget' })).toBeVisible();
  await expect(canvas(page).getByText(/^\d+ \/ \d+ points$/)).toBeVisible();
});

test('Atlas as Sara: no budget', async ({ page }) => {
  await signInAs(page, 'p-sara');
  await page.goto('/hermes/projects/atlas');
  await expect(canvas(page).getByRole('region', { name: 'Blocked tickets' }).locator('tbody tr')).toHaveCount(3);
  await expect(canvas(page).getByText(/budget/i)).toHaveCount(0);
});

test('with Atlas in the canvas, "How is this one doing?" answers about Atlas', async ({ page }) => {
  test.skip(narrow(page), 'the sheet covers the composer below 1024px');
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/projects/atlas');
  await expect(canvas(page).getByRole('heading', { level: 2, name: 'Atlas' })).toBeAttached();
  await conversation(page).getByRole('button', { name: 'How is this one doing?' }).click();
  await expect(turns(page)).toHaveAttribute('data-turn', 'done', { timeout: 20_000 });
  await expect(turns(page).getByText(/Atlas is (on track|at risk|off track)/)).toBeVisible();
});

test('Connections: a simulated Jira outage shows in the view and in the answer', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes/connections');
  const rows = canvas(page).getByRole('listitem');
  for (const system of ['Directory', 'Clockify', 'Jira', 'GitHub', 'Teams', 'AWS']) {
    await expect(rows.filter({ has: page.getByRole('heading', { name: system, exact: true }) })).toContainText('Connected');
  }
  for (const later of ['Slack', 'Google Drive', 'Salesforce']) {
    await expect(rows.filter({ has: page.getByRole('heading', { name: later, exact: true }) })).toContainText('Coming later');
  }
  const jira = rows.filter({ has: page.getByRole('heading', { name: 'Jira', exact: true }) });
  await jira.getByRole('checkbox', { name: /Simulate an outage/ }).check();
  await expect(jira).toContainText('Outage (simulated)');

  if (narrow(page)) await closeCanvas(page);
  await ask(page, 'How is the team doing?');
  await expect(conversation(page).getByText("Jira didn't respond, so closed tickets and blockers aren't included.")).toBeVisible();
});

test('role difference: Maya sees every developer, Sara only herself and her team total', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await ask(page, 'How many hours did developers work this week?');
  const table = turns(page).last().locator('table.as-table');
  await expect(table).toBeVisible({ timeout: 20_000 });
  expect(await table.locator('tbody tr').count(), 'rows for every developer').toBeGreaterThan(2);

  await switchTo(page, 'Maya Chen', 'Sara Lindqvist');
  await expect(turns(page)).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText(/Sara$/);

  await ask(page, 'How many hours did developers work this week?');
  const answer = conversation(page).locator('[data-turn="done"]');
  await expect(answer).toHaveCount(1, { timeout: 20_000 });
  await expect(answer.getByText(DEVELOPER_COPY, { exact: true })).toBeVisible();
  const rows = answer.locator('table.as-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('th, td').first()).toHaveText('You');
  await expect(rows.nth(1).locator('th, td').first()).toHaveText('Platform team total');
});

test('switching user while a reply is still being written leaves an empty thread and no old answer', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  const asked = Date.now();
  await ask(page, 'How is the team doing?');
  await expect(turns(page)).toHaveCount(1);
  await expect(turns(page)).toHaveAttribute('data-turn', /^(working|writing)$/);

  await switchTo(page, 'Maya Chen', 'Sara Lindqvist');
  const stats = conversation(page).locator('.as-stat');
  // at least 3 s, and long enough to outlast the old reply, which takes about 7 s to finish
  const until = Math.max(Date.now() + 3000, asked + 10_000);
  let polls = 0;
  while (Date.now() < until) {
    expect(await turns(page).count(), 'the old question or reply came back').toBe(0);
    expect(await stats.count(), 'a stat block from the old reply appeared').toBe(0);
    polls++;
    await page.waitForTimeout(100);
  }
  expect(polls).toBeGreaterThan(10);
  await ask(page, 'How is the team doing?');
  await expect(conversation(page).locator('[data-turn="done"]')).toHaveCount(1, { timeout: 20_000 });
});

test('AWS costs: Maya gets the chart and the cause, Daniel is told they are for leadership', async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await ask(page, 'Why did AWS costs go up?');
  const answer = conversation(page).locator('[data-turn="done"]');
  await expect(answer).toHaveCount(1, { timeout: 20_000 });
  await expect(answer.locator('svg[role="img"]')).toBeVisible();
  await expect(answer.getByText(/12 extra instances/)).toBeVisible();

  await switchTo(page, 'Maya Chen', 'Daniel Okafor');
  await expect(turns(page)).toHaveCount(0);
  await ask(page, 'Why did AWS costs go up?');
  const denied = conversation(page).locator('[data-turn="done"]');
  await expect(denied).toHaveCount(1, { timeout: 20_000 });
  await expect(denied.getByText(/AWS costs are visible to leadership\./)).toBeVisible();
  await expect(denied.getByText(/I can show AWS service health instead\./)).toBeVisible();
  await expect(denied.locator('svg[role="img"]')).toHaveCount(0);
});

// The microphone is only ever asked for when you press Dictate or Voice mode, never just by opening Hermes.
test('opening Hermes never asks for the microphone; pressing Dictate does', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __mic: string[] } & Record<string, unknown>;
    w.__mic = [];
    const md = navigator.mediaDevices;
    if (md?.getUserMedia) {
      const get = md.getUserMedia.bind(md);
      md.getUserMedia = (c) => (w.__mic.push('getUserMedia'), get(c));
    }
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
      const Ctor = w[name] as { prototype: { start(): void } } | undefined;
      if (!Ctor) continue;
      const start = Ctor.prototype.start;
      Ctor.prototype.start = function (this: unknown) {
        w.__mic.push(name);
        return start.call(this);
      };
    }
  });
  await signInAs(page, 'p-maya');
  const asked = () => page.evaluate(() => (window as unknown as { __mic: string[] }).__mic.length);

  for (const path of ['/hermes', '/hermes/team', '/hermes/projects/atlas']) {
    await page.goto(path);
    await expect(page.locator('[data-bot]').first()).toBeVisible();
    await page.waitForTimeout(1500); // let the morning brief and any effects settle
    expect(await asked(), `microphone requested on load of ${path}`).toBe(0);
  }

  const dictate = page.getByRole('button', { name: 'Dictate' });
  test.skip((await dictate.count()) === 0, 'this browser has no speech recognition, so there is no Dictate button');
  await dictate.first().click();
  await expect.poll(asked).toBeGreaterThan(0);
});
