# Hermes AI-first Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Hermes site so that:
- the conversation is the whole site;
- an animated bot character (`BotOrb`) is always on screen, reacting to what Hermes is doing;
- dashboards open in a canvas beside the conversation.

The look is dark, deep indigo and neon, as in the user's reference image.

**Architecture:**
- `src/orbs/bot/` gains a new library component, `BotOrb`: an SVG robot with states.
- The shell (`demo/assistant/`) gains small, site-agnostic pieces:
  - an `open` event so an agent can open a view;
  - an optional per-agent `brief` brain;
  - voice and dictation state reported to the provider;
  - pure helpers mapping assistant state to bot state, and tool calls to systems.
- Hermes (`demo/hermes/`) replaces its header, pages, dock and panel with a three-part workspace:
  - a rail;
  - the conversation, with a hero first screen and a docked bot;
  - a canvas for Team, Projects, a project, and Connections.
- The canvas is driven by the existing URLs.
- The agent gains `open-dashboard` and a morning brief.
- Data, roles, policy, existing intents, answer blocks, voice and attachments are unchanged.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Vitest 2 (node environment), Playwright 1.63 with `@axe-core/playwright`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-ai-native-sites-design.md`. §10 is the authority for this round; §4.2, §4.6, §5 and §9 still apply.

## Global Constraints

- **Dependencies:** none new. `BotOrb` is SVG plus CSS. It may use `src/orbs/shared/audio.ts` (`StreamAnalyser`) and `src/orbs/shared/dots.ts` (`reducedMotion`, `loop`). Fonts are Bricolage (already shipped), the system sans stack, and the system serif stack (`ui-serif, Georgia, serif`).
- **Determinism and policy:** carried over unchanged from round 1. Generators use `seeded()` only. Every page or canvas read of role-sensitive data goes through `queryTool(hermesAgent, …)`. Every brain read goes through `ctx.call`.
- **Exact copy, carried over:**
  - Developer: `Individual hours for other people are visible to managers. Here's your team's total instead.`
  - Manager: `Individual hours outside your team are visible to leadership. Other teams are shown as totals.`
  - AWS: `AWS costs are visible to leadership.` / `I can show AWS service health instead.`
  - Draft label: `Demo — not sent`
  - Hidden project: `<Name> isn't one of the projects you can see. Your projects: <list>.`
- **Theme:** Hermes is dark-only, with `color-scheme: dark` and tokens on `:root` in `demo/hermes/hermes.css`. Palette:
  - background `#070a1f` with a radial indigo glow behind the bot;
  - surfaces as translucent glass (`rgba(255,255,255,0.04–0.08)` with a hairline `rgba(255,255,255,0.10)` border);
  - accents: violet `#8b7cff` and cyan `#3fd8ff`;
  - text `#eef0ff` / secondary `#a9aed6`.
  
  All text meets WCAG AA (4.5:1, or 3:1 for large text). Glow (`box-shadow` or `filter: drop-shadow`) is used only on the bot, the pedestal, active system nodes, the send button and focus rings. The docs site is unaffected.
- **The bot is always visible.** On every signed-in Hermes route, at widths 1280, 900 and 375, at least one `BotOrb` (`[data-bot]`) is visible in the viewport. This holds with the canvas open, the canvas sheet open, and the rail drawer open.
- **Headings:** one `<h1>` per screen.
  - On the empty first screen it is the greeting (`Good morning/afternoon/evening, <first name>`).
  - Once a conversation exists it is a visually hidden `Hermes`.
  - Canvas views use `<h2>` for their title, so no view renders an `h1`.
- **Routes:** unchanged. `HERMES_PATHS`, `hermesPageMeta` and the `document.title` per route stay. The conversation is always mounted for signed-in users, and the URL selects the canvas view.
- **Breakpoints:**
  - ≥1024px: the canvas sits beside the conversation (about 45% width, at least 420px), and the rail shows (240px, collapsible to 64px).
  - <1024px: the canvas is a full-screen sheet with `role="dialog" aria-modal="true"`, and the rail is a drawer opened by a `Menu` button.
  - No horizontal scroll at 375px.
