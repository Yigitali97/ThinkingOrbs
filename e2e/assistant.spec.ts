// The Hermes assistant: the dock, the panel and its shortcuts, answers with blocks, persistence across pages and the mobile sheet.

import type { Page } from '@playwright/test';
import { expect, fakeMicrophone, signInAs, test } from './fixtures';

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
  // the Team page's suggestions
  await expect(panel(page).getByRole('button', { name: 'How many hours did developers work this week?' })).toBeVisible();

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

// a real 1×1 PNG, so a thumbnail that still loads has a natural width
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const loaded = (img: ReturnType<Page['locator']>) => () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);

test('an attached image, a waiting upload and the draft outlive closing the panel and changing page', async ({ page, isMobile }) => {
  const open = () => page.getByRole('button', { name: 'Open Hermes' }).click();
  const files = () => page.locator('.as-composer input[type="file"]');
  await open();
  await files().setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: PNG });
  await expect(panel(page).getByText('Ready')).toBeVisible();
  await ask(page, 'How is the team doing?');
  await expect(panel(page).locator('[data-turn="done"]')).toHaveCount(1);
  const thumb = page.getByRole('list', { name: 'Attached' }).getByRole('img', { name: 'board.png' });
  await expect.poll(loaded(thumb)).toBe(true);

  // a second image waits in the message box, with a half-written question
  await files().setInputFiles({ name: 'chart.png', mimeType: 'image/png', buffer: PNG });
  await expect(panel(page).getByText('Ready')).toBeVisible();
  await composer(page).fill('half a question');

  // close and reopen the panel
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await open();
  await expect.poll(loaded(thumb)).toBe(true);
  await expect(composer(page)).toHaveValue('half a question');
  await expect.poll(loaded(page.getByRole('list', { name: 'Attachments' }).locator('img'))).toBe(true);

  // change page (the phone's sheet is modal, so close it first)
  if (isMobile) await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/\/hermes\/projects$/);
  if (isMobile) await open();
  await expect.poll(loaded(thumb)).toBe(true);

  // Home shows the same conversation in the page itself
  if (isMobile) await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL(/\/hermes\/?$/);
  // the panel steps aside for the assistant in the page
  await expect(panel(page)).toHaveCount(0);
  await expect.poll(loaded(page.getByRole('main').getByRole('list', { name: 'Attached' }).getByRole('img', { name: 'board.png' }))).toBe(true);
  await expect(composer(page)).toHaveValue('half a question');
});

test.describe('removing an upload', () => {
  // reading the revoked URL back is expected to fail
  test.use({ allowErrors: [[/^blob:|ERR_FILE_NOT_FOUND/], { scope: 'test' }] });

  test('frees its preview', async ({ page }) => {
    await page.getByRole('button', { name: 'Open Hermes' }).click();
    await page.locator('.as-composer input[type="file"]').setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: PNG });
    const preview = page.getByRole('list', { name: 'Attachments' }).locator('img');
    await expect.poll(loaded(preview)).toBe(true);
    const url = await preview.getAttribute('src');
    expect(url).toMatch(/^blob:/);
    const readable = () => page.evaluate((u) => fetch(u!).then(() => true, () => false), url);
    expect(await readable()).toBe(true);
    await panel(page).getByRole('button', { name: 'Remove board.png' }).click();
    await expect(page.getByRole('list', { name: 'Attachments' })).toHaveCount(0);
    expect(await readable()).toBe(false);
  });
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
  await panel(page).getByRole('button', { name: 'How is the team doing?' }).click();
  await expect(panel(page).locator('[data-turn]').getByText('How is the team doing?')).toBeVisible();
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

test('pressing Stop from the keyboard keeps focus in the panel', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await ask(page, 'How is the team doing?');
  const stop = panel(page).getByRole('button', { name: 'Stop' });
  await expect(stop).toBeVisible();
  // from the composer, Tab past the dictation button (when the browser has one) to Stop
  while (!(await stop.evaluate((el) => el === document.activeElement))) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(panel(page).locator('[data-turn]').first().getByText('Stopped.')).toBeVisible();
  const inPanel = () => page.evaluate(() => !!document.activeElement?.closest('aside, [role="dialog"]'));
  expect(await inPanel()).toBe(true);
  await expect(panel(page).getByRole('button', { name: 'Send' })).toBeFocused();
  if (isMobile) {
    await page.keyboard.press('Tab');
    expect(await inPanel(), 'Tab stays inside the modal sheet').toBe(true);
  } else {
    // the side panel isn't modal and Send is the last control on the page, so step back into it instead
    await page.keyboard.press('Shift+Tab');
    expect(await inPanel()).toBe(true);
  }
});

test('without speech recognition there is no voice mode or dictation, and typing still answers', async ({ page }) => {
  // this Chromium has a speech recognition constructor, so take it away before the page loads
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
  await page.reload();
  expect(await page.evaluate(() => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window)).toBe(false);
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await expect(composer(page)).toBeFocused();
  await expect(panel(page).getByRole('button', { name: 'Voice mode' })).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Dictate' })).toHaveCount(0);
  await ask(page, 'How many hours did developers work this week?');
  await expect(panel(page).locator('svg[role="img"]')).toBeVisible();
});

// this Chromium has both speech recognition and synthesis, so the button is offered
test('voice mode replaces the message box, and End voice mode brings it back with focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  const voice = panel(page).getByRole('button', { name: 'Voice mode' });
  await voice.click();
  const end = panel(page).getByRole('button', { name: 'End voice mode' });
  await expect(end).toBeFocused();
  await expect(composer(page)).toHaveCount(0);
  await end.click();
  await expect(composer(page)).toBeFocused();
  await expect(voice).toBeVisible();
});

test('while voice mode thinks or speaks, the orb can be reached and pressed from the keyboard to interrupt', async ({ page }) => {
  await fakeMicrophone(page);
  // a recognizer that hears one question each time it starts
  await page.addInitScript(() => {
    class Heard {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const result = Object.assign([{ transcript: 'How is the team doing?' }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: [result] });
          this.onend?.();
        }, 200);
      }
      stop() {}
      abort() {}
    }
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = Heard;
    w.webkitSpeechRecognition = Heard;
  });
  await page.reload();
  await page.getByRole('button', { name: 'Open Hermes' }).click();
  await panel(page).getByRole('button', { name: 'Voice mode' }).click();
  const voice = panel(page).locator('.as-voice');
  await expect(voice).toHaveAttribute('data-state', /thinking|speaking/);
  // from End voice mode, step back past Mute to the orb
  await expect(panel(page).getByRole('button', { name: 'End voice mode' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(panel(page).getByRole('button', { name: 'Interrupt the assistant' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(voice).toHaveAttribute('data-state', 'interrupted');
});
