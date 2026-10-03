// BotOrb: the pure state helpers (states, visor faces, captions) and the library export.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BotOrb } from './BotOrb';
import { BOT_STATES, botCaption, visorFor } from './state';
import * as orbs from '../index';

describe('BotOrb state', () => {
  it('has six states', () => {
    expect(BOT_STATES).toHaveLength(6);
    expect(new Set(BOT_STATES).size).toBe(6);
  });

  it('maps each state to a visor face', () => {
    expect(visorFor('idle')).toBe('eyes');
    expect(visorFor('listening')).toBe('eyes');
    expect(visorFor('happy')).toBe('eyes');
    expect(visorFor('thinking')).toBe('arc');
    expect(visorFor('speaking')).toBe('wave');
    expect(visorFor('error')).toBe('alert');
  });

  it('captions each state', () => {
    expect(botCaption('thinking')).toBe('Thinking');
    expect(BOT_STATES.map(botCaption)).toEqual(['Ready', 'Listening', 'Thinking', 'Speaking', 'Done', 'Something went wrong']);
  });

  it('is exported from the library entry point', () => {
    expect(orbs).toHaveProperty('BotOrb');
  });
});

describe('BotOrb markup', () => {
  it('announces its state from outside the image', () => {
    const html = renderToStaticMarkup(createElement(BotOrb, { state: 'thinking' }));
    expect(html).toMatch(/^<div data-bot="" data-state="thinking"/);
    const start = html.indexOf('role="img"');
    expect(start).toBeGreaterThan(0);
    // the image holds only the SVG, so the first </div> after it closes it
    const img = html.slice(start, html.indexOf('</div>', start));
    expect(img).toContain('aria-label="Assistant"');
    expect(img).not.toContain('aria-live');
    expect(img).not.toContain('Thinking');
    const rest = html.slice(start + img.length);
    expect(rest).toMatch(/aria-live="polite"[^>]*>Thinking</);
  });

  it('hides everything from assistive tech when the label is null', () => {
    const html = renderToStaticMarkup(createElement(BotOrb, { label: null }));
    expect(html.slice(0, html.indexOf('>'))).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });
});