- **Reduced motion:** no float, pulse, orbit or slide animations. State changes become opacity fades.
- **Design quality:** Tasks 1, 4, 5 and 6 invoke the `frontend-design` skill before writing UI. Each finishes by screenshotting the result in the browser (Playwright `page.screenshot` into `test-results/`, which is not committed) at 1280 and 375. Review those screenshots before reporting.
- **Code style:**
  - every file opens with a one-to-three-line purpose comment;
  - two-space indent, single quotes, about 140 columns;
  - no default exports.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Where to work:** in the worktree `/Users/yigitali/Documents/IncTec/ThinkingOrbs/.worktrees/ai-sites` (branch `ai-sites`). Never switch the main checkout's branch.

## Review Focus

1. **The bot is hidden behind overlays.** On a phone, with the canvas sheet or the rail drawer open, the bot must still be visible: it sits on top, docked in the sheet header area. A reasonable person expects the character to never disappear. → Tasks 5 and 6.
2. **The brief races the user.** The user may send a question while the morning brief is still streaming, switch user mid-brief, start a new conversation, or restore an old one. The brief must stop, must never be archived as a conversation of its own, must never re-run on restore, and must never show the previous user's brief. → Tasks 2 and 5.
3. **Hidden or stale canvas.** Sara opening `/hermes/projects/beacon` gets a "No page at …" canvas while the conversation stays intact. Switching from Maya to Sara while Atlas, with its budget, is in the canvas must re-filter or hide that view immediately. → Task 4.
4. **Navigation during streaming.** Opening or closing the canvas, using back and forward, or Hermes's own `open` action while an answer streams must not stop the answer or lose turns. → Tasks 4 and 5.
5. **Neon theme contrast.** Glow and glass on dark must not push text or badges below AA. The "At risk"/"Off track" badges, muted text and chips are checked by axe on every route. → Task 6.

---

### Task 1: `BotOrb`, the always-visible bot character

**Files:**
- Create: `src/orbs/bot/BotOrb.tsx`
- Create: `src/orbs/bot/bot-orb.css`
- Create: `src/orbs/bot/state.ts`
- Create: `src/orbs/bot/index.ts`
- Modify: `src/orbs/index.ts` (add `export * from './bot';`)
- Test: `src/orbs/bot/bot.test.ts`

**Interfaces:**
- Consumes: `StreamAnalyser` (`src/orbs/shared/audio.ts`); `reducedMotion` and `loop` (`src/orbs/shared/dots.ts`).
- Produces (`state.ts`, pure):
  - `type BotState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'error'`
  - `BOT_STATES: BotState[]`
  - `botCaption(state: BotState): string`, returning `Ready`, `Listening`, `Thinking`, `Speaking`, `Done` or `Something went wrong`
  - `visorFor(state: BotState): 'eyes' | 'arc' | 'wave' | 'alert'`: idle, listening and happy → `eyes`; thinking → `arc`; speaking → `wave`; error → `alert`
- Produces (`BotOrb.tsx`):
  - `interface BotOrbProps { state?: BotState; size?: number /* 160 */; level?: number; stream?: MediaStream | null; getLevel?: () => number; pedestal?: boolean /* true */; label?: string | null /* 'Hermes' */; className?: string; style?: CSSProperties }`
  - `interface BotOrbRef { bounce(): void; blink(): void }`
  - `BotOrb = forwardRef<BotOrbRef, BotOrbProps>(…)`, marked `'use client'`.
  - The root is `<div data-bot data-state={state} role="img" aria-label={label}>` with an `aria-live="polite"` visually hidden caption `botCaption(state)`. When `label === null` it is `aria-hidden`.
- **Look:**
  - a rounded robot head with a dark visor showing two glowing cyan eyes;
  - small antenna lights on each side of the head;
  - a rounded body in violet/indigo with the Hermes mark;
  - floating above a glowing elliptical ring pedestal (omitted when `pedestal={false}`).
  
  Built with SVG gradients. Glow uses an SVG `feGaussianBlur` filter, which is allowed on the bot only.
- **Motion per state (CSS keyframes keyed on `data-state`):**

  | State | Motion |
  |---|---|
  | idle | gentle float; a random blink every 3–6 s via JS timer, deterministic per mount using a counter, not `Math.random` |
  | listening | antenna lights scale with `level` (from `stream` via `StreamAnalyser`, or `getLevel`, or the `level` prop), plus expanding sound rings |
  | thinking | the visor shows a rotating arc, and 3 particles orbit the head |
  | speaking | the visor shows a 5-bar waveform driven by the level, or a gentle default oscillation when there is no level |
  | happy | one bounce (also callable through `ref.bounce()`), then back to idle |
  | error | a 400 ms shake with amber eyes |

  Eyes glance toward the pointer, with movement limited to ±3px. Under reduced motion: no float, orbit, wave animation or glance; states switch with a 150 ms opacity fade.
