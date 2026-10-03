// Every page of the demo site. Plain data with no React or DOM, so the Vite
// build can import it too and write one prerendered HTML file per page.

export const SITE_NAME = 'ThinkingOrbs';
export const SITE_DESCRIPTION =
  'Animated orb components for AI interfaces: fourteen React components that show what an assistant is doing, driven by real audio, tokens, tool calls, sources and progress.';

export type Group = 'Voice' | 'Chat' | 'Search' | 'Files & reasoning';
export const GROUPS: Group[] = ['Voice', 'Chat', 'Search', 'Files & reasoning'];

export interface ComponentMeta {
  slug: string;
  name: string;
  group: Group;
  /** One line: what it's for. */
  summary: string;
  /** The orb's own colour, used to tint its page. */
  tint: string;
}

export const COMPONENTS: ComponentMeta[] = [
  { slug: 'assistant-orb', name: 'AssistantOrb', group: 'Voice', tint: '#3b8bff', summary: 'A dot sphere for voice assistants, with a colour and motion for each conversation state.' },
  { slug: 'voice-orb', name: 'VoiceOrb', group: 'Voice', tint: '#7c9cff', summary: 'A glowing ring that breathes with audio: the microphone, a TTS stream or any level.' },
  { slug: 'status-orb', name: 'StatusOrb', group: 'Chat', tint: '#e4e4ea', summary: 'Small dot-sphere indicators for what an agent is doing, in fifteen variants.' },
  { slug: 'token-orb', name: 'TokenOrb', group: 'Chat', tint: '#34d399', summary: 'A tiny inline orb that pulses with every streamed chunk of a chat reply.' },
  { slug: 'tool-orb', name: 'ToolOrb', group: 'Chat', tint: '#38bdf8', summary: 'One satellite per tool call: running tools orbit, finished ones dock, failed ones fall away.' },
  { slug: 'ask-orb', name: 'AskOrb', group: 'Chat', tint: '#c4b5fd', summary: 'The whole flow in one component: prompt bar, thinking orb with live stages, answer card.' },
  { slug: 'mascot-orb', name: 'MascotOrb', group: 'Chat', tint: '#5f9ae6', summary: 'A glossy bubble character that blinks, glances at the pointer and bounces when pressed.' },
  { slug: 'bot-orb', name: 'BotOrb', group: 'Chat', tint: '#8b7cff', summary: 'A friendly robot that floats on a glowing pedestal and shows what the assistant is doing: listening, thinking, speaking.' },
  { slug: 'gaze-orb', name: 'GazeOrb', group: 'Chat', tint: '#f2f2f2', summary: 'A ball whose eyes turn toward the pointer in 3D, with occasional blinks.' },
  { slug: 'search-orb', name: 'SearchOrb', group: 'Search', tint: '#a78bfa', summary: 'Sources fly into orbit as they are found, get ranked, then merge into the answer.' },
  { slug: 'ingest-orb', name: 'IngestOrb', group: 'Files & reasoning', tint: '#2dd4bf', summary: 'A file card that breaks into dots and flows into the sphere as the upload progresses.' },
  { slug: 'reasoning-orb', name: 'ReasoningOrb', group: 'Files & reasoning', tint: '#ff9a2e', summary: 'A constellation that grows a node per reasoning step, with a thinking-budget arc.' },
  { slug: 'vision-orb', name: 'VisionOrb', group: 'Files & reasoning', tint: '#f472b6', summary: 'An image seen through a turning dot sphere, scanned, with labelled focus points.' },
  { slug: 'reel-orb', name: 'ReelOrb', group: 'Files & reasoning', tint: '#fb923c', summary: 'Video frames orbit like a film strip; the frame being watched beams into the core.' },
];

export interface ExampleMeta {
  slug: string;
  name: string;
  summary: string;
  /** Orbs the example uses, by name. */
  uses: string[];
  tint: string;
}

export const EXAMPLES: ExampleMeta[] = [
  {
    slug: 'chat-app',
    name: 'Chat app',
    summary: 'A chat where each orb has one job and appears only while it is doing it: search, tools, reasoning, files, images, video and dictation.',
    uses: ['SearchOrb', 'ToolOrb', 'ReasoningOrb', 'IngestOrb', 'VisionOrb', 'ReelOrb', 'VoiceOrb', 'TokenOrb', 'MascotOrb', 'StatusOrb'],
    tint: '#a78bfa',
  },
  {
    slug: 'voice-assistant',
    name: 'Voice assistant',
    summary: "A working voice assistant on the browser's own speech recognition and speech synthesis. Talk to it, interrupt it, mute it. No backend.",
    uses: ['AssistantOrb'],
    tint: '#3b8bff',
  },
  {
    slug: 'agent-run',
    name: 'Agent run',
    summary: 'One agent turn from question to answer, the way a product would show it: reasoning, then search, then tools, then a streamed reply.',
    uses: ['ReasoningOrb', 'SearchOrb', 'ToolOrb', 'TokenOrb', 'StatusOrb'],
    tint: '#ff9a2e',
  },
  {
    slug: 'ask-flow',
    name: 'Ask and answer',
    summary: 'AskOrb wired to an agent that reports its stages, with a switch to see how a failure looks.',
    uses: ['AskOrb'],
    tint: '#c4b5fd',
  },
];

/** Whole sites built on the orbs. They are separate apps, so they are linked, not routed to. */
export const SITE_LINKS: { name: string; summary: string; href: '/hermes/'; tint: string }[] = [
  {
    name: 'Hermes',
    summary: 'An internal company portal whose AI assistant is on every page, answers with tables, charts and drafts, and shows each person only what their role allows.',
    href: '/hermes/',
    tint: '#7c9cff',
  },
];

export interface PageMeta {
  title: string;
  description: string;
}

/** Paths that show the first component's page: the site opens on it. */
export const isHome = (path: string) => path === '/' || path === '/components';

const strip = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

/** Title and description for a path, or null when no page exists there. */
export function pageMeta(rawPath: string): PageMeta | null {
  const path = strip(rawPath);
  // the site opens on the first component's page
  if (path === '/' || path === '/components') return { title: `${SITE_NAME}: animated orbs for AI interfaces`, description: SITE_DESCRIPTION };
  if (path === '/examples')
    return { title: `Examples · ${SITE_NAME}`, description: 'Complete samples built from the orbs: a chat app, a voice assistant, an agent run and an ask-and-answer flow.' };
  if (path === '/playground')
    return { title: `Playground · ${SITE_NAME}`, description: 'Pick an orb, change every option live, and copy the generated code into your app.' };
  const c = path.match(/^\/components\/([a-z-]+)$/);
  if (c) {
    const meta = COMPONENTS.find((m) => m.slug === c[1]);
    return meta ? { title: `${meta.name} · ${SITE_NAME}`, description: meta.summary } : null;
  }
  return null;
}

/** Every page path, for prerendering and tests. */
export const ALL_PATHS: string[] = ['/', '/components', ...COMPONENTS.map((c) => `/components/${c.slug}`), '/examples', '/playground'];
