// The four examples, driven end to end.

import { HINTS } from '../demo/chat-app/hints';
import { ANSWER } from '../demo/examples/agentScript';
import { expect, expectAnimating, test } from './fixtures';

test.describe('Chat app', () => {
  // dictation needs speech recognition, which headless Chromium doesn't provide
  // what the header says while each orb is at work
  const STATUS: Record<string, string> = {
    search: 'Searching the web',
    tools: 'Using tools',
    think: 'Thinking',
    file: 'Reading a file',
    image: 'Looking at an image',
    video: 'Watching a video',
  };
  for (const hint of HINTS.filter((h) => !h.dictate)) {
    test(`"${hint.label}" shows ${hint.orb}, then answers`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto('/examples/chat-app');
      const app = page.locator('.ca');
      await app.locator('.ca-card', { hasText: hint.label }).click();
      await expect(app.locator('.ca-user').first()).toBeVisible();
      // while it works, the header names the activity and the live row shows the orb
      await expect(app.locator('.ca-head-text')).toContainText(STATUS[hint.id], { timeout: 20_000 });
      await expect(app.locator('.ca-activity-orb canvas').first()).toBeVisible();
      // …then the reply finishes with text and a summary, and the header is back to Ready
      await expect(app.locator('.ca-head-text')).toContainText('Ready', { timeout: 60_000 });
      await expect(app.locator('.ca-assistant .ca-answer').last()).not.toBeEmpty();
      const summary = app.locator('.ca-assistant .ca-summary-toggle').last();
      await expect(summary).toBeVisible();
      await summary.click();
      await expect(summary).toHaveAttribute('aria-expanded', 'true');
    });
  }

  test('typing a message, stopping a reply, and starting a new chat', async ({ page }) => {
    await page.goto('/examples/chat-app');
    const app = page.locator('.ca');
    const box = app.getByRole('textbox', { name: 'Message' });
    await box.fill('What is 12 times 7?');
    await box.press('Enter');
    await expect(app.locator('.ca-user')).toContainText('What is 12 times 7?');
    await expect(app.locator('.ca-head-text')).toContainText('Ready', { timeout: 30_000 });
    await expect(app.locator('.ca-assistant .ca-answer').last()).toContainText('84');

    await box.fill('Search the web for electric truck range');
    await box.press('Enter');
    await app.getByRole('button', { name: 'Stop generating' }).click();
    await expect(app.locator('.ca-status-note')).toHaveText('You stopped this reply.');

    await app.getByRole('button', { name: 'New chat' }).click();
    await expect(app.getByRole('heading', { name: 'What would you like to try?' })).toBeVisible();
  });
});

test.describe('Voice assistant', () => {
  test('answers a typed message aloud and can be interrupted', async ({ page }) => {
    await page.goto('/examples/voice-assistant');
    const va = page.locator('.va');
    const orb = va.locator('.va-orb canvas');
    await expectAnimating(orb, { minDiff: 0.05 });
    await va.getByRole('textbox', { name: 'Type a message' }).fill('tell me a joke');
    await va.getByRole('button', { name: 'Send' }).click();
    await expect(va.locator('.va-you')).toContainText('tell me a joke');
    await expect(va.locator('.va-ai')).toBeVisible({ timeout: 10_000 });
    await expect(va.locator('.va-status')).not.toHaveText('Thinking…', { timeout: 10_000 });

    await va.getByRole('textbox', { name: 'Type a message' }).fill('what is 12 times 7?');
    await va.getByRole('button', { name: 'Send' }).click();
    await expect(va.locator('.va-ai')).toContainText('84', { timeout: 10_000 });
    await va.getByRole('button', { name: 'Mute' }).click();
    await expect(va.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
    await va.getByRole('button', { name: 'Unmute' }).click();
  });
});

test.describe('Agent run', () => {
  test('goes thinking → searching → tools → answer, with a summary per stage', async ({ page }) => {
    await page.goto('/examples/agent-run');
    const ar = page.locator('.ar');
    // record every status the header passes through, however briefly
    await page.evaluate(() => {
      const w = window as unknown as { stages: string[] };
      const el = document.querySelector('.ar-head-label')!;
      w.stages = [el.textContent!];
      new MutationObserver(() => {
        const t = el.textContent!;
        if (w.stages[w.stages.length - 1] !== t) w.stages.push(t);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
    await expect(ar.locator('.ar-head-label')).toHaveText('Thinking', { timeout: 15_000 });
    await expectAnimating(ar.locator('.ar-stage canvas'));
    await ar.getByRole('radio', { name: '2×' }).click();
    await expect(ar.locator('.ar-head-label')).toHaveText('Done', { timeout: 30_000 });
    const stages = await page.evaluate(() => (window as unknown as { stages: string[] }).stages);
    expect(stages.slice(stages.indexOf('Thinking'))).toEqual(['Thinking', 'Searching the web', 'Using tools', 'Writing the answer', 'Done']);
    await expect(ar.locator('.ar-answer p')).toHaveText(ANSWER);
    await expect(ar.locator('.ar-log-row')).toHaveText([/^Thought for \d+\.\ds$/, 'Read 8 sources', 'Used 3 tools, 1 failed']);
    await expect(ar.locator('.ar-stage canvas')).toHaveCount(0); // only the current stage's orb is mounted
  });

  test('pauses, resumes and restarts', async ({ page }) => {
    await page.goto('/examples/agent-run');
    const ar = page.locator('.ar');
    await page.waitForTimeout(1200);
    await ar.getByRole('button', { name: 'Pause' }).click();
    const clock = ar.locator('.ar-clock');
    const paused = await clock.textContent();
    await page.waitForTimeout(600);
    await expect(clock).toHaveText(paused!);
    await ar.getByRole('button', { name: 'Resume' }).click();
    await expect(clock).not.toHaveText(paused!);
    await ar.getByRole('button', { name: 'Run again' }).click();
    await expect(clock).toHaveText(/^0\.\ds$/);
  });
});

test.describe('Ask and answer', () => {
  test('answers with React content', async ({ page }) => {
    await page.goto('/examples/ask-flow');
    const input = page.getByRole('textbox', { name: 'Ask anything...' });
    await input.fill('What is an orb?');
    await input.press('Enter');
    await expect(page.locator('.ao-label')).toContainText('Searching', { timeout: 8000 });
    await expect(page.locator('.ao-card')).toContainText('What is an orb?', { timeout: 20_000 });
  });

  test('shows the error card when the agent fails', async ({ page }) => {
    await page.goto('/examples/ask-flow');
    await page.getByRole('radio', { name: 'Fails while searching' }).click();
    const input = page.getByRole('textbox', { name: 'Ask anything...' });
    await input.fill('Will this work?');
    await input.press('Enter');
    await expect(page.locator('.ao-label')).toHaveText('Failed', { timeout: 15_000 });
    await expect(page.locator('.ao-card')).toHaveAttribute('data-error', 'true', { timeout: 10_000 });
    await expect(page.locator('.ao-kicker')).toHaveText('Error');
    await expect(page.locator('.ao-text')).toHaveText('The search service did not respond. Try again in a moment.');
  });
});