- **Sizing:** everything scales from `size`. At 56px it still reads as a robot face: the pedestal is hidden below 72px, and the antenna stays.

- [ ] **Step 1: Write the failing tests** in `src/orbs/bot/bot.test.ts`:
  - `BOT_STATES` has 6 entries;
  - `visorFor` maps exactly as above;
  - `botCaption('thinking') === 'Thinking'`;
  - `import * as orbs from '../index'` exposes `BotOrb`.
- [ ] **Step 2: Run** `npx vitest run src/orbs/bot`. Expected: FAIL.
- [ ] **Step 3: Invoke the `frontend-design` skill**, then implement `state.ts`, `BotOrb.tsx`, `bot-orb.css` and `index.ts`, and add the export.
- [ ] **Step 4: Run** `npx vitest run src/orbs/bot && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Visual check.** Write a throwaway Playwright script, not committed, that renders the six states at 220px and 56px on a `#070a1f` background through a temporary route or `page.setContent` with the built module. Screenshot the result and review it: it must clearly read as a friendly robot that matches the reference style. Iterate until it does. Delete the throwaway file.
- [ ] **Step 6: Commit** `git add src/orbs && git commit -m "Add BotOrb: an animated robot character that shows what an assistant is doing"`

---

### Task 2: Shell support for the bot, open actions and the brief

**Files:**
- Modify: `demo/assistant/protocol.ts`
- Modify: `demo/assistant/reply.ts`
- Modify: `demo/assistant/conversation.ts`
- Modify: `demo/assistant/AssistantProvider.tsx`
- Modify: `demo/assistant/VoiceMode.tsx`
- Modify: `demo/assistant/Composer.tsx`
- Modify: `demo/assistant/Thread.tsx`
- Create: `demo/assistant/presence.ts`
- Test: `demo/assistant/conversation.test.ts`, `demo/assistant/presence.test.ts`

**Interfaces:**
- Consumes: `BotState` (Task 1); `dockState` (`shortcuts.ts`); `AssistantState` (`src/orbs`).
- Produces (`protocol.ts`):
  - `AssistantEvent` gains the variant `{ type: 'open'; href: string }`.
  - `AgentDefinition` gains the optional `brief?: Brain`. It is run with an empty input, `{ text: '', attachments: [] }`.
- Produces (`reply.ts`): `applyAssistantEvent` ignores `open` and returns the reply unchanged.
- Produces (`conversation.ts`):
  - `Turn` gains `brief?: boolean`.
  - `createConversation` options gain `onOpen?: (href: string) => void`. It is called for every `open` event of the live run, and never after that run is stopped or disposed.
  - `Conversation` gains `startBrief(): Promise<AssistantReply | null>`:
    - It returns `null` without doing anything when `def.brief` is missing, when there are already any turns, or when a brief already ran for this conversation since its last `clear()`.
    - Otherwise it runs `def.brief` as a turn with `question: ''`, `brief: true`, using the same caller, policy and abort semantics as `send`.
  - `send` while a brief is running stops the brief first, exactly like any running reply.
  - `clear()` and `archive` ignore conversations whose only turns are brief turns: they are not archived. An archived conversation's `title` is its first non-brief question.
  - `restore(id)` never re-runs a brief.
- Produces (`presence.ts`, pure):
  - `botStateFor(s: ConversationSnapshot, voice: { active: boolean; state?: AssistantState }, dictating: boolean): BotState`. The checks are applied in this order:
    1. voice active → map the voice state (`listening` → `listening`, `thinking` → `thinking`, `speaking` → `speaking`, `error` → `error`, otherwise `idle`);
    2. `dictating` → `listening`;
    3. `dockState(s)`: `thinking` → `thinking`, `speaking` → `speaking`, `error` → `error`, otherwise `idle`.
  - `activeSystems(tools: AgentDefinition['tools'], reply?: AssistantReply): Set<string>`. It returns the `system` of each tool call whose status is `running` in the reply's `tools` activity. The tool id is the call id before `#`, looked up in `tools`.
  - `finishedHappily(prev: ConversationSnapshot, next: ConversationSnapshot): boolean`. It is true when the last reply moved from not-done to `done`. The UI uses it to call `bounce()`.
