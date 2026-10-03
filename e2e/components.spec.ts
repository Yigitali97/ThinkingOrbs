// Every component page: the live demo draws and animates, every state can be
// switched to, and each orb's own transitions (streaming, docking, ranking,
// uploading, reasoning, scanning, watching) run through to the end.

import { ASSISTANT_COLORS } from '../src/orbs/assistant/engine';
import { STATUS_VARIANTS } from '../src/orbs/status/engine';
import { COMPONENTS } from '../demo/site/routes';
import { expect, expectAnimating, fakeMicrophone, frameDiff, pixels, pixelsOfEach, test } from './fixtures';

const demo = (page: import('@playwright/test').Page) => page.locator('.doc-demo');

test('every component page shows its demo, props and code', async ({ page }) => {
  for (const c of COMPONENTS) {
    await page.goto(`/components/${c.slug}`);
    await expect(page.locator('h1')).toHaveText(c.name);
    await expect(page.locator('#props')).toBeVisible();
    await expect(page.locator('.table-props tbody tr').first()).toBeVisible();
    await expect(page.locator('.codeblock').first()).toContainText(c.name);
    await expect(page.locator('.sidebar a[aria-current="page"]')).toHaveText(c.name);
    // AskOrb draws its orb only once a question is asked
    if (c.slug === 'ask-orb') await expect(demo(page).getByRole('textbox')).toBeVisible();
    else await expect(demo(page).locator('canvas').first()).toBeVisible();
  }
});

