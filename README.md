# ThinkingOrbs

Animated orb components for AI interfaces — thirteen React components that show what an assistant is doing: listening, thinking, searching, calling tools, reading files, watching video, answering.

Every orb is drawn on a `<canvas>` and is driven by **real data** where it can be — audio level, streamed tokens, tool calls, sources, upload progress, reasoning steps, image pixels, video frames — instead of a canned loop.

- **React 17+**, TypeScript, no dependencies beyond React
- Works with Vite, Create React App and Next.js (components are marked `'use client'`)
- Exposes status text and ARIA roles for screen readers, and most orbs respect `prefers-reduced-motion`

```tsx
import { AssistantOrb, useMicrophone } from './orbs';

const mic = useMicrophone();
<AssistantOrb state="listening" stream={mic.stream} />;
```

---

## Contents

- [Which orb for which situation](#which-orb-for-which-situation)
- [Getting started](#getting-started)
- Components
  - Voice: [AssistantOrb](#assistantorb) · [VoiceOrb](#voiceorb)
  - Chat: [StatusOrb](#statusorb) · [TokenOrb](#tokenorb) · [ToolOrb](#toolorb) · [AskOrb](#askorb) · [MascotOrb](#mascotorb) · [GazeOrb](#gazeorb)
  - Search: [SearchOrb](#searchorb)
  - Files & reasoning: [IngestOrb](#ingestorb) · [ReasoningOrb](#reasoningorb) · [VisionOrb](#visionorb) · [ReelOrb](#reelorb)
- [Helpers](#helpers)
- [Shared conventions](#shared-conventions)
- [Using an orb without React](#using-an-orb-without-react)
- [Demo & development](#demo--development)
- [AI-native sites](#ai-native-sites)
- [Project structure](#project-structure)

---

## Which orb for which situation

| Situation | Orb | Driven by |
|---|---|---|
| Voice assistant conversation | **AssistantOrb** | `state` + audio |
| Ambient voice level / recording | **VoiceOrb** | audio |
| Small "working" indicator | **StatusOrb** | `variant` (15 animations) |
| Streaming chat reply | **TokenOrb** | streamed tokens |
| Agent calling tools | **ToolOrb** | list of tool calls |
| Full ask → answer flow | **AskOrb** | your agent's stages |
| Assistant persona / mascot | **MascotOrb**, **GazeOrb** | pointer + clicks |
| AI search | **SearchOrb** | `phase` + found sources |
| File upload / ingestion | **IngestOrb** | upload `progress` |
| Deep reasoning | **ReasoningOrb** | reasoning steps + budget |
| Image understanding | **VisionOrb** | the image + focus points |
| Video understanding | **ReelOrb** | video frames + `progress` |

---

## Getting started

Copy the `src/orbs/` folder into your project and import from its entry point:

```tsx
import { StatusOrb, TokenOrb, SearchOrb } from './orbs';
```

Each orb also lives in its own folder (`src/orbs/<name>/`), so you can copy only the ones you need. Most orbs build on two small shared modules — copy `src/orbs/shared/` along with them.

**Stylesheets.** Two components import a CSS file of their own: `AskOrb` (`ask/ask-orb.css`) and `ToolOrb` (`tool/tool-orb.css`). Vite, CRA and the Next.js App Router handle this as-is. If your setup only allows global CSS in a single entry file (for example the Next.js Pages Router), import those two files there instead.

**Microphone.** `useMicrophone()` and microphone input need a secure page (`https://` or `localhost`).

---

## Components

All components accept `className` and `style`. Sizes are in CSS pixels. Defaults are shown in the tables.

### Voice

#### AssistantOrb

A dot sphere for voice assistants. Each state has its own colour and motion, and the sphere cross-fades between them; one-off reactions play when a state begins (a springy shrink on `interrupted`, a glitch shake on `error`).

| State | Colour | Motion |
|---|---|---|
| `idle` | grey | slow rotation, gentle breath |
| `connecting` | indigo | bands of dots rise up the sphere as it "assembles" |
| `listening` | blue | dots shiver outward with the voice, strongest facing the user |
| `thinking` | orange | faster spin, a bright band sweeping down |
| `speaking` | green | rings roll out from the front with the audio |
| `interrupted` | light blue | quick springy shrink when the user cuts in, then listens |
| `muted` | dark grey | dims, shrinks slightly, nearly still, ignores audio |
| `error` | red | glitch shake, slow red pulse, dots flickering out |

```tsx
const mic = useMicrophone();
<AssistantOrb state="listening" stream={mic.stream} />
<AssistantOrb state={state} getLevel={() => ttsLevel} colors={{ thinking: '#f5b400' }} />
```

| Prop | Type | Default | |
|---|---|---|---|
| `state` | `AssistantState` | `'idle'` | one of the states above |
| `size` | `number` | `320` | |
| `stream` | `MediaStream \| null` | `null` | audio to react to (mic, TTS playback) |
| `getLevel` | `() => number` | — | alternative to `stream`: polled every frame, return 0–1 |
| `colors` | `Partial<Record<AssistantState, string>>` | — | override any state's hex colour |
| `label` | `string \| null` | `"Assistant <state>"` | `null` hides it from assistive tech |

Without any audio, `speaking` uses a built-in voice pattern so it still moves. Default colours are exported as `ASSISTANT_COLORS`.

#### VoiceOrb

A glowing gradient ring (WebGL) whose outline breathes and wobbles with audio — the microphone, a TTS stream, or any level you supply.

```tsx
const mic = useMicrophone();
<VoiceOrb stream={mic.stream} />
<VoiceOrb getLevel={() => level} sensitivity={1.4} />
```

| Prop | Type | Default | |
|---|---|---|---|
| `size` | `number` | `420` | |
| `stream` | `MediaStream \| null` | `null` | audio to react to |
| `getLevel` | `() => number` | — | alternative to `stream`, 0–1 |
| `sensitivity` | `number` | `1` | how strongly it reacts |
| `label` | `string \| null` | `'Voice activity'` | |

Requires WebGL.

### Chat

#### StatusOrb

Small dot-sphere indicators for what an agent is doing. Fifteen variants; change `variant` in place as the status changes.

`base` · `working` · `working · gyro` · `reasoning` · `reasoning · twins` · `searching` · `searching · lighthouse` · `background` · `background · spiral` · `retrying` · `retrying · surge` · `compacting` · `compacting · squeeze` · `compacting · fuse` · `waiting`

```tsx
<StatusOrb variant="reasoning" size={24} />
```

| Prop | Type | Default | |
|---|---|---|---|
| `variant` | `StatusVariant` | `'base'` | one of the 15 above (`STATUS_VARIANTS` lists them) |
| `size` | `number` | `72` | |
| `color` | `string` | `'#ffffff'` | dot colour, any CSS colour |
| `paused` | `boolean` | `false` | freeze on the current frame |
| `label` | `string \| null` | the variant name | |

All StatusOrbs on a page share one animation loop, and orbs scrolled out of view are skipped.

#### TokenOrb

A tiny inline orb for chat replies. Every streamed chunk lights a few dots and adds energy, so its motion follows the **real** streaming speed — bursty streams look bursty, slow ones calm. It shimmers while waiting for the first token and settles green when done.

```tsx
<TokenOrb tokens={tokenCount} done={!streaming} size={20} />

// or push per chunk instead of counting:
const orb = useRef<TokenOrbRef>(null);
<TokenOrb ref={orb} done={!streaming} />
orb.current?.push(chunk.tokens);
```

| Prop | Type | Default | |
|---|---|---|---|
| `tokens` | `number` | — | running total; each increase pulses the orb |
| `done` | `boolean` | `false` | reply finished; settles and turns `doneColor` |
| `size` | `number` | `22` | |
| `color` | `string` | `'#d4d4dc'` | |
| `doneColor` | `string` | `'#34d399'` | |
| `label` | `string \| null` | "Reply streaming" / "Reply complete" | |

Ref: `push(count?: number)`.

#### ToolOrb

One coloured satellite per tool call around a dot-sphere core. Running tools orbit on their own tilted paths; a finished tool spirals in and docks with a flash in its colour; a failed one turns red and drifts away. Optional labelled chips underneath list each tool (and give screen readers the list).

```tsx
<ToolOrb
  tools={[
    { id: 'search', label: 'web_search', status: 'running' },
    { id: 'files', label: 'read_file', status: 'done' },
  ]}
/>
```

| Prop | Type | Default | |
|---|---|---|---|
| `tools` | `ToolCall[]` | required | `{ id, label?, status: 'running' \| 'done' \| 'error', color? }` |
| `size` | `number` | `200` | |
| `showLabels` | `boolean` | `true` | chips under the orb |

Colours come from `TOOL_COLORS` in order of first appearance unless a tool sets `color`.

#### AskOrb

The whole flow in one component: a prompt bar with a flowing gradient border → the bar folds into a sphere and flies up → a dot orb steps through **Thinking → Searching → Analyzing → Composing** → turns green → stretches into an answer card with a "New question" button.

```tsx
<AskOrb
  style={{ height: '100vh' }}
  onAsk={async (question, report, signal) => {
    report('searching');
    const docs = await search(question, { signal });
    report('analyzing');
    report('composing');
    return await answer(docs); // string or any React content
  }}
/>
```

| Prop | Type | Default | |
|---|---|---|---|
| `onAsk` | `AskHandler` | demo sequence | `(question, report, signal) => Promise<ReactNode>` |
| `placeholder` | `string` | `'Ask anything...'` | |
| `minStageMs` | `number` | `1100` | minimum time each stage stays on screen |
| `answerLabel` | `string` | `'Answer'` | small caps label above the answer |

- `report(stage)` accepts `'thinking' | 'searching' | 'analyzing' | 'composing'`.
- If `onAsk` throws, the orb shows "Failed" and an error card with the message.
- `signal` aborts when the component unmounts.
- Give AskOrb a height (its own `style`, or a sized parent).

#### MascotOrb

A glossy bubble character with glowing eyes: staggered blinks (left eye leads), a glance toward the pointer, and a springy jelly bounce when pressed.

```tsx
const mascot = useRef<MascotOrbRef>(null);
<MascotOrb ref={mascot} size={240} color="#5f9ae6" />
mascot.current?.bounce(); // e.g. when a reply arrives
```

| Prop | Type | Default | |
|---|---|---|---|
| `size` | `number` | `240` | the bubble fills ~70%; the rest is glow room |
| `color` | `string` | `'#5f9ae6'` | body tint (hex) |
| `blinking` | `boolean` | `true` | random blinks |
| `bouncy` | `boolean` | `true` | jelly bounce on press |
| `label` | `string \| null` | `'Orb mascot'` | |

Ref: `blink()`, `bounce(strength?: number)`.

#### GazeOrb

A white ball whose eyes live on its surface and turn toward the pointer in 3D — sliding out to the rim and foreshortening when the pointer is far away — with occasional blinks.

```tsx
const orb = useRef<GazeOrbRef>(null);
<GazeOrb ref={orb} size={220} />
orb.current?.blink();
```

| Prop | Type | Default | |
|---|---|---|---|
| `size` | `number` | `240` | |
| `ballColor` | `string` | `'#f2f2f2'` | |
| `eyeColor` | `string` | `'#0e0e0e'` | |
| `outlineColor` | `string` | `'rgba(0, 0, 0, 0.35)'` | `'transparent'` to hide |
| `blinking` | `boolean` | `true` | |
| `label` | `string \| null` | `'Orb watching the pointer'` | |

Ref: `blink()`. It follows the pointer anywhere on the page (touch included) and recentres when the pointer leaves the window.

### Search

#### SearchOrb

For AI search. Radar pings pulse out while searching and each new source curves in from the edge into orbit; ranking pulls the best sources closer; synthesis absorbs them into the core, best first.

| Phase | Colour | What it does |
|---|---|---|
| `idle` | grey | resting |
| `searching` | violet | radar pings; new sources fly in |
| `ranking` | violet | a highlight steps between sources; higher `score` orbits closer |
| `synthesizing` | light violet | sources absorbed one at a time, best first, each with a flash |
| `done` | green | core settles; anything left is pulled in |
| `empty` | grey | one wide sweep, then dims |

```tsx
<SearchOrb
  phase="searching"
  sources={[{ id: '1', domain: 'arxiv.org', score: 0.9 }]} // append as results arrive
/>
```

| Prop | Type | Default | |
|---|---|---|---|
| `phase` | `SearchPhase` | required | |
| `sources` | `SearchSource[]` | `[]` | `{ id, domain?, icon?, score? }` |
| `size` | `number` | `260` | |
| `showCaption` | `boolean` | `true` | "Searching · 7 sources", "Done · 10 sources", "No results" |

Sources are drawn as their `icon` (when given and loaded), else a letter badge from `domain`, else a glowing dot. Setting `sources` to `[]` resets instantly for a fresh search.

### Files & reasoning

#### IngestOrb

For uploads. A file card made of dots sits beside a teal sphere; as `progress` rises, dots peel off the card top-first and arc into the sphere. `reading` sweeps a scan band, `done` turns green, `error` turns the leftover card red and shakes it.

```tsx
<IngestOrb name="report.pdf" progress={0.42} status="uploading" />
```

| Prop | Type | Default | |
|---|---|---|---|
| `name` | `string` | `'file'` | picks the card type and badge (`report.pdf` → PDF) |
| `kind` | `IngestKind` | from `name` | `file · pdf · doc · sheet · image · video · audio · code` |
| `progress` | `number` | required | 0–1 |
| `status` | `IngestStatus` | `'uploading'` | `uploading · reading · done · error` |
| `width` / `height` | `number` | `360` / `220` | |
| `showCaption` | `boolean` | `true` | "Uploading report.pdf · 42%" |

The canvas is a `progressbar` (0–100) for assistive tech. `kindFromName(name)` is exported if you need the detection elsewhere.

#### ReasoningOrb

For deep reasoning. Each step grows a node out from the centre, linked to the previous step and to its nearest earlier thought, building a slowly turning constellation. A pulse runs along the newest link, the active step glows, and an outer arc shows how much of the thinking budget is used (red above 85%). Turns green when finished.

```tsx
<ReasoningOrb
  steps={[{ id: '1', label: 'Reading the question' }, { id: '2', label: 'Comparing fuel costs' }]}
  thinking
  budget={0.4}
/>
```

| Prop | Type | Default | |
|---|---|---|---|
| `steps` | `ReasoningStep[]` | required | `{ id, label? }`; append as the model reasons |
| `thinking` | `boolean` | `true` | `false` → green "Reasoned in N steps" |
| `budget` | `number` | — | 0–1 share used; omit to hide the arc |
| `size` | `number` | `280` | |
| `showCaption` | `boolean` | `true` | "Step 5 · Comparing fuel costs · 39% of budget" |

Passing a different list of steps (not an extension of the current one) starts a new constellation.

#### VisionOrb

For image understanding. The picture is seen through a turning dot sphere — each dot takes the colour of the image behind it. `scanning` sweeps a scan line that reveals the colours; `done` keeps full colour and pulses labelled focus points (e.g. detected objects).

```tsx
<VisionOrb
  src={URL.createObjectURL(file)}
  status="done"
  focus={[{ x: 0.66, y: 0.38, label: 'sun' }]}
/>
```

| Prop | Type | Default | |
|---|---|---|---|
| `src` | `string \| null` | `null` | image URL (see note) |
| `status` | `VisionStatus` | `'loading'` | `loading · scanning · done · error` |
| `focus` | `VisionFocus[]` | `[]` | `{ x, y, label? }` in 0–1 image coordinates |
| `size` | `number` | `300` | |
| `showCaption` | `boolean` | `true` | "Looking at the image…", "Found 3 things" |

The orb reads the image's pixels, so `src` must be `blob:`, `data:`, same-origin, or served with CORS headers. A cross-origin image without CORS doesn't break anything — the sphere just stays grey.

#### ReelOrb

For video understanding. Thumbnail frames orbit a core on a tilted film-strip ring. The strip turns so the frame being analysed comes to the front, where it glows and beams into the core; watched frames keep a tint.

```tsx
const frames = await captureFrames(videoFile, 12);
<ReelOrb frames={frames} progress={0.4} status="analyzing" />
```

| Prop | Type | Default | |
|---|---|---|---|
| `frames` | `string[]` | `[]` | thumbnail URLs, one per frame |
| `count` | `number` | `12` | frame count when you don't have thumbnails |
| `progress` | `number` | `0` | 0–1 through the video |
| `status` | `ReelStatus` | `'loading'` | `loading · analyzing · done · error` |
| `width` / `height` | `number` | `420` / `260` | |
| `showCaption` | `boolean` | `true` | "Watching frame 6 of 12" |

The canvas is a `progressbar` (0–100). Without thumbnails, frames show as numbered placeholders.

---

## Helpers

### `useMicrophone()`

```tsx
const mic = useMicrophone();
// mic.stream     MediaStream | null — pass to AssistantOrb / VoiceOrb
// mic.recording  boolean
// mic.pending    boolean — waiting for the permission prompt
// mic.error      string | null — "Microphone permission was denied." etc.
// mic.start() / mic.stop() / mic.toggle()
```

Stops the microphone tracks when the component unmounts. Needs `https://` or `localhost`.

### `captureFrames(src, count = 12, width = 192)`

Grabs evenly spaced thumbnails from a video in the browser and resolves with JPEG data URLs, ready for `<ReelOrb frames={…} />`.

```ts
const frames = await captureFrames(file, 12); // File, Blob, or a same-origin / CORS URL
```

Handles browser-recorded WebM files that report an `Infinity` duration.

### `kindFromName(name)`

Maps a file name's extension to an `IngestKind` (`'report.pdf'` → `'pdf'`, `'clip.mov'` → `'video'`).

### Constants

`STATUS_VARIANTS`, `ASSISTANT_COLORS`, `TOOL_COLORS`, `SEARCH_COLORS`, `KIND_COLORS`, `REASONING_COLORS`, `REEL_COLORS`.

---

## Shared conventions

**Colour means the same thing everywhere.** Grey is idle, blue is listening, orange is thinking/reasoning, violet is searching, teal is reading files, green is speaking or done, red is an error.

**Real inputs, not loops.** Audio (`stream` / `getLevel`), `tokens`, `tools`, `sources`, `progress`, `steps`, image pixels and video frames drive the motion directly. Update the props as your data changes; the orbs animate between states on their own.

**`getLevel` doesn't re-render.** It is polled every animation frame, so you can feed a fast-changing audio level without React updates.

**Accessibility.**
- Every orb has a text equivalent: an `aria-label` that follows its state, an `aria-live` caption, or `progressbar` semantics (IngestOrb, ReelOrb).
- Purely decorative orbs accept `label={null}` to be hidden from assistive tech.
- With `prefers-reduced-motion`, StatusOrb shows a single still frame and the other ambient orbs slow their motion down. GazeOrb and MascotOrb are the exception: they only move in response to the pointer, clicks and blinks, and behave the same either way.

**Performance.**
- Each orb draws on one canvas, sized for the screen's pixel density.
- StatusOrbs share one animation loop and skip orbs that are scrolled out of view. The other orbs run their own loop while mounted, so unmount orbs you aren't showing.
- In background tabs browsers pause animations. AskOrb's flow keeps advancing anyway; it just skips the visuals.

---

## Using an orb without React

Every component is a thin wrapper around a framework-free engine that draws on a canvas you give it:

```ts
import { createSearchOrb } from './orbs';

const orb = createSearchOrb(canvasElement, { size: 260, phase: 'searching', sources: [] });
orb.update({ sources: [{ id: '1', domain: 'arxiv.org' }] });
orb.destroy();
```

Engines: `createStatusOrb`, `createGazeOrb`, `createMascotOrb`, `createVoiceOrb`, `createAssistantOrb`, `createTokenOrb`, `createToolOrb`, `createSearchOrb`, `createIngestOrb`, `createReasoningOrb`, `createVisionOrb`, `createReelOrb`, and `createStageOrb` (AskOrb's dot orb). Each returns `update(options)` and `destroy()`; some add methods such as `push()`, `blink()` or `bounce()`.

---

## Demo & development

The demo is a small site with three sections:

| Page | URL | |
|---|---|---|
| Components | `/` (the first orb), `/components/<name>` | one page per orb: a demo with every state, usage, a states table, props, ref methods and notes |
| Examples | `/examples` | all four examples on one page (the chat app, the voice assistant, an agent run and an ask-and-answer flow), each starting when you scroll to it; `/examples#agent-run` links straight to one |
| Playground | `/playground?orb=<name>` | every option of every orb; the URL keeps the setup, so it can be shared |

The demos also let you try your own image, video or file; those stay in the browser and are never uploaded.

Three parts of the demo are useful on their own:

- **Playground** (`demo/playground/`) — pick any orb, change every option with live controls, and copy the generated JSX (including sample data) straight into your app.
- **Voice assistant sample** (`demo/voice-assistant/`) — a working voice assistant on AssistantOrb and the browser's speech recognition and speech synthesis, with no backend: listen → think → speak, interrupt (tap the orb or press Space), mute, captions with word-by-word highlighting, and typed input as a fallback. Copy the folder and plug in your model:

  ```tsx
  <VoiceAssistant respond={(text, signal) => callYourModel(text, { signal })} />
  ```

  Speech recognition works in Chrome, Edge and Safari; in other browsers the sample still answers typed messages aloud.

- **Chat app sample** (`demo/chat-app/`) — a chat where each orb has one job and appears only while it's doing it.

  - **Live activity row.** A single orb slot cross-fades between whichever orb matches the current work — ReasoningOrb, SearchOrb, ToolOrb, IngestOrb, VisionOrb or ReelOrb — next to a status line ("Ranking sources", "8 sources found · 4s"), tinted in that activity's colour.
  - **Summary.** When the answer starts, the row folds into one sentence ("Searched 8 sources", "Looked at sunset.png and thought for 4s") that expands into a timeline: reasoning steps, sources, tools with durations, frames.
  - **Results as real content.** The actual image with its scan and pinned points, the video's frames with the one being watched highlighted, a file card.
  - **Answer.** Streamed text with a TokenOrb riding at the end like a caret.
  - **Around it.** A MascotOrb avatar and a StatusOrb for the current activity in the header, a VoiceOrb in the composer while dictating, and suggestions under the message box (the file, image and video ones use built-in samples).

  The demo agent does real maths, budgets, file statistics and image/video colour analysis; its web search results are labelled as demo data. Connect your model by emitting events:

  ```tsx
  <ChatApp
    agent={async ({ text, attachments }, emit, signal) => {
      emit({ type: 'thinking', label: 'Planning', budget: 0.2 });                   // ReasoningOrb
      emit({ type: 'search', phase: 'searching', sources: [] });                     // SearchOrb
      emit({ type: 'tool', id: 'calc', label: 'calculator', status: 'running' });   // ToolOrb
      emit({ type: 'ingest', name: 'report.pdf', progress: 1, status: 'reading' }); // IngestOrb
      emit({ type: 'vision', name: 'photo.png', status: 'scanning', src: url });    // VisionOrb
      emit({ type: 'reel', name: 'clip.mp4', frames, progress: 0.5, status: 'analyzing' }); // ReelOrb
      emit({ type: 'text', delta: 'Here is what I found…' });                       // TokenOrb
    }}
  />
  ```

  How it's built:

  | File | Job |
  |---|---|
  | `agent.ts` | the event protocol and the demo agent |
  | `activity.ts` | a pure reducer: events → an ordered activity timeline, plus the live labels and summary sentence (unit-tested in `activity.test.ts`) |
  | `useChat.ts` | messages, uploads, send and stop |
  | `ActivityRow.tsx`, `ActivitySummary.tsx`, `Results.tsx`, `Answer.tsx`, `Composer.tsx` | one piece of the reply or the composer each |
  | `motion.tsx` | `Collapse` (height-animated, unmounts when closed) and `Swap` (cross-fade that keeps the outgoing orb alive) |

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5318.

| Script | |
|---|---|
| `npm run dev` | the site with hot reload |
| `npm run build` | strict type-check, then a production build of the site into `dist/` |
| `npm run preview` | serve the production build |
| `npm run typecheck` | type-check only |
| `npm test` | unit tests: routes, docs, the playground's URL state, the code highlighter, the agent run script and the chat sample's activity reducer |
| `npm run test:e2e` | browser tests against the production build (Playwright, desktop and phone sizes) |
| `npm run test:all` | all of the above |

The browser tests open every page and check that it renders without errors, has no sideways scrolling and no serious accessibility violations (axe). They then drive every orb through its states and transitions and check from real screenshots that it draws, moves and uses the right colours. They also exercise every playground control, all four examples, navigation, scroll restoration, reduced motion, and that animation loops stop when orbs leave the page. The first run needs a browser: `npx playwright install chromium`.

The demo's sample images and video frames are drawn in code (`demo/samples.ts`), so it works offline.

### Deploying the site

`npm run build` writes a static site to `dist/`, with one HTML file per page (each with its own title and description) and a `404.html`, so every URL works on any static host without rewrite rules. To serve it from a sub-path, such as GitHub Pages at `/ThinkingOrbs/`, set the base path when building:

```bash
BASE_PATH=/ThinkingOrbs/ npm run build
```

## AI-native sites

**Hermes** (`demo/hermes/`) is a demo of a site that is an assistant first and pages second. It is the internal portal of a made-up company, Brightline Labs, whose AI assistant, Hermes, is connected to the company's systems: AWS, Jira, Teams, Clockify and GitHub. The assistant is docked on every page, keeps the conversation as you move around, knows which page you are on, and answers in the form that fits the question: text, a table, a chart, a status card, or a drafted Teams message or email. Typing, dictation and a hands-free voice mode are all supported, and the orbs show what it is doing.

```bash
npm run dev
```

Then open http://localhost:5318/hermes/. You are asked to sign in as one of three demo users, and the role decides what Hermes will show:

| User | Role | Sees |
|---|---|---|
| Maya Chen, CTO | Leadership | everything: all projects, every person's hours, AWS costs |
| Daniel Okafor, Engineering Manager | Manager | all projects, individual hours for his own team (Platform) and team totals for the others; no AWS costs |
| Sara Lindqvist, Developer | Developer | her team's projects, her own hours and her team's total; no one else's hours, no AWS costs |

When a question reaches something a role may not see, Hermes says what is held back and offers what it can show instead. Try "How many hours did developers work this week?" as each user.

The site is built in three layers, each knowing nothing about the one above it:

| Layer | Folder | Holds |
|---|---|---|
| Site and agent | `demo/hermes/` | the pages, the generated company data, the tools, the role policy and the brain |
| Shared assistant shell | `demo/assistant/` | dock, panel, composer, voice mode, answer blocks, conversation state, tool runner and the event protocol; no data and no domain knowledge |
| ThinkingOrbs | `src/orbs/` | the orbs |

The shell never imports from `demo/hermes/`, so it is site-agnostic: a second agent with its own tools and scope, such as a fleet-management assistant, can reuse it by supplying another `AgentDefinition`.

**Plugging in real systems.** The brain, tools, policy and sign-in sit behind interfaces in `demo/assistant/protocol.ts`, so replacing them does not change the UI:

- **Model.** Replace the `brain` (the `Brain` type) with one that calls your server, which calls a real model with the agent's tools as tool definitions and streams `AssistantEvent`s back.
- **Connectors.** Implement `Tool.run` on a server for AWS, Jira, Microsoft Graph (Teams), Clockify and GitHub, keeping the same tool ids and output shapes.
- **Policy.** Enforce the role rules (`Policy.before` and `Policy.after`) on the server, on the same tool calls. The list of tools given to an agent is its permission boundary.
- **Identity.** Put a real identity provider behind `demo/hermes/auth.ts`, and take each user's role from your directory.

The design is in `docs/superpowers/specs/2026-10-03-ai-native-sites-design.md` (section 9 covers this).

**What this demo is not.** Every number, person, ticket and message is generated in the browser from a fixed seed, so nothing leaves it and it works offline with no API key. The brain matches questions to a fixed set of intents rather than calling a model. Hermes is read-only: it never writes to any system, and its drafts are labelled "Demo — not sent". Sign-in is a picker for the three demo users, not real authentication.

---

---

## Project structure

```
src/orbs/
  index.ts          ← one entry point for everything
  shared/           ← dot-sphere drawing, animation loop, audio analysis
  status/           StatusOrb
  gaze/             GazeOrb
  mascot/           MascotOrb
  voice/            VoiceOrb, useMicrophone
  assistant/        AssistantOrb
  token/            TokenOrb
  tool/             ToolOrb
  search/           SearchOrb
  ingest/           IngestOrb
  reasoning/        ReasoningOrb
  vision/           VisionOrb
  reel/             ReelOrb, captureFrames
  ask/              AskOrb
demo/               the demo site (main.tsx, samples.ts)
  site/             routes, router, pages, component docs, styles
  playground/       the Playground (controls, code generation, URL state)
  examples/         the agent run and ask-and-answer examples
  voice-assistant/  the voice assistant sample (useVoiceAssistant, brain, UI)
  chat-app/         the chat app sample (agent protocol + demo agent, UI)
e2e/                browser tests (Playwright)
```

Each component folder holds `engine.ts` (the canvas renderer), the React component, and an `index.ts`.