- Produces (`AssistantProvider.tsx`):
  - `AssistantProvider` accepts the optional `onOpen?: (href: string) => void` and passes it to `createConversation` through a ref, so it isn't recreated.
  - `useAssistant()` gains:
    - `voice: { active: boolean; state?: AssistantState; stream?: MediaStream | null }`
    - `setVoice(v): void`
    - `dictating: boolean`
    - `setDictating(on: boolean): void`
  - `VoiceMode` reports its `state` and `stream` through `setVoice` while mounted, and `{ active: false }` on unmount. `Composer` reports the dictation `active` flag through `setDictating`.
- Produces (`Thread.tsx`): a brief turn renders without the user bubble. Everything else is unchanged.

- [ ] **Step 1: Write the failing tests:**
  - **conversation:**
    - `startBrief()` on an empty conversation runs the fake agent's `brief`, producing a turn with `brief: true` and `question: ''`.
    - A second `startBrief()` returns `null`.
    - With turns present it returns `null`.
    - `send('hi')` during a slow brief leaves `[brief: stopped, hi: done]`.
    - `clear()` after only a brief archives nothing.
    - `clear()` after brief plus `hi` archives with title `hi`, and `restore` doesn't run the brief.
    - An `open` event calls `onOpen('/x')` once.
    - An `open` emitted after `stop()` doesn't call it.
    - `dispose()` during a brief aborts it.
  - **presence:** each priority branch of `botStateFor`.
  - **`activeSystems`:** a reply with running `jira.issues#1` and done `clockify.timeEntries#2` gives `{'Jira'}`.
  - **`finishedHappily`:** true only on the transition to `done`.
- [ ] **Step 2: Run** `npx vitest run demo/assistant`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes above.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS, with the existing tests unchanged.
- [ ] **Step 5: Commit** `git commit -m "Let agents open views and brief the user, and report voice and dictation to the assistant"`

---

### Task 3: Hermes agent: `open-dashboard`, the morning brief and canvas-aware suggestions

**Files:**
- Create: `demo/hermes/agent/intents/dashboards.ts`
- Create: `demo/hermes/agent/brief.ts`
- Modify: `demo/hermes/agent/intents/index.ts` (insert `openDashboard` first)
- Modify: `demo/hermes/agent/definition.ts` (`brief`, suggestions)
- Test: `demo/hermes/agent/hermes-agent.test.ts`

**Interfaces:**
- Consumes: `Intent`, `say` (`demo/assistant/brain.ts`); `resolveProjects`, `projectIn` and the answer helpers in `intents/shared.ts`; `team-health` and `project-status` logic in `intents/people.ts` and `projects.ts`; `runBrain` (`demo/assistant/testing.ts`).
- Produces `openDashboard: Intent`:
  - It matches open/show/go to/take me to plus one of these targets:
    - team dashboard / team → `/hermes/team`
    - projects → `/hermes/projects`
    - a named project → `/hermes/projects/<id>`
    - connections / integrations → `/hermes/connections`
  - It does **not** match questions such as "how is the team doing", which keep their current intents.
  - The answer is one short sentence (e.g. `Here's the Team dashboard.`), then `emit({ type: 'open', href })`.
  - A named project the user can't see gets the exact hidden-project refusal and no `open`. The check goes through `resolveProjects`.
- Produces `hermesBrief: Brain` (`brief.ts`), exposed as `hermesAgent.brief`:
  - It streams 2–3 sentences for the signed-in role, using only `ctx.call`. It covers:
    1. this week's hours vs capacity (team scope by role: Leadership both teams, Manager own team, Developer own team total);
    2. PRs merged since Monday;
    3. at-risk or off-track projects among the visible ones, or `All your projects are on track.`
  - It emits no blocks. It ends without a Sources line, because it isn't an answer.
  - When a tool fails, it skips that sentence silently.
- Produces `hermesSuggestions(page, user)`: canvas-aware. Page kinds are `home`, `team`, `projects`, `project` and `connections`.
  - `home` includes `Show me the team dashboard` and, for Leadership, `Why did AWS costs go up?`
  - `project` includes `How is this one doing?`
  - Each kind returns exactly 3.

