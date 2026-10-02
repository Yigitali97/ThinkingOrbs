# AI-native Sites (Fleet and Hermes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two showcase websites in this repo, Fleet (`/fleet/`) and Hermes (`/hermes/`). Each has an always-on assistant that keeps its conversation across pages, knows the current page, and answers from seeded sample data with text plus rich blocks. The Fleet agent is limited to fleet data; Hermes covers every company system, with role-based visibility.

**Architecture:** There are three layers.
- `demo/assistant/` is a site-agnostic shell: the protocol, the conversation store, the tool caller with a policy hook, and the dock/panel/composer/blocks UI.
- Each site defines its own `AgentDefinition`: tools, intents, a brain and (Hermes only) a policy. It also has its own pages and a seeded data generator.
- The ThinkingOrbs components and the chat sample's reply model sit underneath and are reused, not forked.

Vite builds three HTML entries (`index.html`, `fleet/index.html`, `hermes/index.html`), and the prerender plugin writes one file per route for each site.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Vitest 2 (node environment), Playwright 1.63 with `@axe-core/playwright`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-ai-native-sites-design.md`

## Global Constraints

- No new runtime or dev dependencies. Charts and the map are inline SVG; routing reuses `demo/site/router.tsx`.
- Everything works offline with no API key and makes no network requests beyond the site's own assets.
- Isolation:
  - Fleet code (`demo/fleet/**`) never imports from `demo/hermes/**`, and vice versa.
  - `demo/assistant/**` imports from neither.
  - Shared code may come only from `demo/assistant`, `demo/chat-app`, `demo/voice-assistant`, `demo/site/router.tsx` and `src/orbs`.
- Data is deterministic: generators take `(seed, now)` and use only `seeded(seed)` from `demo/assistant/random.ts`, never `Math.random()`.
- Fleet scope sentence (exact): `I handle fleet management: vehicles, drivers, trips, fuel, maintenance and alerts.`
- Fleet decline (exact prefix): `That's outside what I can help with. ` followed by the scope sentence and three suggestion chips.
- Hermes is read-only. Draft blocks carry the exact label `Demo — not sent`.
- Hermes Developer restriction copy (exact): `Individual hours for other people are visible to managers. Here's your team's total instead.`
- Hermes sign-in storage key: `hermes.user` in `sessionStorage`. Every access is wrapped in try/catch and falls back to memory.
- Layout:
  - The panel is a side panel at ≥ 768px and a bottom sheet below that.
  - No horizontal scroll at 375px.
  - `prefers-reduced-motion` is respected.
  - Light and dark themes come from `prefers-color-scheme`, with colors defined as CSS custom properties.
- Code style matches the repo:
  - every file opens with a one-to-three-line comment saying what it is for
  - two-space indent, single quotes, ~140-column lines
  - no default exports
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deliberate trim from spec §2.1: `BrainContext` has no `history`, because no intent in spec §3.4/§4.6 needs it.
- Deliberate change from spec §3.2: there are **30 vehicles**, not 24 (14 trucks `TRK-01…TRK-14`, 12 vans `VAN-01…VAN-12`, 4 cars `CAR-01…CAR-04`), so the spec's example ids `TRK-14` and `VAN-12` exist.
- Small change from spec §2.1: the `location` block also carries an `href`, so the shell can render it without knowing about maps.

## Review Focus

1. **A second question while the first is still streaming.** The first reply ends as `stopped` with its partial text kept, then the second runs to `done`. No interleaved text and no stuck `busy`. → Task 5.
2. **Loosely typed vehicle ids and unknown ids.** `van 12`, `VAN12`, `Van-12` and `van-12` all resolve to `VAN-12`. `TRK-99` gets "I can't find TRK-99" with no blocks and no crash. → Task 4.
3. **Empty or zero ranges.** On Monday 00:30 "this week" has no hours, and the previous period can be 0. Answers show 0 and "no change data", never `NaN`, `Infinity` or an empty chart that throws. → Tasks 1, 6 and 11.
4. **Switching the Hermes demo user mid-reply.** The running reply is aborted and the old conversation is gone. Nothing computed for Leadership ever renders in the Developer's session. → Tasks 5 and 13.
5. **The `/` shortcut while typing.** Pressing `/` in the composer or a page filter types a slash and doesn't open or steal focus. `⌘K`/`Ctrl+K` still opens from inside inputs. → Task 6.

---

### Task 1: Assistant protocol, reply model and text helpers

**Files:**
- Create: `demo/assistant/protocol.ts`
- Create: `demo/assistant/reply.ts`
- Create: `demo/assistant/random.ts`
- Create: `demo/assistant/text.ts`
- Test: `demo/assistant/assistant.test.ts`

**Interfaces:**
- Consumes: `AgentEvent`, `ChatAttachment` from `demo/chat-app/agent.ts`; `Reply`, `createReply`, `applyEvent`, `finishReply` from `demo/chat-app/activity.ts`.
- Produces (`protocol.ts`, types only):
  ```ts
  type Tone = 'good' | 'warn' | 'bad' | 'neutral';
  interface Column { key: string; label: string; align?: 'left' | 'right' }
  type Row = Record<string, string | number> & { href?: string };
  interface Series { name: string; values: number[] }
  type Block =
    | { kind: 'table'; columns: Column[]; rows: Row[]; caption?: string }
    | { kind: 'chart'; type: 'bar' | 'line'; series: Series[]; x: string[]; unit?: string; caption?: string }
    | { kind: 'stat'; items: { label: string; value: string; delta?: string; tone?: Tone }[] }
    | { kind: 'status'; title: string; status: 'on-track' | 'at-risk' | 'off-track'; reasons: string[]; sources: string[]; href?: string }
    | { kind: 'draft'; channel: 'teams' | 'email'; to?: string; subject?: string; body: string }
    | { kind: 'link'; label: string; href: string }
    | { kind: 'location'; vehicleId: string; label: string; href: string };
  type AssistantEvent = AgentEvent | { type: 'block'; block: Block };
  interface PageContext { page: string; title: string; id?: string; data?: unknown }
  type Role = 'leadership' | 'manager' | 'developer';
  interface User { id: string; name: string; title: string; role: Role; team: string }
  interface ToolContext { user?: User; now: Date; signal: AbortSignal }
  interface Tool<I = any, O = any> { id: string; label: string; system: string; run(input: I, ctx: ToolContext): Promise<O> }
  type ToolResult<O = unknown> =
    | { ok: true; data: O; restricted?: string }
    | { ok: false; reason: 'denied' | 'failed' | 'unknown-tool'; message: string; alternative?: string };
  interface Policy {
    before(tool: Tool, input: unknown, user?: User): { reason: string; alternative?: string } | null;
    after<O>(tool: Tool, output: O, user?: User): { output: O; restricted?: string };
  }
  interface BrainContext { page: PageContext; user?: User; now: Date; call: <O = unknown>(toolId: string, input?: unknown) => Promise<ToolResult<O>> }
  type Emit = (e: AssistantEvent) => void;
  type Brain = (input: { text: string; attachments: ChatAttachment[] }, ctx: BrainContext, emit: Emit, signal: AbortSignal) => Promise<void>;
  interface AgentDefinition {
    id: 'fleet' | 'hermes'; name: string; scope: string; tools: Tool[]; brain: Brain;
    greeting(user?: User): string; suggestions(page: PageContext, user?: User): string[]; policy?: Policy;
  }
  ```
- Produces (`reply.ts`):
  - `type AssistantReply = Reply & { blocks: Block[] }`
  - `createAssistantReply(id: string, now: number): AssistantReply`
  - `applyAssistantEvent(r: AssistantReply, e: AssistantEvent, now: number): AssistantReply`: `block` appends to `blocks` and sets `firstTextAt`/state `writing` if unset; anything else delegates to `applyEvent` and keeps `blocks`.
  - `finishAssistantReply(r: AssistantReply, outcome: 'done' | 'stopped' | 'error', now: number, error?: string): AssistantReply`
- Produces (`random.ts`):
  - `seeded(seed: number): () => number` (mulberry32, output in [0, 1))
  - `int(rng, min, max): number` (inclusive)
  - `pick<T>(rng, list: T[]): T`
- Produces (`text.ts`):
  - `normalize(text: string): string`: lower-case, curly quotes → straight, collapse whitespace.
  - `hasAny(text: string, words: string[]): boolean`: whole-word match on the normalized text.
  - `parseRange(text: string, now: Date): { from: Date; to: Date; label: string } | null`: recognizes `today`, `yesterday`, `this week`, `last week`, `this month`, `last month`. Weeks start Monday 00:00 local; `to` is exclusive. `this week` / `this month` end at `now`.
  - `previousRange(r): { from: Date; to: Date; label: string }`: the same-length period immediately before.
  - `percentChange(current: number, previous: number): number | null`: `null` when `previous === 0`; otherwise rounded to one decimal.

- [ ] **Step 1: Write the failing tests** in `demo/assistant/assistant.test.ts`:
  ```ts
  it('seeded is deterministic', () => { const a = seeded(7), b = seeded(7); expect([a(), a(), a()]).toEqual([b(), b(), b()]); });
  it('a block event appends and keeps activities', () => {
    let r = createAssistantReply('r1', 0);
    r = applyAssistantEvent(r, { type: 'tool', id: 't1', label: 'Reading trips', status: 'running' }, 1);
    r = applyAssistantEvent(r, { type: 'block', block: { kind: 'link', label: 'Open', href: '/fleet/' } }, 2);
    expect(r.blocks).toHaveLength(1); expect(r.activities[0].kind).toBe('tools');
    expect(finishAssistantReply(r, 'done', 3).blocks).toHaveLength(1);
  });
  it('parseRange this week starts Monday', () => {
    const now = new Date('2026-10-07T15:00:00'); // Wednesday
    expect(parseRange('hours this week?', now)!.from).toEqual(new Date('2026-10-05T00:00:00'));
    expect(parseRange('last week', now)!.to).toEqual(new Date('2026-10-05T00:00:00'));
    expect(parseRange('last month', now)!.from).toEqual(new Date('2026-09-01T00:00:00'));
    expect(parseRange('the weather', now)).toBeNull();
  });
  it('this week on Monday just after midnight is a 30-minute range', () => {   // Review Focus 3
    const r = parseRange('this week', new Date('2026-10-05T00:30:00'))!;
    expect(r.to.getTime() - r.from.getTime()).toBe(30 * 60_000);
  });
  it('percentChange guards zero', () => { expect(percentChange(5, 0)).toBeNull(); expect(percentChange(110, 100)).toBe(10); });
  it('hasAny matches whole words only', () => { expect(hasAny('Any vans late?', ['van', 'vans'])).toBe(true); expect(hasAny('advance', ['van'])).toBe(false); });
  ```
- [ ] **Step 2: Run** `npx vitest run demo/assistant/assistant.test.ts`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** the four modules with the signatures above.
- [ ] **Step 4: Run** `npx vitest run demo/assistant/assistant.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add demo/assistant && git commit -m "Add the assistant protocol, reply model and text helpers"`

---

### Task 2: Tool caller with policy and flaky systems

**Files:**
- Create: `demo/assistant/callTool.ts`
- Create: `demo/assistant/flaky.ts`
- Test: `demo/assistant/callTool.test.ts`

**Interfaces:**
- Consumes: `AgentDefinition`, `Tool`, `ToolResult`, `User`, `Emit` (Task 1).
- Produces (`flaky.ts`, an in-memory store):
  - `isDown(system: string): boolean`
  - `setDown(system: string, down: boolean): void`
  - `useDown(): ReadonlySet<string>` (React `useSyncExternalStore`)
- Produces (`callTool.ts`):
  - `createCaller(def: Pick<AgentDefinition, 'tools' | 'policy'>, opts: { user?: User; now: Date; emit: Emit; signal: AbortSignal; latency?: (toolId: string) => number }): BrainContext['call']`
    - The default latency is 250–700 ms from `seeded` per call index.
    - **Unknown id:** returns `{ ok: false, reason: 'unknown-tool' }` with no events.
    - **Policy `before` denial:** returns `{ ok: false, reason: 'denied', message, alternative }` with no events.
    - **Otherwise:**
      - it emits `{ type: 'tool', id: '<toolId>#<n>', label: tool.label, status: 'running' }` and waits for the latency (abortable)
      - if `isDown(tool.system)` it emits `error` and returns `{ ok: false, reason: 'failed', message: '<system> didn't respond' }`
      - else it runs the tool, applies `policy.after`, emits `done` and returns `{ ok: true, data, restricted }`
    - A thrown tool error emits `error` and returns `reason: 'failed'`.
    - When `signal` aborts, it emits `error` for a running call and rejects with a `DOMException` named `AbortError`.
  - `queryTool<O>(def: Pick<AgentDefinition, 'tools' | 'policy'>, toolId: string, input: unknown, ctx: { user?: User; now: Date }): Promise<ToolResult<O>>`: the same policy rules with no events, no latency, and **it ignores `isDown`**, because pages show cached data. Pages use it.

- [ ] **Step 1: Write the failing tests.** Use a fake definition with tools `x.ok` (returns `{ n: 1 }`), `x.throws` and `x.secret` (system `'Secret'`), and a policy that denies `x.secret` and marks `x.ok` as `restricted: 'trimmed'`. Assert:
  - `call('nope')` → `reason: 'unknown-tool'` and `emitted` is empty
  - `call('x.ok')` → `{ ok: true, data: { n: 1 }, restricted: 'trimmed' }`, and the events are `running` then `done`, both with id `x.ok#1`
  - `setDown('X', true)` makes `call('x.ok')` return `{ ok: false, reason: 'failed', message: "X didn't respond" }` and the last event `error`
  - `call('x.secret')` → `reason: 'denied'` with no events
  - `call('x.throws')` → `reason: 'failed'`
  - aborting mid-latency rejects with `name === 'AbortError'`
  - `queryTool` with `setDown('X', true)` still returns `ok: true`

  Use `latency: () => 0` except in the abort test (`() => 50`). Call `setDown('X', false)` in `afterEach`.
- [ ] **Step 2: Run** `npx vitest run demo/assistant/callTool.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `flaky.ts` and `callTool.ts`.
- [ ] **Step 4: Run** `npx vitest run demo/assistant`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the assistant's tool caller with a policy hook and flaky systems"`

---

### Task 3: Fleet data generator, derived state and map routes

**Files:**
- Create: `demo/fleet/data/types.ts`
- Create: `demo/fleet/data/generate.ts`
- Create: `demo/fleet/data/derive.ts`
- Create: `demo/fleet/map/routes.ts`
- Test: `demo/fleet/data/fleet-data.test.ts`

**Interfaces:**
- Consumes: `seeded`, `int`, `pick` (Task 1).
- Produces (`types.ts`):
  - `Vehicle { id; type: 'truck' | 'van' | 'car'; name; depotId; fuelType: 'diesel' | 'petrol' | 'electric'; tankLitres; odometerKm; serviceIntervalKm; lastServiceKm; lastServiceAt: number; driverId?; inShop: boolean }`
  - `Driver { id: 'D-01'…; name; licenseClass: 'C' | 'B'; vehicleId? }`
  - `Trip { id; vehicleId; driverId; routeId; start: number; plannedMinutes; delayMinutes; delayReason?: 'traffic' | 'loading' | 'breakdown' | 'detour'; done: boolean }`
  - `FuelFill { vehicleId; at; litres; cost }`
  - `ServiceRecord { vehicleId; at; km; kind: 'service' | 'tyres' | 'brakes' | 'repair'; cost }`
  - `TelematicsEvent { vehicleId; driverId; at; kind: 'harsh-braking' | 'speeding' | 'idling'; minutes? }`
  - `FleetData { vehicles; drivers; trips; fuel; services; events; fuelLevel: Record<string, number> /* 0–1 */ }`
- Produces (`map/routes.ts`):
  - `DEPOTS: { id: 'north' | 'harbor' | 'east'; name; x; y }[]`
  - `ROUTES: { id; name; points: [number, number][] }[]` (at least 8 routes in a 1000×640 viewBox)
  - `pointAt(route, t: number): { x: number; y: number }` (arc-length interpolation; `t` is clamped to [0, 1])
- Produces (`generate.ts`):
  - `FLEET_SEED = 7`
  - `generateFleet(seed: number, now: Date): FleetData`
  - 30 vehicles (ids per Global Constraints), 18 drivers, 30 days of trips, fuel fills, services and telematics before `now`.
  - **Planted scenarios, applied after the random pass:**
    - `VAN-12` has an active trip (`done: false`), `delayMinutes` 25–40 and `delayReason: 'traffic'`.
    - `TRK-14` has an active trip.
    - `TRK-03`, `VAN-05` and `CAR-02` are past their service by km.
    - Exactly 2 vehicles are `inShop`.
    - `VAN-07` has `fuelLevel` 0.08.
    - Driver `D-04` has no harsh-braking or speeding events in the last 7 days.
    - Driver `D-11` has the most idling minutes in the last 7 days.
- Produces (`derive.ts`):
  - `tripEnd(trip): number` (`start + (planned + delay)` minutes)
  - `isLate(trip, now): boolean` (`delayMinutes >= 10 && !done`)
  - `maintenance(v, now): { vehicleId; kmLeft; dueAt: number; state: 'ok' | 'due-soon' | 'overdue' }`: overdue if `kmLeft < 0` or `dueAt < now`; due-soon if `kmLeft < 1500` or `dueAt` is within 14 days. `dueAt = lastServiceAt + 180 days`.
  - `alerts(data, now): { id; kind: 'late' | 'service-overdue' | 'low-fuel' | 'safety'; vehicleId; message }[]`: low fuel is `fuelLevel < 0.15`; safety is a vehicle with ≥ 3 harsh-braking/speeding events in 24 h.
  - `safetyScore(driverId, data, from, to): number`: `100 − 4 × harsh-braking − 3 × speeding`, floored at 0.
  - `idleMinutes(driverId, data, from, to): number`
  - `vehicleStatus(v, data, now): 'on-trip' | 'idle' | 'in-shop'`

- [ ] **Step 1: Write the failing tests** with `const NOW = new Date('2026-10-05T10:00:00')` and `const d = generateFleet(FLEET_SEED, NOW)`:
  - two runs deep-equal
  - `d.vehicles` has 30 entries and `d.drivers` has 18
  - `isLate(VAN-12's active trip)` is true and the reason is `'traffic'`
  - `maintenance` of `TRK-03`, `VAN-05` and `CAR-02` is `'overdue'`
  - exactly 2 vehicles have status `in-shop`
  - `alerts` includes `{ kind: 'low-fuel', vehicleId: 'VAN-07' }`
  - `D-04` has the highest `safetyScore` over the last 7 days and `D-11` has the most `idleMinutes`
  - every trip `routeId` exists in `ROUTES`
  - `pointAt(r, 0)` equals the first point, `pointAt(r, 1)` equals the last, and `pointAt(r, 2)` equals `pointAt(r, 1)`
  - no `Math.random` is used: spy on it with `vi.spyOn(Math, 'random')` and expect zero calls
- [ ] **Step 2: Run** `npx vitest run demo/fleet`. Expected: FAIL.
- [ ] **Step 3: Implement** the four modules.
- [ ] **Step 4: Run** `npx vitest run demo/fleet`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the seeded fleet data generator, derived state and map routes"`

---

### Task 4: Shared brain runner, Fleet tools, intents and agent

**Files:**
- Create: `demo/assistant/brain.ts`
- Create: `demo/assistant/testing.ts`
- Create: `demo/fleet/agent/tools.ts`
- Create: `demo/fleet/agent/intents.ts`
- Create: `demo/fleet/agent/definition.ts`
- Create: `demo/fleet/store.ts`
- Test: `demo/fleet/agent/fleet-agent.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (`demo/assistant/brain.ts`):
  - `interface Intent<P = unknown> { id: string; match(text: string, ctx: BrainContext): P | null; run(params: P, ctx: BrainContext, emit: Emit, signal: AbortSignal): Promise<void> }`
  - `say(emit: Emit, text: string, signal: AbortSignal, pace?: number): Promise<void>`: streams word chunks with `pace` ms between them (default 18; 0 in tests).
  - `createBrain(opts: { intents: Intent[]; outOfScope?: (text: string, ctx: BrainContext) => boolean; decline: (ctx: BrainContext) => string; notUnderstood: (ctx: BrainContext) => string; pace?: number }): Brain`
    - It tries intents in order. On a match it emits `{ type: 'thinking', label: 'Working out what you need' }` and runs the intent.
    - With no match: if `outOfScope` is given and returns true, it says `decline(ctx)`; otherwise it says `notUnderstood(ctx)`. In both cases it makes no tool calls.
    - **Attachments come first.** Each file gets `ingest` events (progress 0 → 1 in four steps, then `done`); each image gets `vision` `scanning` → `done` with `src: att.url`. Then the brain says `I've read <name> (<size>).`
    - With attachments and empty text, it then says `What would you like to know about it?` (`them` for several) and skips intents.
  - `setPace(ms: number)`: a module-level override used by tests.
- Produces (`demo/assistant/testing.ts`, test-only):
  - `runBrain(def: AgentDefinition, text: string, opts: { now: Date; page?: PageContext; user?: User }): Promise<{ text: string; blocks: Block[]; tools: string[]; received: ToolResult[] }>`
  - It uses `createCaller` with `latency: () => 0` and `setPace(0)`. `tools` lists the tool ids called; `received` is every `ToolResult` the brain got.
- Produces (`demo/fleet/store.ts`):
  - `FLEET: FleetData`: generated once at module load with `now` = load time rounded down to the minute
  - `fleetNow(): Date`: sim time = load time + elapsed × speed
  - `setSpeed(1 | 5 | 20)`, `useFleetSpeed()`
- Produces (`tools.ts`): `fleetTools(data: () => FleetData): Tool[]`, all with `system: 'Fleet'`:

  | id | label | input → output |
  |---|---|---|
  | `fleet.vehicles` | `Reading vehicles` | `{ id?: string }` → `(Vehicle & { status; fuelLevel; position?: {x, y} })[]` |
  | `fleet.drivers` | `Reading drivers` | `{ from: number; to: number }` → `(Driver & { safetyScore; idleMinutes })[]` |
  | `fleet.trips` | `Reading trips` | `{ vehicleId?: string; active?: boolean }` → `(Trip & { late: boolean; eta: number })[]` |
  | `fleet.maintenance` | `Checking maintenance` | `{}` → `ReturnType<typeof maintenance>[]` |
  | `fleet.fuel` | `Reading fuel records` | `{ from: number; to: number }` → `FuelFill[]` |
  | `fleet.alerts` | `Checking alerts` | `{}` → `ReturnType<typeof alerts>` |

- Produces (`intents.ts`):
  - `vehicleIdIn(text: string): string | null`: matches `trk|truck|van|car` + optional space/hyphen + digits and normalizes to `TRK-14` / `VAN-12` / `CAR-02` (zero-padded to 2 digits).
  - `FLEET_INTENTS: Intent[]` with ids, in order:
    - `this-vehicle`: page is `vehicle` and the text has "this"/"it"
    - `why-late`
    - `where-is`
    - `service-due`
    - `fuel-compare`
    - `driver-ranking`: safest or idling
    - `on-road-now`
    - `open-alerts`
  - `isFleetTopic(text: string): boolean`: true if the text has a vehicle id or any of `vehicle(s) truck(s) van(s) car(s) driver(s) trip(s) route(s) fuel diesel service maintenance depot alert(s) mileage km fleet late eta idle idling braking`.
- Produces (`definition.ts`): `fleetAgent: AgentDefinition`:
  - `id: 'fleet'`, `name: 'Fleet Assistant'`, `scope`: the exact sentence
  - `tools: fleetTools(() => FLEET)`
  - `brain: createBrain({ intents: FLEET_INTENTS, outOfScope: (t) => !isFleetTopic(t), decline: () => "That's outside what I can help with. " + scope, notUnderstood })`
  - `suggestions(page)`: three per page kind; the vehicle page includes `Anything wrong with this one?`
  - `greeting()`: `Hi, I'm the Fleet Assistant. Ask me about vehicles, drivers, trips, fuel or maintenance.`
- Answer shapes, per spec §3.4:
  - `service-due` → a table with columns `vehicle, state, due` and a row `href` of `/fleet/vehicles/<id>`, plus one `link` block per overdue vehicle
  - `why-late` → text naming the reason and minutes, a `stat` block (`ETA`, `Delay`), and a `location` block with `href: /fleet/?vehicle=<id>`
  - `where-is` → `location` + `stat` (`Trip`, `ETA`)
  - `fuel-compare` → a weekly `bar` chart (series `This month`, `Last month`) + a `stat` with `delta` from `percentChange`, or `No change data` when that is `null`
  - `driver-ranking` → a table sorted by the asked metric, best first
  - `on-road-now` → `stat`
  - `open-alerts` → a table with columns `type, vehicle, message`
  - **Unknown vehicle id** → text `I can't find <ID>. Fleet vehicles are TRK-01–TRK-14, VAN-01–VAN-12 and CAR-01–CAR-04.` with no blocks

- [ ] **Step 1: Write the failing tests.** Use `const NOW = new Date('2026-10-05T10:00:00')`, build a definition whose tools read `generateFleet(FLEET_SEED, NOW)`, and call `runBrain(def, q, { now: NOW })`:
  - `Which vehicles are due for service?` → `blocks[0].kind === 'table'`, its row vehicles include `TRK-03`, `VAN-05` and `CAR-02`, and the row count equals the number of vehicles whose `maintenance` state is not `'ok'`
  - `Why is VAN-12 late?`, `why is van 12 late`, `VAN12 late?` and `Van-12 delayed?` → text contains `traffic`, and a block `{ kind: 'location', vehicleId: 'VAN-12' }` exists (Review Focus 2)
  - `Where is TRK-99?` → text starts `I can't find TRK-99`, `blocks` is empty, and nothing throws (Review Focus 2)
  - `Fuel spend this month vs last?` → a `chart` block of type `bar` with 2 series, and the `stat` delta equals `percentChange` of the summed costs
  - `Who's our safest driver?` → the first table row's driver is `D-04`; `Who idles the most this week?` → the first row is `D-11`
  - `How many vehicles are on the road right now?` → the stat value equals the count of active trips
  - with page `{ page: 'vehicle', title: 'TRK-03', id: 'TRK-03' }`, `Anything wrong with this one?` → text contains `overdue`
  - for each of `What's the weather today?`, `How many hours did developers work this week?`, `Write me a poem about the sea`, `What's the capital of France?` and `Show me open Jira tickets`: text starts `That's outside what I can help with.` and `tools` is empty
  - `fleetAgent.tools.every(t => t.id.startsWith('fleet.'))`
  - an attachment `{ name: 'log.csv', type: 'text/csv', size: 2048 }` with empty text → the activities include a `file` activity, the text contains `I've read log.csv (2.0 KB).`, and `tools` is empty
- [ ] **Step 2: Run** `npx vitest run demo/fleet`. Expected: FAIL.
- [ ] **Step 3: Implement** `brain.ts`, `testing.ts`, `store.ts` and the three agent files.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS (existing tests included).
- [ ] **Step 5: Commit** `git commit -m "Add the Fleet agent: tools, intents and a scope-limited brain"`

---

### Task 5: Conversation store, provider and page context

**Files:**
- Create: `demo/chat-app/useUploads.ts` (extracted from `useChat.ts`)
- Modify: `demo/chat-app/useChat.ts` (use `useUploads`; behavior unchanged)
- Create: `demo/assistant/conversation.ts`
- Create: `demo/assistant/AssistantProvider.tsx`
- Create: `demo/assistant/usePageContext.ts`
- Create: `demo/assistant/speakable.ts`
- Test: `demo/assistant/conversation.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces (`useUploads.ts`): `useUploads(): { uploads: Upload[]; uploadsRef; attachFiles(files: FileList | null); addUploads(atts: ChatAttachment[]); removeUpload(id); takeReady(): ChatAttachment[] }`. Move `Upload` there and re-export it from `useChat.ts`.
- Produces (`conversation.ts`, no React):
  - `interface Turn { id: string; question: string; attachments: ChatAttachment[]; reply: AssistantReply }`
  - `interface Archived { id: string; title: string; turns: Turn[] }` (`title` = the first question, cut to 60 characters)
  - `interface ConversationSnapshot { turns: Turn[]; busy: boolean; archive: Archived[] }`
  - `createConversation(def: AgentDefinition, opts: { user?: User; page: () => PageContext; now?: () => Date; latency?: (toolId: string) => number }): Conversation`
  - `interface Conversation { getSnapshot(): ConversationSnapshot; subscribe(fn: () => void): () => void; send(text: string, attachments?: ChatAttachment[]): Promise<AssistantReply | null>; stop(): void; clear(): void; restore(id: string): void; dispose(): void }`
    - `send` with empty text and no attachments returns `null`.
    - **`send` while busy:** stops the running reply, waits for it to settle as `stopped`, then starts the new one (Review Focus 1).
    - A brain error finishes the reply as `error` with its message.
    - `clear()` stops any running reply, then moves the non-empty conversation to the front of `archive` (max 5).
    - `restore(id)` archives the current conversation and brings `id` back.
    - `dispose()` aborts and drops all listeners.
- Produces (`speakable.ts`): `speakable(reply: AssistantReply): string`: the reply text, then for the first block one of `I've put a table on screen.`, `I've put a chart on screen.`, `I've put the numbers on screen.` (stat), `I've put the status on screen.`, `I've put a draft on screen.`, `I've put it on the map.` (location), or nothing for `link`.
- Produces (`AssistantProvider.tsx`):
  - `<AssistantProvider agent={AgentDefinition} user?={User} now?={() => Date}>`. It creates one `Conversation` per `(agent, user?.id)` with `useMemo`, disposing the old one on change. That is what clears and aborts on a user switch.
  - `useAssistant(): { agent; user?; conversation: Conversation; snapshot: ConversationSnapshot; page: PageContext; open: boolean; setOpen(o: boolean, opener?: HTMLElement | null): void; inline: boolean; setInline(on: boolean): void; unread: boolean }`
  - `unread` becomes true when a reply finishes while `open` is false and `inline` is false, and resets on open.
- Produces (`usePageContext.ts`): `usePageContext(ctx: PageContext): void`. It registers on mount and on change (compared with `JSON.stringify` on `page/id/title`) and restores the default `{ page: 'unknown', title: document.title }` on unmount.

- [ ] **Step 1: Write the failing tests** with a fake agent. Its brain streams `say(emit, 'one two three', signal, 5)`; on the text `slow` it waits 200 ms (abortable), then says `late`. It throws on `boom`. Assert:
  - `send('hi')` resolves to a reply with state `done` and text `one two three`
  - `send('slow')`, then immediately `send('hi')`: the turns are `[slow: stopped, hi: done]`, the stopped reply's text has no `late`, and `busy` ends `false` (Review Focus 1)
  - `send('boom')` → state `error`
  - `send('')` → `null`
  - `clear()` after two turns → `turns` is empty and `archive[0].title` is the first question
  - `restore(archive[0].id)` brings the turns back
  - `dispose()` during `slow` → no listener calls afterwards
  - `speakable` of a reply with text `Done.` and a table block → `Done. I've put a table on screen.`
- [ ] **Step 2: Run** `npx vitest run demo/assistant/conversation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `useUploads` (cut from `useChat`), `conversation.ts`, `speakable.ts`, `AssistantProvider.tsx` and `usePageContext.ts`.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS, including `demo/chat-app/activity.test.ts`.
- [ ] **Step 5: Commit** `git commit -m "Add the assistant's conversation store, provider and page context"`

---

### Task 6: Multi-site build, Fleet shell and the assistant UI

**Files:**
- Create: `fleet/index.html` (copy of the root `index.html` shell with Fleet title/description/theme-color, script `/demo/fleet/main.tsx`)
- Create: `demo/fleet/routes.ts`
- Create: `demo/fleet/main.tsx`
- Create: `demo/fleet/App.tsx`
- Create: `demo/fleet/pages/NotFound.tsx`
- Create: `demo/fleet/fleet.css`
- Modify: `vite.config.ts` (multi-entry, generalized prerender, dev/preview fallback)
- Create: `demo/assistant/Dock.tsx`
- Create: `demo/assistant/Panel.tsx`
- Create: `demo/assistant/Thread.tsx`
- Create: `demo/assistant/Composer.tsx`
- Create: `demo/assistant/AskBar.tsx`
- Create: `demo/assistant/AssistantInline.tsx`
- Create: `demo/assistant/shortcuts.ts`
- Create: `demo/assistant/blocks/` (`Blocks.tsx`, `Table.tsx`, `Chart.tsx`, `Stat.tsx`, `Status.tsx`, `Draft.tsx`, `LinkCard.tsx`, `Location.tsx`, `scale.ts`)
- Create: `demo/assistant/assistant.css`
- Test: `demo/assistant/ui.test.ts`, `demo/site/site.test.ts` (add Fleet routes cases), `e2e/assistant.spec.ts`
- Modify: `playwright.config.ts` (mobile `testMatch` adds `assistant|fleet|hermes`)

**Interfaces:**
- Consumes: Tasks 4–5; `Link`, `navigate`, `useLocation`, `useScrollManagement` from `demo/site/router.tsx`; `ActivityRow`, `ActivitySummary`, `Answer`, `shownActivity` from `demo/chat-app`; `useDictation`; `AssistantOrb`, `StatusOrb` from `src/orbs`.
- Produces (`demo/fleet/routes.ts`, no React):
  - `FLEET_NAME = 'Fleetline'`, `FLEET_ROOT = '/fleet'`
  - `fleetPageMeta(path: string): { title: string; description: string } | null`. Titles are `<Page> · Fleetline`; the Overview is `Fleetline: fleet management with an always-on assistant`.
  - `FLEET_PATHS: string[]`: `/fleet`, `/fleet/vehicles`, every `/fleet/vehicles/<id>`, `/fleet/drivers`, every `/fleet/drivers/<id>`, `/fleet/trips`, `/fleet/maintenance`, `/fleet/fuel`, `/fleet/settings`. Ids come from `generateFleet(FLEET_SEED, new Date(0))`, because ids don't depend on `now`.
- Produces (`vite.config.ts`):
  - `interface SiteBuild { shell: string; paths: string[]; meta: (p: string) => PageMeta | null; notFoundTitle: string }`
  - `SITES: SiteBuild[]`: docs plus Fleet now; Hermes is added in Task 11
  - `build.rollupOptions.input` = `{ main: 'index.html', fleet: 'fleet/index.html' }`
  - `prerenderRoutes()` loops over `SITES`. Each site reads its own built shell (`dist/fleet/index.html`) and writes `dist/<path>/index.html` per path with `withMeta`.
  - `siteFallback(prefixes: string[])` is a plugin with `configureServer` and `configurePreviewServer` middleware. A `GET` whose `accept` includes `text/html`, whose path has no extension, and which starts with `base + 'fleet'` is rewritten to `base + 'fleet/index.html'`. The same goes for `hermes`.
  - `withMeta` stays exported unchanged.
- Produces (`App.tsx`): the Fleet layout:
  - a header with brand, nav (`Overview, Vehicles, Drivers, Trips, Maintenance, Fuel`) and `<AskBar/>`
  - `<main className="route">` switching on `useLocation().path`
  - `document.title` set from `fleetPageMeta`
  - all of it wrapped in `<AssistantProvider agent={fleetAgent} now={fleetNow}>`, with `<Dock/>` and `<Panel/>` outside `<main>`
  - Until Tasks 7–8, each known route renders a heading-only page (`<h1>` = the page name); Tasks 7–8 replace these.
- Produces (`shortcuts.ts`):
  - `isOpenShortcut(e: { key: string; metaKey: boolean; ctrlKey: boolean; target: { tagName?: string; isContentEditable?: boolean } | null }): boolean`: `/` only when the target isn't `INPUT`/`TEXTAREA`/`SELECT`/contenteditable; `k` with meta or ctrl anywhere.
  - `dockState(s: ConversationSnapshot): AssistantState`: the last reply's `working` → `'thinking'`, `writing` → `'speaking'`, `error` → `'error'`, otherwise `'idle'`.
- Produces (`blocks/scale.ts`): `niceTicks(max: number, count?: number /* 4 */): number[]`: ascending from 0, the last tick ≥ `max`, with step 1/2/5 × 10ⁿ. For `max <= 0` it returns `[0, 1]`.
- UI behavior (pinned):
  - **Dock:** a `<button aria-label="Open <agent.name>">` holding `AssistantOrb` at 56px with `state={dockState(...)}`, fixed bottom-right. The unread badge has `aria-label="New answer"`. It is hidden while `inline` is true.
  - **Panel:**
    - At ≥ 768px it's `<aside aria-label={agent.name}>`, 420px wide on the right, and not modal.
    - Below 768px it's `role="dialog" aria-modal="true" aria-label={agent.name}`, a bottom sheet at 85vh that traps focus.
    - Opening focuses the composer textarea. `Esc` closes and focus returns to the opener.
    - The header has `Expand` (toggles `data-expanded="true"`, a full-viewport panel for long conversations; the label becomes `Collapse`), `Clear conversation` and `Close`.
    - An empty thread shows `agent.greeting(user)` and `agent.suggestions(page, user)` as chips; clicking a chip sends it.
  - **Thread:** for each turn, the user bubble, `ActivityRow` while the reply is `working`, `ActivitySummary` once activities finish, `Answer`, then `<Blocks/>`. A stopped reply shows `Stopped.`. Text is announced via `aria-live="polite"` on the latest answer only.
  - **Composer:**
    - a textarea labelled `Ask <agent.name>`
    - attach (files/images through `useUploads`)
    - dictation via `useDictation`, hidden when `supported` is false
    - `Send`, which becomes `Stop` while busy
    - `Enter` sends and `Shift+Enter` adds a new line
  - **AskBar:** a header button `Ask AI` showing the `/` key hint. It opens the panel.
  - **Global key handler** (in `Panel.tsx`): `isOpenShortcut` → `preventDefault` + open.
  - **Blocks:**
    - `Table`: a real `<table>`; a row `href` renders the first cell as `<Link>`.
    - `Chart`: SVG bars/lines using `niceTicks`, with a visually hidden `<table>` with the same data, and `role="img"` + `aria-label` = caption.
    - `Stat`: a `<dl>`.
    - `Status`: a badge with text `On track` / `At risk` / `Off track`, plus reasons and `Sources: …`.
    - `Draft`: the channel, the body in `<pre>`, a `Copy` button (`navigator.clipboard.writeText`), and the label `Demo — not sent`.
    - `LinkCard` / `Location`: `<Link>` cards. Location's text is `Show <vehicleId> on the map`.
  - **AssistantInline:** renders `Thread` + `Composer` in-page, calling `setInline(true)` on mount and `false` on unmount. It's used by Hermes Home in Task 12.

- [ ] **Step 1: Write the failing unit tests.**
  - In `demo/assistant/ui.test.ts`:
    - `isOpenShortcut({ key: '/', target: { tagName: 'BODY' } })` → true
    - the same with `tagName: 'TEXTAREA'` or `'INPUT'`, or with `isContentEditable: true` → false (Review Focus 5)
    - `{ key: 'k', metaKey: true, target: { tagName: 'INPUT' } }` → true
    - `{ key: 'k', target: body }` → false
    - `dockState` maps each reply state
    - `niceTicks(87)` → `[0, 25, 50, 75, 100]`
    - `niceTicks(0)` → `[0, 1]` (Review Focus 3)
    - `niceTicks(3.2)` ends at ≥ 3.2
  - In `site.test.ts`:
    - every `FLEET_PATHS` entry has `fleetPageMeta`
    - `fleetPageMeta('/fleet/vehicles/TRK-14')!.title` contains `TRK-14`
    - `fleetPageMeta('/fleet/nope')` → null
    - `FLEET_PATHS` contains no duplicates
- [ ] **Step 2: Run** `npx vitest run`. Expected: FAIL.
- [ ] **Step 3: Implement** `routes.ts`, the Vite changes, the Fleet shell, and the shell UI files.
- [ ] **Step 4: Run** `npx vitest run && npm run build && ls dist/fleet/vehicles/TRK-14/index.html`. Expected: PASS and the file exists.
- [ ] **Step 5: Write the e2e tests** in `e2e/assistant.spec.ts` on `/fleet/`:
  - Click `Open Fleet Assistant` → the composer is focused; `Esc` closes and focus is back on the dock.
  - `/` on the page body opens the panel. Typing `/` inside the composer leaves the panel open and the textarea value ends with `/`. `Control+K` also opens it.
  - Asking `Which vehicles are due for service?` shows a table whose rows include `TRK-03`.
  - **Persistence:** ask `Which vehicles are due for service?`, click nav `Vehicles` right away, then expect the table to appear in the panel; the URL is `/fleet/vehicles` and the turn is still there.
  - **Second question mid-stream:** ask `Fuel spend this month vs last?`, then immediately ask `Any open alerts?` → the first turn shows `Stopped.` and the second shows a table.
  - **Mobile (Pixel 7 project only):** the panel has `role="dialog"`, and `scrollWidth` ≤ viewport width.
- [ ] **Step 6: Run** `npx playwright test e2e/assistant.spec.ts`. Expected: PASS on desktop and mobile.
- [ ] **Step 7: Run the full suite** `npm run test:all`. Expected: PASS; the existing docs e2e is unaffected.
- [ ] **Step 8: Commit** `git commit -m "Build Fleet as its own entry and add the assistant dock, panel and answer blocks"`

---

### Task 7: Fleet Overview and live map

**Files:**
- Create: `demo/fleet/pages/Overview.tsx`
- Create: `demo/fleet/map/CityMap.tsx`
- Create: `demo/fleet/useFleetNow.ts`
- Modify: `demo/fleet/App.tsx` (route `/fleet` → `Overview`)
- Modify: `demo/fleet/fleet.css`
- Test: `e2e/fleet.spec.ts` (new; extended in Task 8)

**Interfaces:**
- Consumes: `FLEET`, `fleetNow` (Task 4); `derive.ts`, `ROUTES`, `DEPOTS`, `pointAt` (Task 3); `usePageContext` (Task 5); `useLocation` from the router.
- Produces:
  - `useFleetNow(every = 1000): Date`: re-renders on an interval with `fleetNow()`.
  - `<CityMap now={Date} highlight?: string onSelect?: (vehicleId: string) => void />`:
    - an SVG with `viewBox="0 0 1000 640"`, roads from `ROUTES`, and depots
    - one `<g data-vehicle={id} data-highlighted={bool}>` per on-trip vehicle at `pointAt(route, progress)`
    - `progress = clamp((now − start) / (tripEnd − start), 0, 0.98)`
    - in-shop and idle vehicles parked at their depot
    - a vehicle `<title>` with id and status
    - under reduced motion, vehicles get no CSS transition
  - **Overview:**
    - `<h1>Overview</h1>`
    - KPI `<dl>`: `Active vehicles`, `On a trip`, `In the shop`, `Open alerts`
    - the map
    - an `Alerts` list linking to vehicles
  - Reading `?vehicle=<id>` highlights that vehicle and shows a caption `Showing <id>: <status>` in an `aria-live` region.
  - Page context: `{ page: 'overview', title: 'Overview', data: { kpis, alerts: alerts.length } }`.

- [ ] **Step 1: Write the failing e2e tests** in `e2e/fleet.spec.ts`:
  - `/fleet/?vehicle=TRK-14` → `[data-vehicle="TRK-14"][data-highlighted="true"]` is visible and the caption text starts `Showing TRK-14`
  - the four KPI labels are visible
  - the `On a trip` value equals the number of `[data-vehicle]` groups not parked at a depot (expose `data-parked="true"` on parked groups)
- [ ] **Step 2: Run** `npx playwright test e2e/fleet.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `useFleetNow`, `CityMap` and `Overview`.
- [ ] **Step 4: Run** `npx playwright test e2e/fleet.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the Fleet overview with KPIs, alerts and a live city map"`

---

### Task 8: Fleet list/detail pages, settings, and the Fleet end-to-end suite

**Files:**
- Create: `demo/fleet/pages/Vehicles.tsx`, `Vehicle.tsx`, `Drivers.tsx`, `Driver.tsx`, `Trips.tsx`, `Maintenance.tsx`, `Fuel.tsx`, `Settings.tsx`
- Modify: `demo/fleet/App.tsx` (routes; unknown ids → `NotFound`)
- Modify: `demo/fleet/fleet.css`
- Test: `e2e/fleet.spec.ts`

**Interfaces:**
- Consumes: Tasks 3–7; `Chart` and `Table` from `demo/assistant/blocks` (pages reuse the block renderers for their own charts and tables); `setDown` and `useDown` (Task 2); `setSpeed` and `useFleetSpeed` (Task 4).
- Produces (each page has exactly one `<h1>` and registers page context):

| Page | h1 | Page context | Content |
|---|---|---|---|
| Vehicles | `Vehicles` | `{ page: 'vehicles', title, data: { filters, ids } }` | `<select>` filters `Type`, `Status`, `Depot` kept in the query string; table linking to each vehicle |
| Vehicle | the vehicle id + name | `{ page: 'vehicle', id, title: id, data: vehicle+maintenance+trip }` | status, fuel %, odometer, current trip with ETA, service history table, maintenance state |
| Drivers / Driver | `Drivers` / the driver name | `drivers` / `{ page: 'driver', id }` | 7-day safety score, idle minutes, assigned vehicle, recent trips |
| Trips | `Trips` | `trips` | active trips first with ETA and delay reason, then the last 50 completed |
| Maintenance | `Maintenance` | `maintenance` | overdue, due soon and in-shop sections |
| Fuel | `Fuel & costs` | `{ page: 'fuel', data: { range } }` | weekly spend bar chart (last 8 weeks), table per vehicle with L/100 km |
| Settings | `Settings` | `settings` | checkbox `Flaky telematics` → `setDown('Fleet', checked)`; radio group `Simulation speed` 1× / 5× / 20× |

- [ ] **Step 1: Extend the failing e2e tests** in `e2e/fleet.spec.ts`:
  - **Smoke loop over `FLEET_PATHS`:** title equals `fleetPageMeta(path).title`, exactly one visible `h1`, no horizontal overflow, and no serious/critical axe violations on `main` and `header` (excluding `canvas` and `svg`). The `errors` fixture covers console errors.
  - `/fleet/nope` and `/fleet/vehicles/TRK-99` show the Fleet not-found page with the Fleet nav and the dock.
  - **Headline:**
    1. Ask `Why is VAN-12 late?` → the answer mentions `traffic`.
    2. Click `Show VAN-12 on the map` → the URL is `/fleet/?vehicle=VAN-12` and the vehicle is highlighted.
    3. The panel is still open with the turn.
  - **Off-topic:** `How many hours did developers work this week?` → the answer starts `That's outside what I can help with.`
  - **Page context:** on `/fleet/vehicles/TRK-03`, the chip `Anything wrong with this one?` → the answer contains `overdue`.
  - **Flaky:**
    1. On `/fleet/settings`, check `Flaky telematics`.
    2. Ask `Any open alerts?` → the answer contains `didn't respond`.
    3. Uncheck it; asking again shows a table.
- [ ] **Step 2: Run** `npx playwright test e2e/fleet.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the pages and routes.
- [ ] **Step 4: Run** `npx playwright test e2e/fleet.spec.ts e2e/assistant.spec.ts`. Expected: PASS on desktop and mobile.
- [ ] **Step 5: Commit** `git commit -m "Add the Fleet vehicles, drivers, trips, maintenance, fuel and settings pages"`

---

### Task 9: Hermes company data generator

**Files:**
- Create: `demo/hermes/config.ts`
- Create: `demo/hermes/data/types.ts`
- Create: `demo/hermes/data/generate.ts`
- Create: `demo/hermes/data/derive.ts`
- Test: `demo/hermes/data/hermes-data.test.ts`

**Interfaces:**
- Consumes: `seeded`, `int`, `pick`, `parseRange` (Task 1).
- Produces (`config.ts`): `COMPANY_NAME = 'Brightline Labs'`, `HERMES_NAME = 'Hermes'`, `HERMES_ROOT = '/hermes'`, `HERMES_SEED = 11`, `SPRINT_DAYS = 14`.
- Produces (`types.ts`):
  - `Person { id; name; title; role: Role; team: 'Platform' | 'Product' | 'Leadership'; capacityHours: number /* weekly */ }`
  - `Project { id: 'atlas' | 'beacon' | 'comet' | 'delta'; name; team; budgetHours; start: number; target: number; repo }`
  - `TimeEntry { personId; projectId; at: number; hours; description }`
  - `Sprint { id; projectId; start; end; committedPoints; completedPoints }`
  - `Issue { key: string /* ATL-12 */; projectId; title; status: 'todo' | 'in-progress' | 'in-review' | 'done'; assigneeId; points; blocked?: string; created; resolved? }`
  - `PullRequest { id: number; repo; projectId; title; authorId; reviewerIds: string[]; opened; firstReviewAt?; merged? }`
  - `Commit { sha; repo; authorId; at; message }`
  - `Message { id; channel: '#backend' | '#product' | '#general'; authorId; at; text }`
  - `Meeting { id; kind: 'standup' | 'planning'; team; at; decisions: string[]; actions: { ownerId: string; text: string }[] }`
  - `AwsCost { month: string /* YYYY-MM */; service: 'EC2' | 'RDS' | 'S3' | 'Lambda' | 'CloudFront'; usd }`
  - `AwsHealth { service; status: 'healthy' | 'degraded'; lastDeployAt; note? }`
  - `Company { people; projects; time; sprints; issues; prs; commits; messages; meetings; awsCosts; awsHealth }`
- Produces (`generate.ts`): `generateCompany(seed: number, now: Date): Company`.
  - **People:** 14 in total, including the three demo users:
    - `p-maya` Maya Chen, CTO, `leadership`, Leadership
    - `p-daniel` Daniel Okafor, Engineering Manager, `manager`, Platform
    - `p-sara` Sara Lindqvist, Developer, `developer`, Platform
  - `p-priya` Priya Nair manages Product. The rest are developers, QA, a designer and a PM spread across Platform (6 incl. Daniel) and Product (6 incl. Priya), with Leadership at 2.
  - **Projects:** Atlas (Platform), Delta (Platform), Beacon (Product), Comet (Product).
  - Six weeks of Clockify, Jira, GitHub and Teams data before `now`, and six months of AWS costs.
  - **Planted:**
    - Atlas has exactly 3 open blocked issues, and one open PR with no review for 4 days.
    - Comet's remaining points ÷ the average completed points of its last 3 sprints puts the projected finish after its target.
    - Beacon and Delta are on track.
    - The latest full month's EC2 cost is ≥ 40% above the month before, and `awsHealth` EC2 has `note: 'Comet load tests left 12 extra instances running'`.
    - Yesterday's Platform standup has ≥ 2 decisions.
    - In the current week-to-date, `p-sara`'s hours are below 70% of pro-rated capacity, and Platform developer `p-leo` is above 110%.
    - `#backend` has ≥ 6 messages this week.
- Produces (`derive.ts`):
  - `proRatedCapacity(person, now): number`: capacity × (elapsed weekdays this week, counting today as a fraction of 8 h from 09:00) ÷ 5
  - `loadState(hours, capacity): 'over' | 'under' | 'ok'`: over > 1.1, under < 0.7; `capacity === 0` → `'ok'`
  - `velocity(projectId, sprints): number`: the average completed points of the last 3 finished sprints, or 0 if there are none
  - `projectStatus(project, c: Company, now): { status: 'on-track' | 'at-risk' | 'off-track'; reasons: string[] }`:
    - **off-track** if `velocity === 0` and points remain, or `now + ceil(remaining / velocity) × SPRINT_DAYS` days > `target`
    - else **at-risk** if > 2 open blocked issues, or any open PR without a review for > 3 days
    - else **on-track**
    - `reasons` are human sentences, e.g. `3 blocked tickets`, `1 PR waiting more than 3 days for review`, `Projected to finish 2 weeks after the target date`

- [ ] **Step 1: Write the failing tests** with `const NOW = new Date('2026-10-07T15:00:00')`:
  - deterministic deep-equal, and no `Math.random` calls
  - there are 14 people and the three demo users exist with their roles and teams
  - the `projectStatus` statuses are Atlas `at-risk` (reasons include `3 blocked tickets`), Comet `off-track`, Beacon and Delta `on-track`
  - the EC2 spike is ≥ 40%
  - `loadState` is `under` for `p-sara` and `over` for `p-leo` over this week's entries
  - `loadState(0, 0)` → `'ok'` (Review Focus 3)
  - `velocity` with no sprints → 0
- [ ] **Step 2: Run** `npx vitest run demo/hermes`. Expected: FAIL.
- [ ] **Step 3: Implement** the four modules.
- [ ] **Step 4: Run** `npx vitest run demo/hermes`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the seeded Hermes company data: people, hours, Jira, GitHub, Teams and AWS"`

---

### Task 10: Hermes auth, role policy and tools

**Files:**
- Create: `demo/hermes/auth.ts`
- Create: `demo/hermes/policy.ts`
- Create: `demo/hermes/agent/tools.ts`
- Create: `demo/hermes/store.ts`
- Test: `demo/hermes/policy.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 9.
- Produces (`store.ts`): `COMPANY: Company` (generated at load with `now` rounded to the minute) and `hermesNow(): Date`.
- Produces (`auth.ts`):
  - `DEMO_USERS: User[]` (Maya, Daniel, Sara from `COMPANY.people`)
  - `getUser(): User | null`
  - `signIn(id: string): void`
  - `signOut(): void`
  - `useUser(): User | null` (external store)
  - `guard(path: string, user: User | null): string | null`: returns `/hermes/sign-in?next=<encodeURIComponent(path)>` when there's no user and `path !== '/hermes/sign-in'`, else `null`
  - `safeNext(next: string | null): string`: only paths starting `/hermes/` (no `//`, no scheme) pass; anything else gives `/hermes/`
- Produces (`tools.ts`): `hermesTools(data: () => Company): Tool[]`:

  | id | system | label | input → output |
  |---|---|---|---|
  | `directory.people` | Directory | `Looking up people` | `{ team?: string }` → `Person[]` |
  | `directory.projects` | Directory | `Looking up projects` | `{ id?: string }` → `(Project & { budgetHours?: number })[]` |
  | `clockify.timeEntries` | Clockify | `Reading Clockify` | `{ from: number; to: number; personId?: string; projectId?: string }` → `TimeReport { entries: TimeEntry[]; teamTotals: { team: string; hours: number }[] }` |
  | `jira.issues` | Jira | `Reading Jira issues` | `{ projectId?; assigneeId?; open?: boolean; blocked?: boolean }` → `Issue[]` |
  | `jira.sprints` | Jira | `Reading Jira sprints` | `{ projectId? }` → `Sprint[]` |
  | `github.pullRequests` | GitHub | `Reading pull requests` | `{ projectId?; open?: boolean }` → `PullRequest[]` |
  | `github.commits` | GitHub | `Reading commits` | `{ from; to; projectId? }` → `Commit[]` |
  | `teams.messages` | Teams | `Reading Teams messages` | `{ channel?; from; to }` → `Message[]` |
  | `teams.meetings` | Teams | `Reading meeting notes` | `{ kind?; from; to; team? }` → `Meeting[]` |
  | `aws.costs` | AWS | `Reading AWS costs` | `{ months: number }` → `AwsCost[]` |
  | `aws.health` | AWS | `Checking AWS health` | `{}` → `AwsHealth[]` |

- Produces (`policy.ts`): `hermesPolicy: Policy`, plus `visibleProjectIds(user, c): Set<string>`, which pages reuse.
  - **`before`:** `aws.costs` is denied unless the role is `leadership`, with `{ reason: 'AWS costs are visible to leadership.', alternative: 'I can show AWS service health instead.' }`. With no user, every tool is denied with `Sign in to use Hermes.`
  - **`after`:**
    - **Developer:**
      - `directory.projects` → only own-team projects, with `budgetHours` removed
      - `jira.*`, `github.*`, `clockify.*` → filtered to visible projects
      - `clockify.timeEntries` → entries with `personId === user.id`, plus `teamTotals` for the user's team, and `restricted` = the exact Developer copy
    - **Manager:** `clockify.timeEntries` → own-team entries individually, other teams as `teamTotals`, `restricted: 'Individual hours outside your team are visible to leadership. Other teams are shown as totals.'`
    - **Leadership:** unchanged, with `teamTotals` computed for every team.
    - Every role gets `teamTotals` computed from the *unfiltered* entries within the visible projects.

- [ ] **Step 1: Write the failing tests** using `queryTool` with the agent stub `{ tools: hermesTools(() => c), policy: hermesPolicy }` and NOW from Task 9:
  - **as Sara:**
    - every `clockify.timeEntries` entry has `personId === 'p-sara'`
    - `teamTotals` has exactly one entry, `Platform`, and its hours ≥ her own sum
    - `restricted` equals the exact copy
    - `directory.projects` ids ⊆ {atlas, delta} and none has `budgetHours`
    - `jira.issues` all belong to atlas/delta
    - `aws.costs` → `reason: 'denied'`
  - **as Daniel:** entries all belong to Platform people, `teamTotals` includes `Product`, and `aws.costs` is denied
  - **as Maya:** entries include Product people and `aws.costs` is ok
  - **signed out:** `jira.issues` is denied
  - `guard('/hermes/team', null)` → `/hermes/sign-in?next=%2Fhermes%2Fteam`; `guard('/hermes/sign-in', null)` → null
  - `safeNext('https://evil.test')`, `safeNext('//evil.test')` and `safeNext(null)` → `/hermes/`; `safeNext('/hermes/projects/atlas')` passes through
  - `signIn` works when `sessionStorage` throws: stub `globalThis.sessionStorage` with throwing methods, then `getUser()` returns the user from memory
- [ ] **Step 2: Run** `npx vitest run demo/hermes`. Expected: FAIL.
- [ ] **Step 3: Implement** `store.ts`, `auth.ts`, `tools.ts` and `policy.ts`.
- [ ] **Step 4: Run** `npx vitest run demo/hermes`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add Hermes demo sign-in, role policy and connectors as tools"`

---

### Task 11: Hermes intents and agent

**Files:**
- Create: `demo/hermes/agent/intents.ts`
- Create: `demo/hermes/agent/definition.ts`
- Test: `demo/hermes/agent/hermes-agent.test.ts`

**Interfaces:**
- Consumes: `createBrain`, `say`, `Intent` (Task 4); `runBrain` (Task 4); Tasks 9–10.
- Produces (`intents.ts`): `projectIn(text: string, projects: Project[]): Project | null` (by name, case-insensitive), and `HERMES_INTENTS: Intent[]` in this order:
  - `this-project` (project page + "this"/"it")
  - `my-tickets`
  - `my-hours`
  - `dev-hours` ("hours" + developers/team/everyone)
  - `team-health` ("how is the team")
  - `project-blockers` (blocking/blocked + a project)
  - `project-status` ("projects going"/"project status")
  - `meeting-decisions` (decide/decided/standup/meeting)
  - `channel-summary` (`#channel` or "summarize")
  - `aws-costs` (aws + cost(s)/spend/bill)
  - `status-draft` (write/draft + update/status)
- Every answer ends with a `Sources: <systems>` line built from the tools that returned `ok`. When a result has `restricted`, that text is said before the numbers. When a result is `failed`, the answer adds `<System> didn't respond, so <what> isn't included.`
- Answer shapes (spec §4.6):
  - `team-health` → `stat` (`Hours vs capacity`, `PRs merged`, `Tickets closed`) + a table of people who are over or under capacity (only individuals the role can see) + blockers as text
  - `dev-hours` → a table (columns `person, hours, capacity`; or for a Developer, columns `who, hours` with rows `You` and `<team> team total`) + a `bar` chart this week vs last week
  - `project-status` → one `status` block per visible project with `href: /hermes/projects/<id>`
  - `project-blockers` → a table of blocked issues + stale PRs + matching `#backend`/`#product` messages
  - `meeting-decisions` → bullet text with decisions and action owners
  - `channel-summary` → text summary + up to 3 key messages
  - `aws-costs` → for Leadership, a `line` chart of 6 months per service plus the EC2 note; otherwise the denial reason plus `aws.health` as a table
  - `my-tickets` / `my-hours` → use `ctx.user`
  - `status-draft` → a `draft` block (`channel: 'teams'`) whose body includes the real numbers from `team-health`
  - **no match** → `I'm not sure what you're asking. Try one of these:` followed by the suggestions (Hermes has no out-of-scope decline)
- Produces (`definition.ts`): `hermesAgent: AgentDefinition`:
  - `id: 'hermes'`, `name: 'Hermes'`, `scope: 'Company systems: people, hours, projects, code, conversations and cloud.'`
  - `tools: hermesTools(() => COMPANY)`, `policy: hermesPolicy`
  - `greeting(user)`: `Hi <first name>. Ask me about the team, hours, projects, code, Teams or AWS.`
  - `suggestions(page, user)`: role-aware; Leadership gets `Why did AWS costs go up?`

- [ ] **Step 1: Write the failing tests** with NOW from Task 9, using `runBrain(hermesAgent-like def, q, { now, user })`:
  - **Maya, `How many hours did developers work this week?`:** the table has one row per developer, and the row hours sum to the summed Clockify developer entries for the range. A chart block exists.
  - **Sara, the same question:** the text contains the exact Developer copy, and the table rows are exactly `You` and `Platform team total`.
  - **Every-role leak check:** for every question in spec §4.6 asked as Sara, every `received` `TimeReport` entry has `personId === 'p-sara'` and no `received` project has `budgetHours`.
  - **`How are the projects going?`:**
    - as Maya → 4 `status` blocks with statuses atlas `at-risk`, comet `off-track`, beacon and delta `on-track`
    - as Sara → 2 blocks (atlas, delta)
  - **`What's blocking Atlas?`** → the table has 3 blocked issues and the text mentions the waiting PR.
  - **`Why did AWS costs go up?`:** as Maya → a `line` chart and the text contains `12 extra instances`; as Daniel → the text contains `AWS costs are visible to leadership.` and a health table.
  - **`What did we decide in yesterday's standup?`** as Daniel → the text contains each planted decision.
  - **`Write a status update for the team`** → a `draft` block with `channel: 'teams'`.
  - **`How is the team doing?` with `setDown('Jira', true)`** → the text contains `Jira didn't respond` (reset in `afterEach`).
  - **Monday 00:30 `How many hours did developers work this week?`** as Maya → no `NaN`/`Infinity` in text or blocks, and every hours value is 0 (Review Focus 3).
  - **`Tell me a joke`** → the text starts `I'm not sure what you're asking.`
- [ ] **Step 2: Run** `npx vitest run demo/hermes`. Expected: FAIL.
- [ ] **Step 3: Implement** `intents.ts` and `definition.ts`.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the Hermes agent: cross-system intents with role-aware answers"`

---

### Task 12: Hermes site: entry, sign-in, layout and pages

**Files:**
- Create: `hermes/index.html`
- Create: `demo/hermes/routes.ts`
- Create: `demo/hermes/main.tsx`
- Create: `demo/hermes/App.tsx`
- Create: `demo/hermes/hermes.css`
- Create: `demo/hermes/pages/SignIn.tsx`, `Home.tsx`, `Team.tsx`, `Projects.tsx`, `Project.tsx`, `Connections.tsx`, `NotFound.tsx`
- Create: `demo/hermes/UserMenu.tsx`
- Modify: `vite.config.ts` (add the `hermes` input, the `SITES` entry and the `siteFallback` prefix)
- Modify: `demo/site/site.test.ts` (Hermes routes cases)

**Interfaces:**
- Consumes: Tasks 5, 6 (shell incl. `AssistantInline`), 10, 11; `queryTool`, `useDown`, `setDown` (Task 2).
- Produces (`routes.ts`):
  - `hermesPageMeta(path)` with titles `<Page> · Hermes`; Home is `Hermes: ask anything about ${COMPANY_NAME}`
  - `HERMES_PATHS`: `/hermes`, `/hermes/sign-in`, `/hermes/team`, `/hermes/projects`, the four `/hermes/projects/<id>`, `/hermes/connections`
- Produces (`App.tsx`):
  - When `guard(path, user)` returns a value, it calls `navigate(value, { replace: true })` and renders nothing.
  - Sign-in renders without the assistant.
  - Every other page is wrapped in `<AssistantProvider agent={hermesAgent} user={user} now={hermesNow}>`, which recreates the conversation on a user change (Task 5).
  - The header has brand, nav (`Home, Team, Projects, Connections`), `<AskBar/>` and `<UserMenu/>`.
- Produces (`UserMenu.tsx`):
  - a button with the user's name and title
  - a menu with `Switch demo user` (one item per other demo user → `signIn(id)`) and `Sign out`
  - The text `Demo user` is visible.
- Pages (one `<h1>` each; data comes through `queryTool(hermesAgent, …, { user, now })`, so pages obey the same policy):

| Page | h1 | Content |
|---|---|---|
| SignIn | `Sign in to Hermes` | Text: `This is a demo. Pick a sample employee to sign in as — no password needed.`; one button per `DEMO_USERS` entry (name, title, role); after sign-in, `navigate(safeNext(next))` |
| Home | `Good morning/afternoon/evening, <first name>` (by `hermesNow()` hour: <12, <18, else) | `Today at a glance` `<dl>` (hours logged this week, PRs merged, tickets closed, open blockers — per policy); `<AssistantInline/>`; `Recent conversations` list from `snapshot.archive` with a `restore` button per item (hidden when empty) |
| Team | `Team` | per visible person: hours this week vs pro-rated capacity with the load state; a Developer sees only themselves plus the team total row |
| Projects | `Projects` | a card per visible project with the `projectStatus` badge, linking to detail |
| Project | the project name | sprint progress, blocked issues, open PRs with review wait, recent decisions from meetings, hours (and budget when visible); page context `{ page: 'project', id, title }` |
| Connections | `Connections` | one row per system (Directory, Clockify, Jira, GitHub, Teams, AWS): `Connected`, last sync (= `hermesNow()` minus 2–9 min, seeded), "what Hermes can read", checkbox `Simulate an outage` → `setDown(system, checked)`; plus three disabled `Add an app` placeholders (Slack, Google Drive, Salesforce) labelled `Coming later` |

- [ ] **Step 1: Write the failing unit tests** in `site.test.ts`: every `HERMES_PATHS` entry has meta, `hermesPageMeta('/hermes/projects/atlas')!.title` contains `Atlas`, and an unknown path → null.
- [ ] **Step 2: Run** `npx vitest run demo/site`. Expected: FAIL.
- [ ] **Step 3: Implement** the entry, routes, Vite changes, App, UserMenu and pages.
- [ ] **Step 4: Run** `npx vitest run && npm run build && ls dist/hermes/projects/atlas/index.html`. Expected: PASS and the file exists.
- [ ] **Step 5: Commit** `git commit -m "Add the Hermes site: demo sign-in, home, team, projects and connections"`

---

### Task 13: Hermes end-to-end suite and bundle isolation

**Files:**
- Create: `e2e/hermes.spec.ts`
- Create: `e2e/bundles.spec.ts`

**Interfaces:**
- Consumes: `HERMES_PATHS`, `hermesPageMeta` (Task 12); `FLEET_PATHS` (Task 6); the `test` fixture from `e2e/fixtures.ts`.
- Produces: a helper `signInAs(page, id)` = `page.addInitScript((id) => sessionStorage.setItem('hermes.user', id), id)`. Use the same value format that `auth.ts` writes; if `auth.ts` stores JSON, store the same JSON.

- [ ] **Step 1: Write the e2e tests** in `e2e/hermes.spec.ts`:
  - signed out, `/hermes/team` → the URL becomes `/hermes/sign-in?next=%2Fhermes%2Fteam`; clicking `Daniel Okafor` → the URL becomes `/hermes/team`
  - **smoke loop over `HERMES_PATHS`** signed in as `p-maya`: title, one `h1`, no overflow, no serious axe violations
  - **Home:** the inline assistant is visible and the dock is not; ask `How are the projects going?` → 4 status badges (`At risk` ×1, `Off track` ×1, `On track` ×2)
  - **role difference:**
    1. As Maya, ask `How many hours did developers work this week?` → the table has > 2 rows.
    2. Switch the demo user to Sara through the user menu → the thread is empty.
    3. Ask again → the exact Developer copy is visible and the table has rows `You` and `Platform team total`.
  - **mid-reply switch** (Review Focus 4): as Maya, ask `How is the team doing?`, switch to Sara before it finishes → no Maya-era turn or table ever appears. Poll for 3 s and expect the thread to stay empty.
  - **draft:** `Write a status update for the team` → `Demo — not sent` is visible, and `Copy` puts text containing `Platform` on the clipboard
  - **outage:** on `/hermes/connections`, check `Simulate an outage` for Jira, then ask `How is the team doing?` → `Jira didn't respond`
  - **`/hermes/projects/nope`** → the Hermes not-found page
- [ ] **Step 2: Write `e2e/bundles.spec.ts`.** It's a Node-only test with no `page`. It reads `dist/fleet/index.html` and walks every chunk reachable through `<script src>`, `import … from "./x.js"` and `import("./x.js")`.
  - Assert no Fleet chunk contains `Brightline`, `clockify` or `p-maya`.
  - Do the same from `dist/hermes/index.html` and assert no Hermes chunk contains `VAN-12`, `Fleetline` or `fleet.trips`.
- [ ] **Step 3: Run** `npx playwright test e2e/hermes.spec.ts e2e/bundles.spec.ts`. Expected: PASS. Fix any failures in the owning task's files.
- [ ] **Step 4: Run the full suite** `npm run test:all`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add browser tests for Hermes and check that each site's bundle stays separate"`

---

### Task 14: Hands-free voice mode

**Files:**
- Create: `demo/assistant/voice.ts`
- Create: `demo/assistant/VoiceMode.tsx`
- Modify: `demo/assistant/Composer.tsx` (a `Voice mode` button)
- Modify: `demo/assistant/Panel.tsx` (shows `VoiceMode` while it's active)
- Modify: `demo/assistant/assistant.css`
- Test: `demo/assistant/conversation.test.ts`, `e2e/assistant.spec.ts`

**Interfaces:**
- Consumes: `Conversation`, `speakable` (Task 5); `useVoiceAssistant` from `demo/voice-assistant/useVoiceAssistant.ts`; `AssistantOrb`.
- Produces (`voice.ts`): `voiceResponder(c: Conversation): (text: string, signal: AbortSignal) => Promise<string>`. It calls `c.send(text)`, calls `c.stop()` when `signal` aborts, and resolves to `speakable(reply)`. For a `null` reply or a stopped one it resolves to `''`.
- Produces (`VoiceMode.tsx`):
  - `useVoiceAssistant({ respond: voiceResponder(conversation) })` driving an `AssistantOrb` (120px) in the panel header with its `state` and `stream`
  - a caption of what was heard
  - an `End voice mode` button
- Answers still render as turns in the thread, blocks included.
- The `Voice mode` button is rendered only when both `support.recognition` and `support.synthesis` are true. Typing always works.

- [ ] **Step 1: Write the failing tests:**
  - **unit:** `voiceResponder(c)('hi', signal)` resolves to the reply's speakable text, and aborting the signal during the fake brain's `slow` answer resolves to `''` with the turn `stopped`
  - **e2e:** in headless Chromium, which has no speech recognition, the `Voice mode` and dictation buttons are absent and asking by typing still works
- [ ] **Step 2: Run** `npx vitest run demo/assistant && npx playwright test e2e/assistant.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `voice.ts`, `VoiceMode.tsx` and the Composer/Panel changes.
- [ ] **Step 4: Run** `npm run test:all`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add a hands-free voice mode to the assistant"`

---

### Task 15: Link the sites from the docs and document them

**Precondition:** `git status --short demo/site README.md` must be empty. These files hold the user's uncommitted `site-pages` work. **If they are not clean, stop and ask the user** to commit or stash first. Do not commit their changes.

**Files:**
- Modify: `demo/site/routes.ts` (an `EXAMPLES`-adjacent `SITE_LINKS: { name; summary; href: '/fleet/' | '/hermes/'; tint }[]`)
- Modify: `demo/site/pages/Examples.tsx` (a `Full sites` section rendering `SITE_LINKS` as plain `<a href={href(link.href)}>` cards, since these leave the docs app)
- Modify: `README.md` (a new `## AI-native sites` section after `## Demo & development`)
- Test: `demo/site/site.test.ts`, `e2e/examples.spec.ts`

**Interfaces:**
- Consumes: `href` from the router.
- README section content:
  1. one paragraph each on Fleet and Hermes
  2. `npm run dev` → `http://localhost:5318/fleet/` and `/hermes/`
  3. the three layers
  4. how to plug in a real model (replace `brain` with a server that streams `AssistantEvent`s), real connectors (implement `Tool.run` server-side), a real policy and auth (spec §9)
  5. the reminder that the demo data is generated and Hermes is read-only

- [ ] **Step 1: Write the failing tests:**
  - `SITE_LINKS` hrefs are `/fleet/` and `/hermes/`
  - in `e2e/examples.spec.ts`, on `/examples` clicking `Fleet` navigates to `/fleet/` with title `fleetPageMeta('/fleet')!.title`
- [ ] **Step 2: Run** `npx vitest run demo/site && npx playwright test e2e/examples.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the links and the README section.
- [ ] **Step 4: Run** `npm run test:all`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Link the Fleet and Hermes sites from the docs and document them"`
