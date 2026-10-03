// The Hermes assistant in the workspace's conversation: answers with blocks, a running answer and the message box surviving the
// canvas opening and closing, uploads, stopping, drafts, and voice. The rail, canvas and shortcuts are covered in hermes.spec.ts.

import type { Page } from '@playwright/test';
import { expect, fakeMicrophone, signInAs, test } from './fixtures';

const panel = (page: Page) => page.getByRole('region', { name: 'Conversation', exact: true });
const narrow = (page: Page) => page.viewportSize()!.width < 1024;

/** Opens a dashboard from the rail (a drawer below 1024px), then closes the canvas again. */
async function visitDashboard(page: Page, name: string) {
  if (narrow(page)) await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Dashboards' }).getByRole('link', { name, exact: true }).click();
  const canvas = page.locator('[data-canvas]');
  await expect(canvas).toBeVisible();
  await canvas.getByRole('button', { name: 'Close' }).click();
  await expect(canvas).toHaveCount(0);
}
const composer = (page: Page) => page.getByRole('textbox', { name: 'Ask Hermes' });

async function ask(page: Page, question: string) {
  await composer(page).fill(question);
  await composer(page).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await signInAs(page, 'p-maya');
  await page.goto('/hermes');
  await expect(composer(page)).toBeVisible();
});

test('a projects question answers with a status card per project', async ({ page }) => {
  await ask(page, 'How are the projects going?');
  await expect(panel(page).getByText(/^(On track|At risk|Off track)$/)).toHaveCount(4);
  await expect(panel(page).getByText(/project.* on track\./).first()).toBeVisible();
  // once the answer is in, there's no live activity row next to it
  await expect(panel(page).locator('.ca-activity')).toHaveCount(0);
  await expect(panel(page).getByRole('link', { name: /Atlas/ }).first()).toBeVisible();
});

test('the conversation and a running answer survive the canvas opening and closing', async ({ page }) => {
  await ask(page, 'How is the team doing?');
  await expect(panel(page).locator('[data-turn]')).toHaveAttribute('data-turn', /^(working|writing)$/);
  await visitDashboard(page, 'Projects');
  await expect(page).toHaveURL(/\/hermes$/);
  await expect(panel(page).locator('dl')).toBeVisible();
  await expect(panel(page).getByText('How is the team doing?', { exact: true })).toBeVisible();
});

// a real 1×1 PNG, so a thumbnail that still loads has a natural width
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const loaded = (img: ReturnType<Page['locator']>) => () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);

test('an attached image, a waiting upload and the draft outlive the canvas opening and closing', async ({ page }) => {
  const files = () => page.locator('.as-composer input[type="file"]');
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

  await visitDashboard(page, 'Team');
  await expect.poll(loaded(thumb)).toBe(true);
  await expect(composer(page)).toHaveValue('half a question');
  await expect.poll(loaded(page.getByRole('list', { name: 'Attachments' }).locator('img'))).toBe(true);
});

test.describe('removing an upload', () => {
  // reading the revoked URL back is expected to fail
  test.use({ allowErrors: [[/^blob:|ERR_FILE_NOT_FOUND/], { scope: 'test' }] });

  test('frees its preview', async ({ page }) => {
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
  await ask(page, 'Write a status update for the team');
  await expect(panel(page).getByText('Demo — not sent')).toBeVisible();
  const draft = (await panel(page).locator('pre').textContent()) ?? '';
  expect(draft.length).toBeGreaterThan(20);
  await panel(page).getByRole('button', { name: 'Copy' }).click();
  await expect(panel(page).getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(draft);
});

test('pressing Stop from the keyboard keeps focus in the conversation', async ({ page }) => {
  await ask(page, 'How is the team doing?');
  const stop = panel(page).getByRole('button', { name: 'Stop' });
  await expect(stop).toBeVisible();
  // from the composer, Tab past the dictation button (when the browser has one) to Stop
  while (!(await stop.evaluate((el) => el === document.activeElement))) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(panel(page).locator('[data-turn]').first().getByText('Stopped.')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Send' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.conversation'))).toBe(true);
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
  await expect(composer(page)).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Voice mode' })).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Dictate' })).toHaveCount(0);
  await ask(page, 'How many hours did developers work this week?');
  await expect(panel(page).locator('svg[role="img"]')).toBeVisible();
});

// this Chromium has both speech recognition and synthesis, so the button is offered
test('voice mode replaces the message box, and End voice mode brings it back with focus', async ({ page }) => {
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
  await panel(page).getByRole('button', { name: 'Voice mode' }).click();
  const voice = panel(page).locator('.as-voice');
  await expect(voice).toHaveAttribute('data-state', /thinking|speaking/);
  // in Hermes the bot is the voice orb: it shows what voice mode is doing, and voice mode draws no orb of its own
  await expect(page.locator('[data-bot]').first()).toHaveAttribute('data-state', /thinking|speaking/);
  await expect(voice.locator('.as-voice-orb')).toHaveCount(0);
  // from End voice mode, step back past Mute to the orb
  await expect(panel(page).getByRole('button', { name: 'End voice mode' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(panel(page).getByRole('button', { name: 'Interrupt the assistant' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(voice).toHaveAttribute('data-state', 'interrupted');
});