- [ ] **Step 1: Write the failing tests** with `NOW = new Date('2026-10-07T15:00:00')`, using `def = { ...hermesAgent, tools: hermesTools(() => c), policy: createHermesPolicy(() => c) }`:
  - `Show me the team dashboard` as Maya → the text is `Here's the Team dashboard.` and the reply's events include `open` with `/hermes/team`. Capture open events by wrapping `runBrain`'s emit, or extend `runBrain` to return `opens: string[]`.
  - `Open Atlas` → `/hermes/projects/atlas`.
  - Sara, `Open Beacon` → the exact refusal and no open.
  - `How is the team doing?` still yields the team-health stat block, with no open.
  - Brief as Maya contains `PRs merged` and `Atlas`; as Sara it contains `Platform` and no other person's name with hours.
  - Brief at Monday 00:30 has no `NaN` or `Infinity`.
  - The brief with Jira down still produces text, without the projects sentence.
  - `hermesSuggestions` returns 3 strings for every page kind and role.
- [ ] **Step 2: Run** `npx vitest run demo/hermes`. Expected: FAIL.
- [ ] **Step 3: Implement.** If you extend `runBrain` to return `opens`, update `demo/assistant/testing.ts` as part of this step.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Let Hermes open dashboards and brief each user when a conversation starts"`

---

### Task 4: Dark theme, workspace layout, rail and canvas

**Files:**
- Rewrite: `demo/hermes/App.tsx`
- Create: `demo/hermes/workspace/Workspace.tsx`
- Create: `demo/hermes/workspace/Rail.tsx`
- Create: `demo/hermes/workspace/Canvas.tsx`
- Create: `demo/hermes/workspace/views.tsx` (route → view)
- Move and modify: `demo/hermes/pages/{Team,Projects,Project,Connections,NotFound}.tsx` → `demo/hermes/views/` (h1 → h2; no outer page chrome)
- Delete: `demo/hermes/pages/Home.tsx`
- Modify: `demo/hermes/UserMenu.tsx` (rail placement: opens upward)
- Rewrite: `demo/hermes/hermes.css` (dark-only tokens, workspace layout, glass and canvas styles)
- Modify: `hermes/index.html` (`color-scheme` dark, theme-color `#070a1f`)
- Test: rewrite `e2e/hermes.spec.ts` (layout, routing, roles, smoke)

**Interfaces:**
- Consumes: `AssistantProvider`, `useAssistant` and `usePageContext` (shell); `guard`, `useUser` and `signIn` (auth); `hermesPageMeta` and `hermesProjectId` (routes); `visibleProjectIds` (policy); `navigate` and `useLocation` (router); the existing page data hooks in `pages/shared.tsx`. Move that file to `views/shared.tsx` and update imports.
- Produces:
  - `canvasFor(path: string, user: User): { title: string; view: ReactNode } | null`. `/hermes` → `null`; the four view routes → their view; a hidden or unknown project or path → `{ title: 'Not found', view: <NotFound path={path} /> }`.
  - `<Workspace user>`:
    - It renders `<Rail/>`, `<section className="conversation" aria-label="Conversation">` with a placeholder `<ConversationArea/>` slot (Task 5 fills it; until then it renders the existing `Thread` and `Composer`), and `<Canvas/>` when `canvasFor` is not null.
    - It wraps everything in `<AssistantProvider agent={hermesAgent} user={user} now={hermesNow} onOpen={(href) => navigate(href)}>`.
  - `<Rail>`:
    - brand
    - `New conversation` → `conversation.clear()`, then focus the composer
    - `Conversations` list from `snapshot.archive`, plus the current one as `Current conversation` when it has non-brief turns. Clicking an item → `restore(id)`.
    - `Dashboards` links (`Team`, `Projects`, `Connections`), with `aria-current` on the open one
    - `UserMenu` at the bottom
    - Collapse toggle: `Collapse sidebar` / `Expand sidebar` at ≥1024px. Below 1024 the rail is a drawer, opened by a header `Menu` button and closed by Esc or a backdrop click.
  - `<Canvas title view>`:
    - It is an `<aside aria-label={title}>` at ≥1024px, and `role="dialog" aria-modal="true" aria-label={title}` with a focus trap below 1024.
    - Its header has `<h2>`-styled title text (the view provides the h2), plus `Close`, which does `navigate('/hermes')`.
    - Esc closes it in sheet mode.
    - Opening it moves focus to the canvas; closing it returns focus to the element that opened it, or the composer.
    - It slides in over 200 ms.
  - Views register `usePageContext({ page, title, id? })` exactly as the pages did. The conversation area registers `{ page: 'home', title: 'Hermes' }` when no canvas is open.
  - Sign-in page: same content as before, restyled in the new theme, with the bot (`BotOrb`, 160px, idle) above the heading.
