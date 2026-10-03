// Reference content for each component on the components page: usage, props, states and notes.
// Kept in step with the README; `docs.test.ts` checks every component has an entry.

export interface Prop {
  name: string;
  type: string;
  def: string;
  about?: string;
}

export interface StateRow {
  name: string;
  /** hex swatch, when the state has its own colour */
  color?: string;
  about: string;
}

export interface Doc {
  intro: string;
  usage: string;
  props: Prop[];
  states?: { title: string; rows: StateRow[] };
  methods?: Array<{ name: string; about: string }>;
  notes?: string[];
}

const common: Prop[] = [
  { name: 'className', type: 'string', def: '—' },
  { name: 'style', type: 'CSSProperties', def: '—' },
];

export const DOCS: Record<string, Doc> = {
  'assistant-orb': {
    intro:
      'A dot sphere for voice assistants. Each state has its own colour and motion, and the sphere cross-fades between them. Some states play a one-off reaction when they begin: a springy shrink on interrupted, a glitch shake on error.',
    usage: `import { AssistantOrb, useMicrophone } from './orbs';

const mic = useMicrophone();

<AssistantOrb state="listening" stream={mic.stream} />

// or drive it from your own audio level (polled every frame)
<AssistantOrb state={state} getLevel={() => ttsLevel} colors={{ thinking: '#f5b400' }} />`,
    props: [
      { name: 'state', type: 'AssistantState', def: "'idle'", about: 'One of the states below.' },
      { name: 'size', type: 'number', def: '320' },
      { name: 'stream', type: 'MediaStream | null', def: 'null', about: 'Audio to react to: the microphone or TTS playback.' },
      { name: 'getLevel', type: '() => number', def: '—', about: 'Instead of stream: polled every frame, return 0–1.' },
      { name: 'colors', type: 'Partial<Record<AssistantState, string>>', def: '—', about: "Override any state's hex colour." },
      { name: 'label', type: 'string | null', def: '"Assistant <state>"', about: 'null hides it from assistive tech.' },
      ...common,
    ],
    states: {
      title: 'States',
      rows: [
        { name: 'idle', color: '#9a9aa3', about: 'Slow rotation, gentle breath.' },
        { name: 'connecting', color: '#8b8fff', about: 'Bands of dots rise up the sphere as it assembles.' },
        { name: 'listening', color: '#3b8bff', about: 'Dots shiver outward with the voice, strongest facing the user.' },
        { name: 'thinking', color: '#ff9a2e', about: 'Faster spin, a bright band sweeping down.' },
        { name: 'speaking', color: '#34d399', about: 'Rings roll out from the front with the audio.' },
        { name: 'interrupted', color: '#9fc3ff', about: 'A quick springy shrink when the user cuts in, then listens.' },
        { name: 'muted', color: '#5c5c66', about: 'Dims, shrinks slightly, nearly still, ignores audio.' },
        { name: 'error', color: '#f05252', about: 'Glitch shake, slow red pulse, dots flickering out.' },
      ],
    },
    notes: ['Without any audio, speaking uses a built-in voice pattern so it still moves.', 'Default colours are exported as ASSISTANT_COLORS.'],
  },
  'voice-orb': {
    intro: 'A glowing gradient ring drawn with WebGL. Its outline breathes and wobbles with audio: the microphone, a TTS stream, or any level you supply.',
    usage: `import { VoiceOrb, useMicrophone } from './orbs';

const mic = useMicrophone();

<VoiceOrb stream={mic.stream} />
<VoiceOrb getLevel={() => level} sensitivity={1.4} />`,
    props: [
      { name: 'size', type: 'number', def: '420' },
      { name: 'stream', type: 'MediaStream | null', def: 'null', about: 'Audio to react to.' },
      { name: 'getLevel', type: '() => number', def: '—', about: 'Instead of stream, 0–1.' },
      { name: 'sensitivity', type: 'number', def: '1', about: 'How strongly it reacts.' },
      { name: 'label', type: 'string | null', def: "'Voice activity'" },
      ...common,
    ],
    notes: ['Requires WebGL.', 'useMicrophone() needs a secure page (https:// or localhost) and stops the tracks when the component unmounts.'],
  },
  'status-orb': {
    intro: 'Small dot-sphere indicators for what an agent is doing. Fifteen variants; change variant in place as the status changes.',
    usage: `import { StatusOrb } from './orbs';

<StatusOrb variant="reasoning" size={24} />`,
    props: [
      { name: 'variant', type: 'StatusVariant', def: "'base'", about: 'One of the 15 variants (STATUS_VARIANTS lists them).' },
      { name: 'size', type: 'number', def: '72' },
      { name: 'color', type: 'string', def: "'#ffffff'", about: 'Dot colour, any CSS colour.' },
      { name: 'paused', type: 'boolean', def: 'false', about: 'Freeze on the current frame.' },
      { name: 'label', type: 'string | null', def: 'the variant name' },
      ...common,
    ],
    notes: [
      'All StatusOrbs on a page share one animation loop, and orbs scrolled out of view are skipped.',
      'With prefers-reduced-motion, StatusOrb shows a single still frame.',
    ],
  },
  'token-orb': {
    intro:
      'A tiny inline orb for chat replies. Every streamed chunk lights a few dots and adds energy, so its motion follows the real streaming speed: bursty streams look bursty, slow ones calm. It shimmers while waiting for the first token and settles green when done.',
    usage: `import { TokenOrb, TokenOrbRef } from './orbs';

<TokenOrb tokens={tokenCount} done={!streaming} size={20} />

// or push per chunk instead of counting
const orb = useRef<TokenOrbRef>(null);
<TokenOrb ref={orb} done={!streaming} />
orb.current?.push(chunk.tokens);`,
    props: [
      { name: 'tokens', type: 'number', def: '—', about: 'Running total; each increase pulses the orb.' },
      { name: 'done', type: 'boolean', def: 'false', about: 'Reply finished; settles and turns doneColor.' },
      { name: 'size', type: 'number', def: '22' },
      { name: 'color', type: 'string', def: "'#d4d4dc'" },
      { name: 'doneColor', type: 'string', def: "'#34d399'" },
      { name: 'label', type: 'string | null', def: '"Reply streaming" / "Reply complete"' },
      ...common,
    ],
    methods: [{ name: 'push(count?: number)', about: 'Pulse for a streamed chunk without re-rendering.' }],
  },
  'tool-orb': {
    intro:
      'One coloured satellite per tool call around a dot-sphere core. Running tools orbit on their own tilted paths; a finished tool spirals in and docks with a flash in its colour; a failed one turns red and drifts away. Optional chips underneath list each tool, and give screen readers the list.',
    usage: `import { ToolOrb } from './orbs';

<ToolOrb
  tools={[
    { id: 'search', label: 'web_search', status: 'running' },
    { id: 'files', label: 'read_file', status: 'done' },
  ]}
/>`,
    props: [
      { name: 'tools', type: 'ToolCall[]', def: 'required', about: "{ id, label?, status: 'running' | 'done' | 'error', color? }" },
      { name: 'size', type: 'number', def: '200' },
      { name: 'showLabels', type: 'boolean', def: 'true', about: 'Chips under the orb.' },
      ...common,
    ],
    states: {
      title: 'Tool status',
      rows: [
        { name: 'running', about: 'Orbits the core on its own tilted path.' },
        { name: 'done', color: '#34d399', about: 'Spirals in and docks with a flash in its colour.' },
        { name: 'error', color: '#f05252', about: 'Turns red and drifts away.' },
      ],
    },
    notes: ['Colours come from TOOL_COLORS in order of first appearance unless a tool sets color.'],
  },
  'ask-orb': {
    intro:
      'The whole flow in one component: a prompt bar with a flowing gradient border folds into a sphere and flies up, a dot orb steps through Thinking, Searching, Analyzing and Composing, turns green, and stretches into an answer card with a New question button.',
    usage: `import { AskOrb } from './orbs';

<AskOrb
  style={{ height: '100vh' }}
  onAsk={async (question, report, signal) => {
    report('searching');
    const docs = await search(question, { signal });
    report('analyzing');
    report('composing');
    return await answer(docs); // a string or any React content
  }}
/>`,
    props: [
      { name: 'onAsk', type: 'AskHandler', def: 'demo sequence', about: '(question, report, signal) => Promise<ReactNode>' },
      { name: 'placeholder', type: 'string', def: "'Ask anything...'" },
      { name: 'minStageMs', type: 'number', def: '1100', about: 'Minimum time each stage stays on screen.' },
      { name: 'answerLabel', type: 'string', def: "'Answer'", about: 'Small label above the answer.' },
      ...common,
    ],
    states: {
      title: 'Stages',
      rows: [
        { name: 'thinking', about: 'A bright band sweeps down the sphere.' },
        { name: 'searching', about: 'A soft spotlight wanders over the sphere.' },
        { name: 'analyzing', about: 'A slower, sharper scan line with a soft tail.' },
        { name: 'composing', about: 'A wide band sweeps down through bright columns.' },
      ],
    },
    notes: [
      "report(stage) accepts 'thinking' | 'searching' | 'analyzing' | 'composing'.",
      'If onAsk throws, the orb shows Failed and an error card with the message.',
      'signal aborts when the component unmounts.',
      'Give AskOrb a height: its own style, or a sized parent.',
    ],
  },
  'mascot-orb': {
    intro: 'A glossy bubble character with glowing eyes: staggered blinks (the left eye leads), a glance toward the pointer, and a springy jelly bounce when pressed.',
    usage: `import { MascotOrb, MascotOrbRef } from './orbs';

const mascot = useRef<MascotOrbRef>(null);
<MascotOrb ref={mascot} size={240} color="#5f9ae6" />

mascot.current?.bounce(); // for example when a reply arrives`,
    props: [
      { name: 'size', type: 'number', def: '240', about: 'The bubble fills about 70%; the rest is room for the glow.' },
      { name: 'color', type: 'string', def: "'#5f9ae6'", about: 'Body tint (hex).' },
      { name: 'blinking', type: 'boolean', def: 'true', about: 'Random blinks.' },
      { name: 'bouncy', type: 'boolean', def: 'true', about: 'Jelly bounce on press.' },
      { name: 'label', type: 'string | null', def: "'Orb mascot'" },
      ...common,
    ],
    methods: [
      { name: 'blink()', about: 'Blink now.' },
      { name: 'bounce(strength?: number)', about: 'Play the jelly bounce.' },
    ],
  },
  'bot-orb': {
    intro:
      'A friendly robot with a dark visor that floats on a glowing ring pedestal. Its face shows what the assistant is doing: eyes that blink and glance at the pointer while idle, pulsing ear lights while listening, a spinning arc while thinking, a waveform while speaking, a hop when an answer lands and amber eyes when something fails. SVG and CSS, no canvas.',
    usage: `import { BotOrb, BotOrbRef } from './orbs';

const bot = useRef<BotOrbRef>(null);
<BotOrb ref={bot} state="thinking" size={220} />

// listening and speaking follow real audio
<BotOrb state="speaking" stream={ttsStream} />

bot.current?.bounce(); // for example when a reply lands`,
    props: [
      { name: 'state', type: 'BotState', def: "'idle'", about: 'idle · listening · thinking · speaking · happy · error.' },
      { name: 'size', type: 'number', def: '160', about: 'Width and height. Below 72 the pedestal hides and the face fills the frame.' },
      { name: 'pedestal', type: 'boolean', def: 'true', about: 'The glowing ring pedestal under the bot.' },
      { name: 'stream', type: 'MediaStream | null', def: 'null', about: 'Audio to react to while listening or speaking: the mic, or TTS playback.' },
      { name: 'getLevel', type: '() => number', def: '—', about: 'Polled every frame while listening or speaking; return 0..1.' },
      { name: 'level', type: 'number', def: '—', about: 'Loudness 0..1 from your own meter. stream and getLevel take precedence.' },
      { name: 'label', type: 'string | null', def: "'Hermes'", about: 'Accessible name; null hides the bot from assistive tech.' },
      ...common,
    ],
    states: {
      title: 'States',
      rows: [
        { name: 'idle', about: 'Floats gently; the eyes blink now and then and glance toward the pointer.' },
        { name: 'listening', about: 'The ear lights pulse with the audio level and sound rings ripple out.' },
        { name: 'thinking', about: 'The visor shows a spinning arc and sparks circle the head.' },
        { name: 'speaking', about: 'The visor becomes a waveform driven by the audio.' },
        { name: 'happy', about: 'Smiling eyes and a hop. Call bounce() for a hop without changing state.' },
        { name: 'error', about: 'Amber alert eyes and ear lights, and a short shake.' },
      ],
    },
    methods: [
      { name: 'bounce()', about: 'Hop once.' },
      { name: 'blink()', about: 'Blink both eyes.' },
    ],
    notes: [
      'BOT_STATES lists the states in order; botCaption(state) gives the short caption the bot announces politely (Ready, Listening, Thinking…).',
      'With prefers-reduced-motion the bot stops floating, pulsing and orbiting; state changes become fades.',
      'The wrapper carries data-bot and data-state, so tests and styles can find it.',
    ],
  },
  'gaze-orb': {
    intro: 'A white ball whose eyes live on its surface and turn toward the pointer in 3D, sliding out to the rim and foreshortening when the pointer is far away, with occasional blinks.',
    usage: `import { GazeOrb, GazeOrbRef } from './orbs';

const orb = useRef<GazeOrbRef>(null);
<GazeOrb ref={orb} size={220} />

orb.current?.blink();`,
    props: [
      { name: 'size', type: 'number', def: '240' },
      { name: 'ballColor', type: 'string', def: "'#f2f2f2'" },
      { name: 'eyeColor', type: 'string', def: "'#0e0e0e'" },
      { name: 'outlineColor', type: 'string', def: "'rgba(0, 0, 0, 0.35)'", about: "'transparent' to hide it." },
      { name: 'blinking', type: 'boolean', def: 'true' },
      { name: 'label', type: 'string | null', def: "'Orb watching the pointer'" },
      ...common,
    ],
    methods: [{ name: 'blink()', about: 'Blink now.' }],
    notes: ['It follows the pointer anywhere on the page, touch included, and recentres when the pointer leaves the window.'],
  },
  'search-orb': {
    intro:
      'For AI search. Radar pings pulse out while searching and each new source curves in from the edge into orbit; ranking pulls the best sources closer; synthesis absorbs them into the core, best first.',
    usage: `import { SearchOrb } from './orbs';

<SearchOrb
  phase="searching"
  sources={[{ id: '1', domain: 'arxiv.org', score: 0.9 }]} // append as results arrive
/>`,
    props: [
      { name: 'phase', type: 'SearchPhase', def: 'required' },
      { name: 'sources', type: 'SearchSource[]', def: '[]', about: '{ id, domain?, icon?, score? }' },
      { name: 'size', type: 'number', def: '260' },
      { name: 'showCaption', type: 'boolean', def: 'true', about: '"Searching · 7 sources", "Done · 10 sources", "No results".' },
      ...common,
    ],
    states: {
      title: 'Phases',
      rows: [
        { name: 'idle', color: '#9a9aa3', about: 'Resting.' },
        { name: 'searching', color: '#a78bfa', about: 'Radar pings; new sources fly in.' },
        { name: 'ranking', color: '#a78bfa', about: 'A highlight steps between sources; a higher score orbits closer.' },
        { name: 'synthesizing', color: '#c4b5fd', about: 'Sources absorbed one at a time, best first, each with a flash.' },
        { name: 'done', color: '#34d399', about: 'The core settles; anything left is pulled in.' },
        { name: 'empty', color: '#6b6b75', about: 'One wide sweep, then dims.' },
      ],
    },
    notes: [
      'Sources are drawn as their icon (when given and loaded), else a letter badge from domain, else a glowing dot.',
      'Setting sources to [] resets instantly for a fresh search.',
    ],
  },
  'ingest-orb': {
    intro:
      'For uploads. A file card made of dots sits beside a teal sphere; as progress rises, dots peel off the card top-first and arc into the sphere. Reading sweeps a scan band, done turns green, error turns the leftover card red and shakes it.',
    usage: `import { IngestOrb } from './orbs';

<IngestOrb name="report.pdf" progress={0.42} status="uploading" />`,
    props: [
      { name: 'name', type: 'string', def: "'file'", about: 'Picks the card type and badge (report.pdf → PDF).' },
      { name: 'kind', type: 'IngestKind', def: 'from name', about: 'file · pdf · doc · sheet · image · video · audio · code' },
      { name: 'progress', type: 'number', def: 'required', about: '0–1' },
      { name: 'status', type: 'IngestStatus', def: "'uploading'" },
      { name: 'width', type: 'number', def: '360' },
      { name: 'height', type: 'number', def: '220' },
      { name: 'showCaption', type: 'boolean', def: 'true', about: '"Uploading report.pdf · 42%"' },
      ...common,
    ],
    states: {
      title: 'Status',
      rows: [
        { name: 'uploading', color: '#2dd4bf', about: 'Dots peel off the card and arc into the sphere with progress.' },
        { name: 'reading', color: '#2dd4bf', about: 'A scan band sweeps the sphere.' },
        { name: 'done', color: '#34d399', about: 'Turns green.' },
        { name: 'error', color: '#f05252', about: 'The leftover card turns red and shakes.' },
      ],
    },
    notes: ['The canvas is a progressbar (0–100) for assistive tech.', 'kindFromName(name) is exported if you need the detection elsewhere.'],
  },
  'reasoning-orb': {
    intro:
      'For deep reasoning. Each step grows a node out from the centre, linked to the previous step and to its nearest earlier thought, building a slowly turning constellation. A pulse runs along the newest link, the active step glows, and an outer arc shows how much of the thinking budget is used (red above 85%). Turns green when finished.',
    usage: `import { ReasoningOrb } from './orbs';

<ReasoningOrb
  steps={[{ id: '1', label: 'Reading the question' }, { id: '2', label: 'Comparing fuel costs' }]}
  thinking
  budget={0.4}
/>`,
    props: [
      { name: 'steps', type: 'ReasoningStep[]', def: 'required', about: '{ id, label? }; append as the model reasons.' },
      { name: 'thinking', type: 'boolean', def: 'true', about: 'false shows a green "Reasoned in N steps".' },
      { name: 'budget', type: 'number', def: '—', about: 'Share of the budget used, 0–1; leave out to hide the arc.' },
      { name: 'size', type: 'number', def: '280' },
      { name: 'showCaption', type: 'boolean', def: 'true', about: '"Step 5 · Comparing fuel costs · 39% of budget"' },
      ...common,
    ],
    notes: ['Passing a different list of steps, not an extension of the current one, starts a new constellation.'],
  },
  'vision-orb': {
    intro:
      'For image understanding. The picture is seen through a turning dot sphere, each dot taking the colour of the image behind it. Scanning sweeps a line that reveals the colours; done keeps full colour and pulses labelled focus points, such as detected objects.',
    usage: `import { VisionOrb } from './orbs';

<VisionOrb
  src={URL.createObjectURL(file)}
  status="done"
  focus={[{ x: 0.66, y: 0.38, label: 'sun' }]}
/>`,
    props: [
      { name: 'src', type: 'string | null', def: 'null', about: 'Image URL; see the note below.' },
      { name: 'status', type: 'VisionStatus', def: "'loading'" },
      { name: 'focus', type: 'VisionFocus[]', def: '[]', about: '{ x, y, label? } in 0–1 image coordinates.' },
      { name: 'size', type: 'number', def: '300' },
      { name: 'showCaption', type: 'boolean', def: 'true', about: '"Looking at the image…", "Found 3 things"' },
      ...common,
    ],
    states: {
      title: 'Status',
      rows: [
        { name: 'loading', about: 'A grey sphere, twinkling while the image loads.' },
        { name: 'scanning', about: 'A scan line sweeps down, revealing the colours.' },
        { name: 'done', about: 'Full colour, with focus points pulsing.' },
        { name: 'error', color: '#f05252', about: 'The dots turn red and flicker.' },
      ],
    },
    notes: [
      "The orb reads the image's pixels, so src must be blob:, data:, same-origin, or served with CORS headers.",
      "A cross-origin image without CORS doesn't break anything; the sphere just stays grey.",
    ],
  },
  'reel-orb': {
    intro:
      'For video understanding. Thumbnail frames orbit a core on a tilted film-strip ring. The strip turns so the frame being analysed comes to the front, where it glows and beams into the core; watched frames keep a tint.',
    usage: `import { ReelOrb, captureFrames } from './orbs';

const frames = await captureFrames(videoFile, 12);
<ReelOrb frames={frames} progress={0.4} status="analyzing" />`,
    props: [
      { name: 'frames', type: 'string[]', def: '[]', about: 'Thumbnail URLs, one per frame.' },
      { name: 'count', type: 'number', def: '12', about: "Frame count when you don't have thumbnails." },
      { name: 'progress', type: 'number', def: '0', about: '0–1 through the video.' },
      { name: 'status', type: 'ReelStatus', def: "'loading'" },
      { name: 'width', type: 'number', def: '420' },
      { name: 'height', type: 'number', def: '260' },
      { name: 'showCaption', type: 'boolean', def: 'true', about: '"Watching frame 6 of 12"' },
      ...common,
    ],
    states: {
      title: 'Status',
      rows: [
        { name: 'loading', color: '#9a9aa3', about: 'The strip waits in grey.' },
        { name: 'analyzing', color: '#fb923c', about: 'The current frame swings to the front and beams into the core.' },
        { name: 'done', color: '#34d399', about: 'The core settles green.' },
        { name: 'error', color: '#f05252', about: 'Turns red.' },
      ],
    },
    notes: [
      'The canvas is a progressbar (0–100).',
      'Without thumbnails, frames show as numbered placeholders.',
      'captureFrames(src, count = 12, width = 192) grabs evenly spaced thumbnails in the browser and handles WebM files that report an Infinity duration.',
    ],
  },
};
