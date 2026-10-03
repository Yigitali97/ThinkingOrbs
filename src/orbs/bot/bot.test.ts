// BotOrb: the pure state helpers (states, visor faces, captions) and the library export.
import { describe, expect, it } from 'vitest';
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
