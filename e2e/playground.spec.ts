// The playground: every orb, every control value, the generated code, and
// setups shared by link.

import { COMPONENTS } from '../demo/site/routes';
import { expect, expectAnimating, pixels, test } from './fixtures';

// The playground covers every orb; its controls are discovered from the page.

for (const c of COMPONENTS) {
  test(`${c.name}: every control works and keeps the orb drawing`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/playground?orb=${c.slug}`);
    await expect(page.getByRole('tab', { name: c.name, exact: true })).toHaveAttribute('aria-selected', 'true');
    const stage = page.locator('.pg-stage');
    const code = page.locator('.codeblock code');
    await expect(code).toContainText(`import { ${c.name} } from './orbs';`);
    // BotOrb is SVG: it is checked for being there, not by its pixels
    const svg = c.name === 'BotOrb';
    const orb = svg ? stage.locator('[data-bot]') : stage.locator('canvas').first();
    // MascotOrb and GazeOrb only move for the pointer, clicks and blinks
    const ambient = !['AskOrb', 'MascotOrb', 'GazeOrb', 'BotOrb'].includes(c.name);
    if (ambient) await expectAnimating(orb, { minDiff: 0.02 });
    else if (svg) await expect(orb).toBeVisible();
    else if (c.name !== 'AskOrb') await expect.poll(async () => (await pixels(orb)).lit).toBeGreaterThan(0.002);

    const fields = page.locator('.pg-controls .pg-field');
    const n = await fields.count();
    expect(n, 'has controls').toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const input = fields.nth(i).locator('select, input');
      const key = (await input.getAttribute('id'))!.replace(/^pg-/, '');
      const tag = await input.evaluate((el) => el.tagName.toLowerCase());
      const type = await input.getAttribute('type');
      if (tag === 'select') {
        const options = await input.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
        const start = await input.inputValue();
        for (const option of options) {
          await input.selectOption(option);
          await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(option === start ? null : option);
          await page.waitForTimeout(80);
        }
        await input.selectOption(start);
      } else if (type === 'range') {
        const [min, max, start] = await input.evaluate((el) => {
          const r = el as HTMLInputElement;
          return [r.min, r.max, r.value];
        });
        for (const v of [min, max, start]) {
          await input.fill(v);
          await expect(input).toHaveValue(v);
        }
        await input.fill(max);
        await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(max === start ? null : max);
        await input.fill(start);
      } else if (type === 'checkbox') {
        const was = await input.isChecked();
        await input.click();
        await expect(input).toBeChecked({ checked: !was });
        await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(was ? '0' : '1');
        await page.waitForTimeout(150);
        await input.click();
        await expect(input).toBeChecked({ checked: was });
      } else if (type === 'color') {
        const start = await input.inputValue();
        await input.fill('#ff3366');
        await expect(fields.nth(i).locator('code')).toHaveText('#ff3366');
        await expect(code).toContainText('#ff3366');
        await input.fill(start);
      } else {
        const start = await input.inputValue();
        await input.fill('custom value.txt');
        await expect(code).toContainText('custom value.txt');
        await input.fill(start);
      }
    }

    // still drawing after every change; Reset brings back the starting setup
    if (svg) await expect(orb).toBeVisible();
    else if (c.name !== 'AskOrb') await expect.poll(async () => (await pixels(orb)).lit).toBeGreaterThan(0.002);
    await page.locator('.pg-controls input, .pg-controls select').first().focus();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page).toHaveURL(new RegExp(`/playground\\?orb=${c.slug}$`));
  });
}

test('a shared link restores the orb and its settings', async ({ page }) => {
  await page.goto('/playground?orb=search-orb&phase=done&sources=3&size=200');
  await expect(page.getByRole('tab', { name: 'SearchOrb' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pg-phase')).toHaveValue('done');
  await expect(page.locator('#pg-sources')).toHaveValue('3');
  await expect(page.locator('.codeblock code')).toContainText('phase="done"');
  await expect(page.locator('.codeblock code')).toContainText("domain: 'reuters.com'");
  await expect(page.locator('.pg-stage')).toContainText('Done · 3 sources');
});

test('a bad link falls back to safe values', async ({ page }) => {
  await page.goto('/playground?orb=nope&state=<script>&size=99999');
  await expect(page.getByRole('tab', { name: 'AssistantOrb' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pg-state')).toHaveValue('listening');
  await expect(page.locator('#pg-size')).toHaveValue('420');
  await expect(page).toHaveURL(/\/playground\?orb=assistant-orb&size=420$/);
});

test('tabs work from the keyboard and the link can be copied', async ({ page }) => {
  await page.goto('/playground');
  const first = page.getByRole('tab', { name: 'AssistantOrb' });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'VoiceOrb' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'VoiceOrb' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/orb=voice-orb/);
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'AskOrb' })).toHaveAttribute('aria-selected', 'true'); // the last tab
  await page.keyboard.press('Home');
  await expect(first).toHaveAttribute('aria-selected', 'true');

  await page.locator('#pg-state').selectOption('thinking');
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('state="thinking"');
});

test('switching orbs keeps each orb’s settings', async ({ page }) => {
  await page.goto('/playground?orb=status-orb');
  await page.locator('#pg-variant').selectOption('waiting');
  await page.getByRole('tab', { name: 'TokenOrb' }).click();
  await expect(page).toHaveURL(/orb=token-orb/);
  await page.getByRole('tab', { name: 'StatusOrb' }).click();
  await expect(page.locator('#pg-variant')).toHaveValue('waiting');
  await expect(page).toHaveURL(/orb=status-orb&variant=waiting/);
});

test('the reference link opens the component page', async ({ page }) => {
  await page.goto('/playground?orb=tool-orb');
  await page.getByRole('link', { name: 'ToolOrb reference' }).click();
  await expect(page).toHaveURL(/\/components\/tool-orb$/);
  await expect(page.locator('h1')).toHaveText('ToolOrb');
  await page.getByRole('link', { name: 'Try every option in the playground' }).click();
  await expect(page).toHaveURL(/\/playground\?orb=tool-orb$/);
  await expect(page.getByRole('tab', { name: 'ToolOrb' })).toHaveAttribute('aria-selected', 'true');
});
