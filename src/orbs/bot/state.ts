// BotOrb states and what each one shows: the visor face and the caption read to screen readers. Pure, no DOM.

export type BotState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'error';

/** What the dark visor shows: two eyes, a spinning arc, a voice waveform, or amber alert eyes. */
export type BotVisor = 'eyes' | 'arc' | 'wave' | 'alert';

export const BOT_STATES: BotState[] = ['idle', 'listening', 'thinking', 'speaking', 'happy', 'error'];

const CAPTIONS: Record<BotState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  happy: 'Done',
  error: 'Something went wrong',
};

const VISORS: Record<BotState, BotVisor> = {
  idle: 'eyes',
  listening: 'eyes',
  thinking: 'arc',
  speaking: 'wave',
  happy: 'eyes',
  error: 'alert',
};

/** The short status announced politely to assistive tech. */
export function botCaption(state: BotState): string {
  return CAPTIONS[state];
}

/** The face the visor shows in a state. */
export function visorFor(state: BotState): BotVisor {
  return VISORS[state];
}