- **Routing:**
  - The conversation, the provider and the conversation state never unmount when the canvas route changes.
  - Back and forward toggle the canvas.
  - `document.title` per route stays as it was.
- **Removed:** the top header and nav, the `Dock`, `Panel` and `AskBar` mounts in Hermes, the Home glance, and the separate page layout. `/` and `⌘K` now focus the composer, using `isOpenShortcut` in a Workspace key handler.
- **Theme:** as the Global Constraints specify. Glass panels, hairlines, the serif voice for `.as-answer` prose (overridden in `hermes.css` under `.hermes`), and dark tables and charts. Override the `--as-*` tokens under `.hermes` so the blocks match.

- [ ] **Step 1: Invoke the `frontend-design` skill.**
- [ ] **Step 2: Write the failing e2e tests** in the rewritten `e2e/hermes.spec.ts`, keeping the `signInAs` fixture:
  - the signed-out redirect, sign-in, `safeNext` and sign-out tests are kept;
  - `/hermes` shows the rail and the conversation, and no canvas;
  - `/hermes/team` shows the canvas with an h2 `Team` and the conversation;
  - closing the canvas → `/hermes`;
  - back → `/hermes/team`;
  - with a reply streaming, opening and closing the canvas through the rail keeps the reply streaming until done (Review Focus 4);
  - Sara at `/hermes/projects/beacon` → canvas `Not found` and the conversation intact (Review Focus 3);
  - Maya on `/hermes/projects/atlas` sees `Budget`; switching to Sara through the user menu → the canvas shows `Not found` and no `Budget` (Review Focus 3);
  - the role tests from round 1 (Team rows by role, Manager copy, Developer copy, AWS) run through the canvas views;
  - rail: `New conversation`, restore the past conversation, and the dashboard links set `aria-current`;
  - <1024 (900 and Pixel 7): `Menu` opens the drawer; the canvas is a modal dialog and Esc closes it;
  - smoke over `HERMES_PATHS`: the title, exactly one visible `h1`, no horizontal scroll at the project width and at 375×812, and axe with no serious or critical issues on `body`, excluding `canvas` and `svg`, after `.route`/canvas animation settles.
