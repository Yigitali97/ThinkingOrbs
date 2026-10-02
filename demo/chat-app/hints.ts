// The suggestions shown in an empty chat and under the message box — one per orb use case —
// and the built-in sample attachments they use.

import { reelFrames, sceneImage } from '../samples';
import type { ChatAttachment } from './agent';

export type Sample = 'file' | 'image' | 'video';

export interface Hint {
  id: string;
  /** what the user does */
  label: string;
  /** the orb it shows */
  orb: string;
  color: string;
  /** one sentence on what you'll see */
  about: string;
  prompt?: string;
  sample?: Sample;
  dictate?: boolean;
}

export const HINTS: Hint[] = [
  { id: 'search', label: 'Search the web', orb: 'SearchOrb', color: '#a78bfa', about: 'Sources arrive, get ranked, and the best are merged into the answer.', prompt: 'Search the web for electric truck range' },
  { id: 'tools', label: 'Plan a trip budget', orb: 'ToolOrb', color: '#38bdf8', about: 'Each tool call orbits until it finishes. One of them fails on purpose.', prompt: 'Plan a 3-day trip budget for 4 people' },
  { id: 'think', label: 'Think it through', orb: 'ReasoningOrb', color: '#ff9a2e', about: 'Every reasoning step adds a node, and the arc shows the thinking budget.', prompt: 'Think step by step: which is cheaper over 8 years, a $32k EV or a $26k petrol car?' },
  { id: 'file', label: 'Read a file', orb: 'IngestOrb', color: '#2dd4bf', about: 'The file uploads into the sphere, then gets read. Uses a sample report.', sample: 'file', prompt: 'Summarize this report' },
  { id: 'image', label: 'Look at an image', orb: 'VisionOrb', color: '#f472b6', about: 'The image is scanned and its brightest area is marked. Uses a sample photo.', sample: 'image', prompt: 'Describe this image' },
  { id: 'video', label: 'Watch a video', orb: 'ReelOrb', color: '#fb923c', about: 'The frames are watched one by one as a film strip. Uses a sample clip.', sample: 'video', prompt: 'What happens in this clip?' },
  { id: 'dictate', label: 'Dictate a message', orb: 'VoiceOrb', color: '#818cf8', about: 'Speak instead of typing. The ring follows your voice.', dictate: true },
];

const SAMPLE_REPORT = `Fleet report — Q3
Trips completed: 1,284 (up 6% on Q2)
Fuel spend: $41,200 (down 3%)
Average idle time: 11 minutes per trip
Vehicles due for service: 2
Driver satisfaction: 4.6 out of 5
Notes: shorter idle times saved fuel across the fleet; two vans need brake checks before October.`;

const uid = () => Math.random().toString(36).slice(2, 10);

export async function makeSample(kind: Sample): Promise<ChatAttachment> {
  if (kind === 'file') {
    const file = new File([SAMPLE_REPORT], 'fleet-report.txt', { type: 'text/plain' });
    return { id: uid(), name: file.name, type: file.type, size: file.size, file };
  }
  if (kind === 'image') {
    const url = sceneImage('sunset', 512);
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'sunset.png', { type: 'image/png' });
    return { id: uid(), name: file.name, type: file.type, size: file.size, file, url };
  }
  return { id: uid(), name: 'day-timelapse.mp4', type: 'video/mp4', size: 2_400_000, frames: reelFrames(12) };
}
