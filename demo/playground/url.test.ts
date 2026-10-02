import { describe, expect, it } from 'vitest';
import { ASSISTANT_COLORS } from '../../src/orbs';
import { ENTRIES } from './registry';
import { decodeValue, readValues, writeQuery } from './url';

const entry = (name: string) => ENTRIES.find((e) => e.name === name)!;
const control = (name: string, key: string) => entry(name).controls.find((c) => c.key === key)!;

describe('playground URL state', () => {
  it('round-trips every control of every orb', () => {
    for (const e of ENTRIES) {
      // change every value away from its start, within the control's rules
      const values = Object.fromEntries(
        e.controls.map((c) => {
          switch (c.type) {
            case 'toggle':
              return [c.key, !c.init];
            case 'range':
              return [c.key, c.init === c.max ? c.min : c.max];
            case 'select':
              return [c.key, c.options.find((o) => o !== c.init) ?? c.init];
            case 'color':
              return [c.key, '#123abc'];
            case 'text':
              return [c.key, 'hello & goodbye?'];
          }
        })
      );
      const params = new URLSearchParams(writeQuery('x', e.controls, values));
      expect(params.get('orb')).toBe('x');
      expect(readValues(e.controls, params), e.name).toEqual(values);
    }
  });

  it('writes only the values that differ from the start', () => {
    const e = entry('StatusOrb');
    const start = Object.fromEntries(e.controls.map((c) => [c.key, c.init]));
    expect(writeQuery('status-orb', e.controls, start)).toBe('?orb=status-orb');
    expect(writeQuery('status-orb', e.controls, { ...start, paused: true })).toBe('?orb=status-orb&paused=1');
  });

  it('ignores values that a control cannot take', () => {
    const select = control('StatusOrb', 'variant');
    expect(decodeValue(select, 'not-a-variant')).toBeUndefined();
    const color = control('StatusOrb', 'color');
    expect(decodeValue(color, 'red')).toBeUndefined();
    expect(decodeValue(color, '#ABCDEF')).toBe('#abcdef');
    const toggle = control('StatusOrb', 'paused');
    expect(decodeValue(toggle, 'yes')).toBeUndefined();
    const range = control('StatusOrb', 'size');
    expect(decodeValue(range, 'abc')).toBeUndefined();
    expect(decodeValue(range, '')).toBeUndefined();
  });

  it('clamps and snaps numbers to the slider', () => {
    const size = control('StatusOrb', 'size'); // 16..200 step 2
    expect(decodeValue(size, '9999')).toBe(200);
    expect(decodeValue(size, '-5')).toBe(16);
    expect(decodeValue(size, '33')).toBe(34);
    const progress = control('IngestOrb', 'progress'); // 0..1 step 0.01
    expect(decodeValue(progress, '0.456')).toBe(0.46);
  });

  it('limits text length', () => {
    const name = control('IngestOrb', 'name');
    expect((decodeValue(name, 'x'.repeat(500)) as string).length).toBe(80);
  });

  it('falls back to the start values for missing or bad params', () => {
    const e = entry('SearchOrb');
    const v = readValues(e.controls, new URLSearchParams('phase=bogus&sources=4'));
    expect(v.phase).toBe('searching');
    expect(v.sources).toBe(4);
  });

  it('applies linked controls: a shared AssistantOrb state gets that state\'s colour', () => {
    const e = entry('AssistantOrb');
    const v = readValues(e.controls, new URLSearchParams('state=thinking'), e.adjust);
    expect(v.accent).toBe(ASSISTANT_COLORS.thinking);
    // ...unless the link sets a colour explicitly
    const custom = readValues(e.controls, new URLSearchParams('state=thinking&accent=%23112233'), e.adjust);
    expect(custom.accent).toBe('#112233');
  });
});
