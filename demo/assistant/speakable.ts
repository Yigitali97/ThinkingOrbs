// What a reply sounds like when read aloud: its text, plus one line about the first block it put on screen.

import type { Block } from './protocol';
import type { AssistantReply } from './reply';

const NOTE: Record<Exclude<Block['kind'], 'link'>, string> = {
  table: "I've put a table on screen.",
  chart: "I've put a chart on screen.",
  stat: "I've put the numbers on screen.",
  status: "I've put the status on screen.",
  draft: "I've put a draft on screen.",
};

export function speakable(reply: AssistantReply): string {
  const first = reply.blocks[0];
  const note = first && first.kind !== 'link' ? NOTE[first.kind] : '';
  return [reply.text.trim(), note].filter(Boolean).join(' ');
}