test.describe('AssistantOrb', () => {
  test('switches through all eight states with the right colour', async ({ page }) => {
    await page.goto('/components/assistant-orb');
    const orb = demo(page).getByRole('img', { name: /^Assistant / });
    await expectAnimating(orb);
    for (const state of Object.keys(ASSISTANT_COLORS)) {
      await demo(page).getByRole('radio', { name: new RegExp(`^${state}$`, 'i') }).click();
      await expect(orb).toHaveAttribute('aria-label', `Assistant ${state}`);
      await expect(demo(page).locator('.state-caption')).toHaveText(state);
      await page.waitForTimeout(900); // cross-fade
      if (state === 'muted') {
        // muted dims to dark grey and nearly stops: still drawn, but much darker than idle
        // (the fade is frame-based, so on a slow machine it takes longer: wait for it)
        await expect.poll(async () => (await pixels(orb)).lit, { message: 'muted is dim', timeout: 15_000 }).toBeLessThan(0.02);
        const p = await pixels(orb);
        const brightness = p.grid.reduce((x, y) => x + y, 0) / p.grid.length;
        expect(brightness, 'muted is still drawn').toBeGreaterThan(1.5);
        continue;
      }
      const p = await expectAnimating(orb);
      const [r, g, b] = p.mean;
      if (state === 'listening') expect(b, 'listening is blue').toBeGreaterThan(r + 30);
      if (state === 'thinking') expect(r, 'thinking is orange').toBeGreaterThan(b + 40);
      if (state === 'speaking') expect(g, 'speaking is green').toBeGreaterThan(Math.max(r, b) + 20);
      if (state === 'error') expect(r, 'error is red').toBeGreaterThan(Math.max(g, b) + 40);
    }
  });

  test('keyboard arrows move between states', async ({ page }) => {
    await page.goto('/components/assistant-orb');
    const idle = demo(page).getByRole('radio', { name: /^idle$/i });
    await idle.focus();
    await page.keyboard.press('ArrowRight');
    await expect(demo(page).getByRole('radio', { name: /^connecting$/i })).toBeFocused();
    await expect(demo(page).getByRole('radio', { name: /^connecting$/i })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(demo(page).getByRole('radio', { name: /^error$/i })).toHaveAttribute('aria-checked', 'true');
  });

  test('listens to the microphone', async ({ page }) => {
    await fakeMicrophone(page);
    await page.goto('/components/assistant-orb');
    await demo(page).getByRole('radio', { name: /^listening$/i }).click();
    await demo(page).getByRole('button', { name: 'Use microphone' }).click();
    await expect(demo(page).getByRole('button', { name: 'Turn microphone off' })).toHaveAttribute('aria-pressed', 'true');
    await expectAnimating(demo(page).getByRole('img', { name: 'Assistant listening' }));
    await demo(page).getByRole('button', { name: 'Turn microphone off' }).click();
    await expect(demo(page).getByRole('button', { name: 'Use microphone' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('explains when microphone permission is denied', async ({ page }) => {
    await fakeMicrophone(page, { deny: true });
    await page.goto('/components/assistant-orb');
    await demo(page).getByRole('button', { name: 'Use microphone' }).click();
    await expect(demo(page).getByRole('status')).toHaveText(/denied/i);
    await expect(demo(page).getByRole('button', { name: 'Use microphone' })).toBeEnabled();
  });
});

test('VoiceOrb breathes with a simulated voice and with the microphone', async ({ page }) => {
  await fakeMicrophone(page);
  await page.goto('/components/voice-orb');
  const ring = demo(page).getByRole('img', { name: 'Voice activity' });
  await expectAnimating(ring);
  await demo(page).getByRole('button', { name: 'Stop simulated voice' }).click();
  await demo(page).getByRole('button', { name: 'Start recording' }).click();
  await expect(demo(page).getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await expect(demo(page).getByRole('button', { name: 'Simulate a voice' })).toBeDisabled();
  await expectAnimating(ring);
  await demo(page).getByRole('button', { name: 'Stop recording' }).click();
  await expect(demo(page).getByRole('button', { name: 'Start recording' })).toBeVisible();
});

test('StatusOrb draws all fifteen variants, each one moving', async ({ page }) => {
  await page.goto('/components/status-orb');
  const grid = demo(page).locator('.status-grid');
  const figures = grid.locator('figure');
  await expect(figures).toHaveCount(STATUS_VARIANTS.length);
  await expect(figures.locator('figcaption')).toHaveText([...STATUS_VARIANTS]);
  const canvases = grid.locator('canvas');
  await page.waitForTimeout(500);
  const a = await pixelsOfEach(grid, canvases);
  await page.waitForTimeout(700);
  const b = await pixelsOfEach(grid, canvases);
  STATUS_VARIANTS.forEach((variant, i) => {
    expect(a[i].lit, `${variant} draws`).toBeGreaterThan(0.01);
    expect(frameDiff(a[i], b[i]), `${variant} moves`).toBeGreaterThan(0.05);
  });
  // the live line cycles through the flow
  const live = demo(page).locator('.status-live span');
  const first = await live.textContent();
  await expect(live).not.toHaveText(first!, { timeout: 5000 });
});

test('StatusOrb holds a single still frame with reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/components/status-orb');
  const grid = page.locator('.status-grid');
  await page.waitForTimeout(500);
  const a = await pixelsOfEach(grid, grid.locator('canvas'));
  await page.waitForTimeout(700);
  const b = await pixelsOfEach(grid, grid.locator('canvas'));
  STATUS_VARIANTS.forEach((variant, i) => {
    expect(a[i].lit, `${variant} draws`).toBeGreaterThan(0.01);
    expect(frameDiff(a[i], b[i]), `${variant} holds still`).toBeLessThan(0.02);
  });
  await context.close();
});

test('TokenOrb streams a reply and settles when done, at every pace', async ({ page }) => {
  await page.goto('/components/token-orb');
  const orb = demo(page).getByRole('img', { name: /^Reply / });
  await expect(orb).toHaveAttribute('aria-label', 'Reply streaming');
  await expectAnimating(orb, { minLit: 0.01 });
  await expect(demo(page).locator('.bubble-ai')).toContainText('due for service on Friday.', { timeout: 20_000 });
  await expect(orb).toHaveAttribute('aria-label', 'Reply complete');

  await demo(page).getByRole('radio', { name: 'Steady' }).click();
  await expect(orb).toHaveAttribute('aria-label', 'Reply streaming');
  await expect(demo(page).locator('.bubble-ai')).toContainText('Thinking…');
  await expect(demo(page).locator('.bubble-ai')).toContainText('due for service on Friday.', { timeout: 20_000 });

  await demo(page).getByRole('radio', { name: 'Slow' }).click();
  await expect(demo(page).locator('.bubble-ai')).toContainText('Sure,', { timeout: 5000 });
  await demo(page).getByRole('button', { name: 'Replay' }).click();
  await expect(demo(page).locator('.bubble-ai')).toContainText('Thinking…');
});

test('ToolOrb: tools orbit, dock when done and fall away on error', async ({ page }) => {
  await page.goto('/components/tool-orb');
  const chips = demo(page).locator('.to-chip');
  await expect(chips.first()).toBeVisible();
  await expect(demo(page).getByRole('img', { name: /Running \d tools?/ })).toBeVisible();
  await expectAnimating(demo(page).locator('canvas'));
  await expect(chips).toHaveCount(4, { timeout: 6000 });
  await expect(demo(page).locator('.to-chip[data-status="error"]')).toHaveText(/calculator/);
  await expect(demo(page).locator('.to-chip[data-status="done"]')).toHaveCount(3, { timeout: 8000 });
  await expect(demo(page).getByRole('img', { name: 'No tools running' })).toBeVisible();
  await expectAnimating(demo(page).locator('canvas'), { minDiff: 0.05 }); // docked tools keep turning with the core

  await demo(page).getByRole('button', { name: 'Run the agent again' }).click();
  await expect(chips).toHaveCount(1, { timeout: 2000 });
});

test('SearchOrb runs searching → ranking → synthesizing → done, and the empty case', async ({ page }) => {
  await page.goto('/components/search-orb');
  const caption = demo(page).locator('[aria-live="polite"]').first();
  await expect(caption).toHaveText(/Searching/);
  await expectAnimating(demo(page).locator('canvas'));
  await expect(caption).toHaveText('Ranking 10 sources', { timeout: 10_000 });
  await expect(caption).toHaveText('Synthesizing 10 sources', { timeout: 5000 });
  await expect(caption).toHaveText('Done · 10 sources', { timeout: 6000 });
  await expectAnimating(demo(page).locator('canvas'), { minDiff: 0.05 });

  await demo(page).getByRole('button', { name: 'Search with no results' }).click();
  await expect(caption).toHaveText('Searching…');
  await expect(caption).toHaveText('No results', { timeout: 5000 });
});

test('IngestOrb uploads, reads, finishes, fails, and takes your own file name', async ({ page }) => {
  await page.goto('/components/ingest-orb');
  const bar = demo(page).getByRole('progressbar');
  await expectAnimating(bar);
  await expect(bar).toHaveAttribute('aria-valuenow', '100', { timeout: 10_000 });
  await expect(demo(page)).toContainText('Reading report.pdf');
  await expect(demo(page)).toContainText('report.pdf ready', { timeout: 5000 });

  for (const name of ['photo.png', 'walkthrough.mp4', 'call.mp3']) {
    await demo(page).getByRole('radio', { name }).click();
    await expect(demo(page)).toContainText(new RegExp(`Uploading ${name.replace('.', '\\.')}`));
  }

  await demo(page).getByRole('button', { name: 'Simulate a failure' }).click();
  await expect(demo(page)).toContainText("Couldn't read call.mp3", { timeout: 8000 });
  await expectAnimating(bar, { minDiff: 0.05 }); // the error shake

  await demo(page).locator('input[type="file"]').setInputFiles({ name: 'budget.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(demo(page).getByRole('radio', { name: 'budget.xlsx' })).toHaveAttribute('aria-checked', 'true');
  await expect(demo(page)).toContainText(/budget\.xlsx/);
});

test('ReasoningOrb grows a node per step, then turns done; the long run nears the budget', async ({ page }) => {
  await page.goto('/components/reasoning-orb');
  const orb = demo(page).locator('canvas');
  await expect(demo(page)).toContainText(/Step 1/, { timeout: 4000 });
  await expectAnimating(orb);
  await expect(demo(page)).toContainText('Reasoned in 7 steps', { timeout: 15_000 });

  await demo(page).getByRole('button', { name: 'Long run, near the budget' }).click();
  await expect(demo(page)).toContainText(/Step 12/, { timeout: 20_000 });
  await expect(demo(page)).toContainText(/9\d% of budget/);
  await expect(demo(page)).toContainText('Reasoned in 12 steps', { timeout: 5000 });
});

test('VisionOrb scans each image, marks what it found, and reads your own image', async ({ page }) => {
  await page.goto('/components/vision-orb');
  const orb = demo(page).locator('canvas');
  await expectAnimating(orb);
  await expect(demo(page)).toContainText('Found 2 things', { timeout: 8000 });
  const sunset = await pixels(orb);
  expect(sunset.mean[0], 'sunset colours come through').toBeGreaterThan(sunset.mean[2]);

  await demo(page).getByRole('radio', { name: 'Lake at night' }).click();
  await expect(demo(page)).toContainText('Found 3 things', { timeout: 8000 });

  // a plain green PNG, drawn in the page
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = '#22c55e';
      g.fillRect(0, 0, 64, 64);
      return c.toDataURL('image/png').split(',')[1];
    }),
    'base64'
  );
  await demo(page).locator('input[type="file"]').setInputFiles({ name: 'green.png', mimeType: 'image/png', buffer: png });
  await expect(demo(page).getByRole('radio', { name: 'Your image' })).toHaveAttribute('aria-checked', 'true');
  await expect(demo(page)).toContainText('Image understood', { timeout: 8000 });
  const custom = await pixels(orb);
  expect(custom.mean[1], 'your image colours the sphere').toBeGreaterThan(custom.mean[0]);
});

test('ReelOrb watches every frame, and explains a video it cannot read', async ({ page }) => {
  await page.goto('/components/reel-orb');
  const bar = demo(page).getByRole('progressbar');
  await expect(demo(page)).toContainText(/Watching frame \d+ of 12/, { timeout: 5000 });
  await expectAnimating(bar);
  await expect(bar).toHaveAttribute('aria-valuenow', '100', { timeout: 15_000 });
  await expect(demo(page)).toContainText('Watched 12 frames', { timeout: 5000 });

  await demo(page).locator('input[type="file"]').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') });
  await expect(demo(page).getByRole('status')).toHaveText(/could not be read/, { timeout: 15_000 });
  await expect(demo(page)).toContainText("Couldn't read the video");
  await demo(page).getByRole('button', { name: 'Watch again' }).click();
  await expect(demo(page)).toContainText(/Watching frame/, { timeout: 5000 });
});

test('MascotOrb bounces when pressed and on request, and blinks', async ({ page }) => {
  await page.goto('/components/mascot-orb');
  const orb = demo(page).getByRole('img', { name: 'Orb mascot' });
  await expect(orb).toBeVisible();
  const still = await pixels(orb);
  await demo(page).getByRole('button', { name: 'Bounce' }).click();
  await page.waitForTimeout(120);
  expect(frameDiff(still, await pixels(orb)), 'bounce moves the bubble').toBeGreaterThan(0.3);
  await page.waitForTimeout(1500);
  await orb.click();
  await page.waitForTimeout(120);
  expect(frameDiff(still, await pixels(orb)), 'pressing bounces too').toBeGreaterThan(0.3);
  await demo(page).getByRole('button', { name: 'Blink' }).click();
});

test('GazeOrb looks toward the pointer', async ({ page }) => {
  await page.goto('/components/gaze-orb');
  const orb = demo(page).getByRole('img', { name: 'Orb watching the pointer' });
  await expect(orb).toBeVisible();
  const box = (await orb.boundingBox())!;
  await page.mouse.move(5, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const left = await pixels(orb);
  await page.mouse.move(page.viewportSize()!.width - 5, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const right = await pixels(orb);
  expect(frameDiff(left, right), 'eyes moved').toBeGreaterThan(0.5);
  await demo(page).getByRole('button', { name: 'Blink' }).click();
});

test('AskOrb runs the whole ask → stages → answer flow, and starts over', async ({ page }) => {
  await page.goto('/components/ask-orb');
  const input = demo(page).getByRole('textbox', { name: 'Ask anything...' });
  await expect(demo(page).getByRole('button', { name: 'Send' })).toBeDisabled();
  // record what the live status region announces, however briefly
  await page.evaluate(() => {
    const w = window as unknown as { said: string[] };
    const el = document.querySelector('.doc-demo .ao-sr')!;
    w.said = [];
    new MutationObserver(() => {
      const t = el.textContent!;
      if (t && w.said[w.said.length - 1] !== t) w.said.push(t);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await input.fill('How far can an electric truck go?');
  await input.press('Enter');
  await expect(demo(page).locator('.ao-label')).toContainText('Thinking', { timeout: 15_000 });
  await expectAnimating(demo(page).locator('.ao-orb canvas'), { minDiff: 0.05 });
  await expect(demo(page).locator('.ao-card')).toBeVisible({ timeout: 30_000 });
  await expect(demo(page).locator('.ao-kicker')).toHaveText('Answer');
  const said = await page.evaluate(() => (window as unknown as { said: string[] }).said);
  expect(said.slice(0, 5)).toEqual(['Thinking…', 'Searching…', 'Analyzing…', 'Composing…', 'Done']);
  await demo(page).getByRole('button', { name: 'New question' }).click();
  await expect(demo(page).getByRole('textbox', { name: 'Ask anything...' })).toBeVisible({ timeout: 5000 });
});