- [ ] **Step 3: Run** `npx playwright test e2e/hermes.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** Workspace, Rail, Canvas and views, the App rewrite, the theme and `index.html`.
- [ ] **Step 5: Run** `npx playwright test e2e/hermes.spec.ts`, then `npm run test:all`.
  - `e2e/assistant.spec.ts` tests that target the Hermes dock or panel will fail. Delete those tests; Task 6 rewrites the coverage.
  - Keep the tests that don't depend on the dock or panel, adapting their selectors.
  - Expected: PASS.
- [ ] **Step 6: Screenshot** `/hermes` and `/hermes/projects/atlas` at 1280 and 375, and the drawer and sheet open at 375. Review them and iterate on the design until it reads as an AI workspace in the reference style.
- [ ] **Step 7: Commit** `git commit -m "Turn Hermes into an AI workspace: rail, conversation and a canvas for dashboards"`

---

### Task 5: The conversation area: bot hero, systems orbit, brief and docked bot

**Files:**
- Create: `demo/hermes/workspace/ConversationArea.tsx`
- Create: `demo/hermes/workspace/Hero.tsx`
- Create: `demo/hermes/workspace/SystemsOrbit.tsx`
- Create: `demo/hermes/workspace/DockedBot.tsx`
- Create: `demo/hermes/workspace/systems.ts` (system list with icons)
- Modify: `demo/hermes/views/Connections.tsx` (use `systems.ts` instead of its own list)
- Modify: `demo/hermes/workspace/Workspace.tsx` (mount `ConversationArea`)
- Modify: `demo/hermes/hermes.css`
- Test: `e2e/hermes.spec.ts`

**Interfaces:**
- Consumes: `BotOrb` and `BotOrbRef` (Task 1); `botStateFor`, `activeSystems`, `finishedHappily`, `useAssistant().voice` and `dictating` (Task 2); `hermesAgent.brief` and `open` events (Tasks 2 and 3); `Thread`, `Suggestions` and `Composer` (shell).
- Produces (`systems.ts`): `HERMES_SYSTEMS: { name: 'Directory' | 'Clockify' | 'Jira' | 'GitHub' | 'Teams' | 'AWS'; icon: ReactNode; ask: string }[]`. The icons are inline SVG and the `ask` text is a suggested question per system. Connections reuses the names.
- Produces (`ConversationArea.tsx`):
  - **Empty** (no turns, or only the brief turn): `<Hero/>`.
  - **Otherwise:** a visually hidden `<h1>Hermes</h1>`, the thread (max-width 760px), and the composer pinned to the bottom with `<DockedBot/>` beside it.
  - On mount and after `clear()`/user switch it calls `conversation.startBrief()` once per conversation instance.
- Produces (`Hero.tsx`):
  - `<BotOrb size={220} state={botStateFor(...)}>` on the pedestal
  - `<SystemsOrbit>` around it
  - `<h1>` with the greeting (`hermesNow()` hour < 12 → morning, < 18 → afternoon, otherwise evening)
  - the brief turn's text, streamed in the serif voice; while the brief is running, the bot is `thinking`/`speaking`
  - the composer, centered, at most 640px wide
  - `<Suggestions/>` as chips
- Produces (`SystemsOrbit.tsx`):
  - The six systems sit on a ring, each a `<button aria-label={'Ask about ' + name}>` that sends `ask`.
  - A system in `activeSystems(...)` gets `data-active="true"`: it glows, and a line connects it to the bot.
  - At 375 the orbit becomes a single horizontal row of six icon buttons under the bot; it stays tappable and causes no overflow.
  - Under reduced motion it is static.
- Produces (`DockedBot.tsx`):
  - `<BotOrb size={88 | 56 on <1024} pedestal={false} …>`, docked at the left of the composer row.
  - Above it, a compact status line while working: `Reading Jira, GitHub…`, built from `activeSystems`.
  - Clicking the bot focuses the composer.
  - On `finishedHappily`, call `ref.bounce()`.
  - **Always visible** (Review Focus 1): when the canvas sheet or rail drawer is open below 1024, the docked bot renders at a fixed position (bottom-left, `z-index` above the sheet and drawer) and stays visible. While the user is typing in the sheet, it doesn't cover the composer, close buttons or inputs: offset it to stay clear of the sheet's header buttons and the iOS safe area.
- **Voice:** when voice mode is active, the docked or hero bot shows the voice state through `botStateFor`. The existing VoiceMode orb is replaced by the bot (keep VoiceMode's controls and captions, and remove its own `AssistantOrb` in Hermes by passing a prop such as `orb={false}`, defaulting to true for other sites).

- [ ] **Step 1: Invoke the `frontend-design` skill.**
- [ ] **Step 2: Write the failing e2e tests:**
  - **First screen:** `/hermes` as Maya shows a `[data-bot]` at least 160px tall, an h1 starting `Good`, six system buttons, the composer and three chips, and no stat tiles (`.glance` is absent). Within 10 s the brief text contains `PRs merged`.
  - **Brief as Sara:** contains `Platform`.
  - **Bot always visible:** on every `HERMES_PATHS` route except sign-in, at 1280, 900 and 375, after asking one question, `[data-bot]` is visible in the viewport. At 375 this also holds with the canvas sheet open and with the drawer open (Review Focus 1).
  - **Bot states:** after asking `How is the team doing?`, `[data-bot]` `data-state` goes through `thinking`, then `speaking`, then `idle`/`happy`. Poll the attribute and record the values seen.
  - **Systems:** during that reply, at least one system button on the hero has `data-active="true"`. Ask the question from a chip on the empty screen so the hero is still visible while the tools run, or assert on the docked status line `Reading`.
  - **Opening:** `Show me the team dashboard` → the URL becomes `/hermes/team`, the canvas h2 is `Team`, and the turn is still in the thread (Review Focus 4).
  - **Brief race** (Review Focus 2): sending a question while the brief streams leaves the brief stopped and the question answered. `New conversation` shows the hero again with a new brief, and the rail lists the previous conversation by its question, not by the brief. Switching user mid-brief shows only the new user's greeting and brief.
- [ ] **Step 3: Run** `npx playwright test e2e/hermes.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** `npm run test:all`. Expected: PASS.
- [ ] **Step 6: Screenshot** the first screen and the mid-conversation screen at 1280 and 375, plus the sheet open at 375. Review and iterate until the bot reads as the hero, the screen looks like the reference style, and nothing overlaps.
- [ ] **Step 7: Commit** `git commit -m "Put the Hermes bot centre stage: hero, systems orbit, morning brief and a docked bot"`

---

### Task 6: Polish pass and full Hermes test sweep

**Files:**
- Modify: `demo/hermes/hermes.css`, `demo/hermes/workspace/*`, and `demo/assistant/assistant.css` (Hermes overrides only, under `.hermes`)
- Rewrite: `e2e/assistant.spec.ts`. Hermes-relevant shell behaviour now runs inside the workspace: composer focus with `/` and `⌘K`, Stop keeping focus, attachments surviving canvas open and close and navigation, the draft surviving, voice mode controls, the Draft `Copy` button, and the unread logic only where it still applies.
- Modify: `playwright.config.ts` (mobile `testMatch` includes `hermes|assistant`, as before)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Invoke the `frontend-design` skill.** Then review every Hermes screen at 1280, 900 and 375 against spec §10.4 and the reference image:
  - sign-in
  - the first screen
  - mid-conversation with a table, a chart, status cards and a draft
  - each canvas view
  - the drawer
  - voice mode
  - an error or outage answer
  
  Fix spacing, hierarchy, glow restraint, glass consistency and typography. Answers are serif; interface text is sans.
- [ ] **Step 2: Write the rewritten `e2e/assistant.spec.ts`** covering the behaviours listed above. Add axe checks, with no serious or critical issues, on:
  - the first screen
  - a conversation with every block kind (table, chart, stat, status, draft, link)
  - each canvas view
  - the drawer and sheet

  Run them at 1280 and 375 (Review Focus 5). Add a reduced-motion test: with `page.emulateMedia({ reducedMotion: 'reduce' })`, `[data-bot]` has no running CSS animations (`getAnimations()` is empty or only opacity fades).
- [ ] **Step 3: Run** `npm run test:all`. Fix failures. Expected: PASS.
- [ ] **Step 4: Screenshots.** Take final screenshots at 1280 and 375 of the first screen, mid-conversation and a canvas view. Save them under `docs/superpowers/screens/` as PNGs; these are committed, so the user can review them.
- [ ] **Step 5: Commit** `git commit -m "Polish the Hermes workspace and cover it end to end"`

---

### Task 7: Document `BotOrb` and the redesign

**Files:**
- Modify: `demo/site/routes.ts` (a `COMPONENTS` entry: `{ slug: 'bot-orb', name: 'BotOrb', group: 'Chat', tint: '#8b7cff', summary: 'A friendly robot that floats on a glowing pedestal and shows what the assistant is doing: listening, thinking, speaking.' }`)
- Modify: `demo/site/docs.ts` (the BotOrb docs entry: props table and usage snippet, following the existing entries)
- Modify: `demo/site/demos.tsx` (a live demo with a state picker)
- Modify: `demo/playground/registry.tsx` (a playground entry, following the existing ones)
- Modify: `README.md`:
  - the BotOrb section and the table row "Assistant character → BotOrb";
  - the Hermes section updated for the AI-first workspace (rail, conversation, canvas, the bot always visible, dark-only);
  - the screenshots linked from `docs/superpowers/screens/`.
- Test: `demo/site/site.test.ts`. The existing smoke, components and playground e2e tests iterate over `COMPONENTS` and `ENTRIES` and so cover the new page.

**Interfaces:**
- Consumes: `BotOrb`, `BOT_STATES` and `botCaption` (Task 1).

- [ ] **Step 1: Write the failing test.** In `site.test.ts`, `COMPONENTS` contains `bot-orb`, every component has a `DOCS` entry, and `ENTRIES` contains BotOrb. Follow whatever invariant tests already exist for the other orbs.
- [ ] **Step 2: Run** `npx vitest run demo/site`. Expected: FAIL.
- [ ] **Step 3: Implement** the docs entry, demo, playground entry and README.
- [ ] **Step 4: Run** `npm run test:all`. Expected: PASS, including the docs smoke for `/components/bot-orb`.
- [ ] **Step 5: Commit** `git commit -m "Document BotOrb and the AI-first Hermes workspace"`
