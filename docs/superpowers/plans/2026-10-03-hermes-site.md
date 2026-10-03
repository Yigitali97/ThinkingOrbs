# Hermes AI-native Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Hermes site (`/hermes/`) in this repo. It is the company portal where verified (demo) users ask Hermes anything about people, hours, projects, code, Teams and AWS, through an always-on assistant that:
- keeps its conversation across pages and knows the current page
- answers from seeded sample data with text plus rich blocks
- applies role-based visibility

**Architecture:** There are three layers.
- `demo/assistant/` is a site-agnostic shell: the protocol, the conversation store, the tool caller with a policy hook, the brain runner, and the dock/panel/composer/blocks UI.
- `demo/hermes/` provides the `AgentDefinition` (tools for each connected system, intents, brain, role policy), the demo sign-in, pages and the seeded company data.
- The ThinkingOrbs components and the chat sample's reply model sit underneath and are reused, not forked.

Vite builds two HTML entries (`index.html` for the docs, `hermes/index.html`), and the prerender plugin writes one file per route for both. Fleet is deferred (see the spec's scope update), and the shell is kept generic so it can be added later.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Vitest 2 (node environment), Playwright 1.63 with `@axe-core/playwright`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-ai-native-sites-design.md` (§1, §2, §4–§9; §3 Fleet is deferred)

## Global Constraints

- No new runtime or dev dependencies. Charts are inline SVG; routing reuses `demo/site/router.tsx`.
- Everything works offline with no API key and makes no network requests beyond the site's own assets.
- `demo/assistant/**` never imports from `demo/hermes/**`. Hermes may import from `demo/assistant`, `demo/chat-app`, `demo/voice-assistant`, `demo/site/router.tsx` and `src/orbs`.
- Data is deterministic: generators take `(seed, now)` and use only `seeded(seed)` from `demo/assistant/random.ts`, never `Math.random()`.
- Hermes is read-only. Draft blocks carry the exact label `Demo — not sent`.
- Developer restriction copy (exact): `Individual hours for other people are visible to managers. Here's your team's total instead.`
- Manager restriction copy (exact): `Individual hours outside your team are visible to leadership. Other teams are shown as totals.`
- AWS denial (exact): reason `AWS costs are visible to leadership.`, alternative `I can show AWS service health instead.`
- Sign-in storage key: `hermes.user` in `sessionStorage`. Every access is wrapped in try/catch and falls back to memory.
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
- Deliberate trims from spec §2.1, because nothing in this round uses them:
  - `BrainContext` has no `history`.
  - There is no `location` block (Fleet-only).
  - `createBrain` has no out-of-scope decline (Hermes's scope is all company systems).

## Review Focus

1. **A second question while the first is still streaming.** The first reply ends as `stopped` with its partial text kept, then the second runs to `done`. No interleaved text and no stuck `busy`. → Tasks 6 and 8.
2. **Project names typed loosely, unknown, or not visible to the role.** `atlas`, `ATLAS` and `Atlas's` all resolve to Atlas. `Zephyr` gets `I can't find a project called Zephyr.` For Sara (Platform developer), `Beacon` gets `Beacon isn't one of the projects you can see. Your projects: Atlas, Delta.` with no Beacon data in what the brain received. → Task 5.
3. **Empty or zero ranges.** On Monday 00:30 "this week" has no hours, and the previous period can be 0. Answers show 0 and "no change data", never `NaN`, `Infinity` or a chart that throws. → Tasks 1, 3, 5 and 8.
4. **Switching the demo user mid-reply.** The running reply is aborted and the old conversation is gone. Nothing computed for Leadership ever renders in the Developer's session. → Tasks 6 and 10.
5. **The `/` shortcut while typing.** Pressing `/` in the composer or any page input types a slash and doesn't open or steal focus. `⌘K`/`Ctrl+K` still opens from inside inputs. → Task 8.

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
    | { kind: 'link'; label: string; href: string };
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
    id: string; name: string; scope: string; tools: Tool[]; brain: Brain;
    greeting(user?: User): string; suggestions(page: PageContext, user?: User): string[]; policy?: Policy;
  }
  ```
- Produces (`reply.ts`):
  - `type AssistantReply = Reply & { blocks: Block[] }`
  - `createAssistantReply(id: string, now: number): AssistantReply`
  - `applyAssistantEvent(r: AssistantReply, e: AssistantEvent, now: number): AssistantReply`: `block` appends to `blocks` (and sets `firstTextAt` and state `writing` if they are unset); anything else delegates to `applyEvent` and keeps `blocks`.
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
    r = applyAssistantEvent(r, { type: 'tool', id: 't1', label: 'Reading Jira issues', status: 'running' }, 1);
    r = applyAssistantEvent(r, { type: 'block', block: { kind: 'link', label: 'Open', href: '/hermes/' } }, 2);
    expect(r.blocks).toHaveLength(1); expect(r.activities[0].kind).toBe('tools');
    expect(finishAssistantReply(r, 'done', 3).blocks).toHaveLength(1);
  });
  it('parseRange this week starts Monday', () => {
    const now = new Date('2026-10-07T15:00:00'); // Wednesday
    expect(parseRange('hours this week?', now)!.from).toEqual(new Date('2026-10-05T00:00:00'));
    expect(parseRange('last week', now)!.to).toEqual(new Date('2026-10-05T00:00:00'));
    expect(parseRange('last month', now)!.from).toEqual(new Date('2026-09-01T00:00:00'));
    expect(parseRange('tell me a joke', now)).toBeNull();
  });
  it('this week on Monday just after midnight is a 30-minute range', () => {   // Review Focus 3
    const r = parseRange('this week', new Date('2026-10-05T00:30:00'))!;
    expect(r.to.getTime() - r.from.getTime()).toBe(30 * 60_000);
  });
  it('percentChange guards zero', () => { expect(percentChange(5, 0)).toBeNull(); expect(percentChange(110, 100)).toBe(10); });
  it('hasAny matches whole words only', () => { expect(hasAny('Any PRs waiting?', ['prs'])).toBe(true); expect(hasAny('approves', ['prs'])).toBe(false); });
  ```
- [ ] **Step 2: Run** `npx vitest run demo/assistant/assistant.test.ts`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** the four modules with the signatures above.
- [ ] **Step 4: Run** `npx vitest run demo/assistant/assistant.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add demo/assistant && git commit -m "Add the assistant protocol, reply model and text helpers"`

---

### Task 2: Tool caller with policy and simulated outages

**Files:**
- Create: `demo/assistant/callTool.ts`
- Create: `demo/assistant/flaky.ts`
- Test: `demo/assistant/callTool.test.ts`

**Interfaces:**
- Consumes: `AgentDefinition`, `Tool`, `ToolResult`, `User`, `Emit`, `BrainContext` (Task 1).
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

- [ ] **Step 1: Write the failing tests.** Use a fake definition with tools `x.ok` (returns `{ n: 1 }`), `x.throws` and `x.secret` (all system `'X'`), and a policy that denies `x.secret` and marks `x.ok` as `restricted: 'trimmed'`. Assert:
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
- [ ] **Step 5: Commit** `git commit -m "Add the assistant's tool caller with a policy hook and simulated outages"`

---

### Task 3: Hermes company data generator

**Files:**
- Create: `demo/hermes/config.ts`
- Create: `demo/hermes/data/types.ts`
- Create: `demo/hermes/data/generate.ts`
- Create: `demo/hermes/data/derive.ts`
- Test: `demo/hermes/data/hermes-data.test.ts`

**Interfaces:**
- Consumes: `seeded`, `int`, `pick` (Task 1); `Role` (Task 1).
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
  - `p-priya` Priya Nair, Engineering Manager, `manager`, Product. `p-leo` Leo Park is a Platform developer. The rest are developers, QA, a designer and a PM, so that Platform = 6 (incl. Daniel), Product = 6 (incl. Priya) and Leadership = 2.
  - **Projects:** Atlas (Platform), Delta (Platform), Beacon (Product), Comet (Product).
  - Six weeks of Clockify, Jira, GitHub and Teams data before `now`, and six months of AWS costs.
  - **Planted, applied after the random pass:**
    - Atlas has exactly 3 open blocked issues, and one open PR with no review for 4 days.
    - Comet's remaining points ÷ the average completed points of its last 3 sprints puts the projected finish after its target.
    - Beacon and Delta are on track.
    - The latest full month's EC2 cost is ≥ 40% above the month before, and `awsHealth` EC2 has `note: 'Comet load tests left 12 extra instances running'`.
    - Yesterday's Platform standup has ≥ 2 decisions.
    - In the current week-to-date, `p-sara` is below 70% of pro-rated capacity and `p-leo` is above 110%.
    - `#backend` has ≥ 6 messages this week.
- Produces (`derive.ts`):
  - `proRatedCapacity(person, now): number`: capacity × (elapsed weekdays this week, counting today as the fraction of an 8 h day since 09:00) ÷ 5
  - `loadState(hours, capacity): 'over' | 'under' | 'ok'`: over > 1.1, under < 0.7; `capacity === 0` → `'ok'`
  - `velocity(projectId, sprints): number`: the average completed points of the last 3 finished sprints, or 0 if there are none
  - `projectStatus(project, c: Company, now): { status: 'on-track' | 'at-risk' | 'off-track'; reasons: string[] }`:
    - **off-track** if `velocity === 0` and points remain, or `now + ceil(remaining / velocity) × SPRINT_DAYS` days > `target`
    - else **at-risk** if > 2 open blocked issues, or any open PR without a review for > 3 days
    - else **on-track**
    - `reasons` are human sentences, e.g. `3 blocked tickets`, `1 PR waiting more than 3 days for review`, `Projected to finish 2 weeks after the target date`

- [ ] **Step 1: Write the failing tests** with `const NOW = new Date('2026-10-07T15:00:00')` and `const c = generateCompany(HERMES_SEED, NOW)`:
  - two runs deep-equal, and no `Math.random` calls (`vi.spyOn(Math, 'random')` called 0 times)
  - there are 14 people and the demo users exist with their roles and teams
  - the `projectStatus` statuses are Atlas `at-risk` (reasons include `3 blocked tickets`), Comet `off-track`, Beacon and Delta `on-track`
  - the EC2 spike is ≥ 40%
  - `loadState` is `under` for `p-sara` and `over` for `p-leo` over this week's entries
  - `loadState(0, 0)` → `'ok'`; `velocity('atlas', [])` → 0 (Review Focus 3)
  - `proRatedCapacity` on Monday 00:30 → 0
- [ ] **Step 2: Run** `npx vitest run demo/hermes`. Expected: FAIL.
- [ ] **Step 3: Implement** the four modules.
- [ ] **Step 4: Run** `npx vitest run demo/hermes`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the seeded Hermes company data: people, hours, Jira, GitHub, Teams and AWS"`

---

### Task 4: Demo sign-in, role policy and connectors as tools

**Files:**
- Create: `demo/hermes/auth.ts`
- Create: `demo/hermes/policy.ts`
- Create: `demo/hermes/agent/tools.ts`
- Create: `demo/hermes/store.ts`
- Test: `demo/hermes/policy.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (`store.ts`): `COMPANY: Company` (generated at load with `now` rounded down to the minute) and `hermesNow(): Date`.
- Produces (`auth.ts`):
  - `DEMO_USERS: User[]` (Maya, Daniel, Sara, built from `COMPANY.people`)
  - `getUser(): User | null`
  - `signIn(id: string): void`: stores the id string under `hermes.user`
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

- Produces (`policy.ts`): `hermesPolicy: Policy`, plus `visibleProjectIds(user, c): Set<string>`, which pages and intents reuse.
  - **`before`:**
    - With no user, every tool is denied with `Sign in to use Hermes.`
    - `aws.costs` is denied unless the role is `leadership`, using the exact AWS denial copy.
  - **`after`:**
    - **Developer:**
      - `directory.projects` → only own-team projects, with `budgetHours` removed
      - `jira.*`, `github.*`, `clockify.*` → filtered to visible projects
      - `clockify.timeEntries` → entries with `personId === user.id`, plus `teamTotals` for the user's team only, and `restricted` = the exact Developer copy
    - **Manager:** `clockify.timeEntries` → own-team entries individually, other teams as `teamTotals`, and `restricted` = the exact Manager copy
    - **Leadership:** unchanged, with `teamTotals` for every team.
    - `teamTotals` are always computed from the *unfiltered* entries within the visible projects.

- [ ] **Step 1: Write the failing tests** using `queryTool({ tools: hermesTools(() => c), policy: hermesPolicy }, …)` with the NOW from Task 3:
  - **as Sara:**
    - every `clockify.timeEntries` entry has `personId === 'p-sara'`
    - `teamTotals` is exactly one entry, `Platform`, and its hours ≥ her own sum
    - `restricted` equals the exact Developer copy
    - `directory.projects` ids ⊆ {atlas, delta} and none has `budgetHours`
    - `jira.issues` all belong to atlas/delta
    - `aws.costs` → `reason: 'denied'` with the exact copy
  - **as Daniel:** entries all belong to Platform people, `teamTotals` includes `Product`, `restricted` equals the Manager copy, and `aws.costs` is denied
  - **as Maya:** entries include Product people and `aws.costs` is ok
  - **signed out:** `jira.issues` is denied with `Sign in to use Hermes.`
  - `guard('/hermes/team', null)` → `/hermes/sign-in?next=%2Fhermes%2Fteam`; `guard('/hermes/sign-in', null)` → null
  - `safeNext('https://evil.test')`, `safeNext('//evil.test')` and `safeNext(null)` → `/hermes/`; `safeNext('/hermes/projects/atlas')` passes through
  - `signIn` works when `sessionStorage` throws: stub `globalThis.sessionStorage` with throwing methods, then `getUser()` returns the user from memory
- [ ] **Step 2: Run** `npx vitest run demo/hermes`. Expected: FAIL.
- [ ] **Step 3: Implement** `store.ts`, `auth.ts`, `tools.ts` and `policy.ts`.
- [ ] **Step 4: Run** `npx vitest run demo/hermes`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add Hermes demo sign-in, role policy and connectors as tools"`

---

### Task 5: Brain runner and the Hermes agent

**Files:**
- Create: `demo/assistant/brain.ts`
- Create: `demo/assistant/testing.ts`
- Create: `demo/hermes/agent/intents.ts`
- Create: `demo/hermes/agent/definition.ts`
- Test: `demo/hermes/agent/hermes-agent.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces (`demo/assistant/brain.ts`):
  - `interface Intent<P = unknown> { id: string; match(text: string, ctx: BrainContext): P | null; run(params: P, ctx: BrainContext, emit: Emit, signal: AbortSignal): Promise<void> }`
  - `say(emit: Emit, text: string, signal: AbortSignal, pace?: number): Promise<void>`: streams word chunks with `pace` ms between them (default 18).
  - `setPace(ms: number): void`: a module-level override used by tests.
  - `createBrain(opts: { intents: Intent[]; notUnderstood: (ctx: BrainContext) => string }): Brain`
    - **Attachments come first.** Each non-image file gets `ingest` events (progress 0 → 1 in four steps, then `done`); each image gets `vision` `scanning` → `done` with `src: att.url`. Then the brain says `I've read <name> (<size as 2.0 KB>).`
    - If the text is empty, it then says `What would you like to know about it?` (`them` for several) and stops.
    - Otherwise it tries intents in order. On a match it emits `{ type: 'thinking', label: 'Working out what you need' }` and runs the intent.
    - With no match it says `notUnderstood(ctx)` and makes no tool calls.
- Produces (`demo/assistant/testing.ts`, test-only):
  - `runBrain(def: AgentDefinition, text: string, opts: { now: Date; page?: PageContext; user?: User; attachments?: ChatAttachment[] }): Promise<{ text: string; blocks: Block[]; activities: Activity[]; tools: string[]; received: ToolResult[] }>`
  - It uses `createCaller` with `latency: () => 0` and `setPace(0)`, and folds the events with `applyAssistantEvent`.
- Produces (`intents.ts`):
  - `projectIn(text: string, all: Project[]): Project | null`: a case-insensitive name match, ignoring a trailing `'s`
  - `unknownProjectName(text: string): string | null`: the capitalized word after `blocking`/`about`/`is` when no project matches; used for `I can't find a project called <Name>.`
  - `HERMES_INTENTS: Intent[]` in this order:
    - `this-project` (page is `project` + "this"/"it")
    - `my-tickets`
    - `my-hours`
    - `dev-hours` ("hours" + developers/team/everyone/people)
    - `team-health` ("how is the team" / "team doing")
    - `project-blockers` (blocking/blocked/blockers + a project)
    - `project-status` ("projects going" / "project status" / "how is <project>")
    - `meeting-decisions` (decide/decided/decisions/standup/meeting)
    - `channel-summary` (`#channel` or "summarize"/"summary" + a channel)
    - `aws-costs` (aws/cloud + cost/costs/spend/bill)
    - `status-draft` (write/draft + update/status/message)
- Rules shared by all intents:
  - Every answer ends with `Sources: <systems>`, built from the tools that returned `ok`.
  - When a result has `restricted`, that text is said before the numbers.
  - When a result is `failed`, the answer adds `<System> didn't respond, so <what> isn't included.`
  - A project outside `visibleProjectIds` gets `<Name> isn't one of the projects you can see. Your projects: <list>.` and its data is never requested.
- Answer shapes (spec §4.6):
  - `team-health` → `stat` (`Hours vs capacity`, `PRs merged`, `Tickets closed`) + a table of people who are over or under capacity (only individuals the role can see) + blockers as text
  - `dev-hours` → a table (columns `person, hours, capacity`; or for a Developer, columns `who, hours` with rows `You` and `<team> team total`) + a `bar` chart this week vs last week, plus a stat delta from `percentChange`, or `No change data` when that is `null`
  - `project-status` → one `status` block per visible project with `href: /hermes/projects/<id>`
  - `project-blockers` → a table of blocked issues + stale PRs + matching `#backend`/`#product` messages
  - `meeting-decisions` → bullet text with decisions and action owners
  - `channel-summary` → text summary + up to 3 key messages
  - `aws-costs` → for Leadership, a `line` chart of 6 months per service plus the EC2 note; otherwise the denial reason plus `aws.health` as a table
  - `my-tickets` / `my-hours` → use `ctx.user`
  - `status-draft` → a `draft` block (`channel: 'teams'`) whose body includes the real numbers from `team-health`
  - **no match** → `I'm not sure what you're asking. Try one of these:` + the page's suggestions
- Produces (`definition.ts`): `hermesAgent: AgentDefinition`:
  - `id: 'hermes'`, `name: 'Hermes'`, `scope: 'Company systems: people, hours, projects, code, conversations and cloud.'`
  - `tools: hermesTools(() => COMPANY)`, `policy: hermesPolicy`, `brain: createBrain({ intents: HERMES_INTENTS, notUnderstood })`
  - `greeting(user)`: `Hi <first name>. Ask me about the team, hours, projects, code, Teams or AWS.`
  - `suggestions(page, user)`: three per page kind; Leadership's Home list includes `Why did AWS costs go up?`; the project page includes `How is this one doing?`

- [ ] **Step 1: Write the failing tests.** Use `const NOW = new Date('2026-10-07T15:00:00')`, `def = { ...hermesAgent, tools: hermesTools(() => generateCompany(HERMES_SEED, NOW)) }`, `MAYA`/`DANIEL`/`SARA` from the generated people, and `runBrain(def, q, { now: NOW, user })`:
  - **Maya, `How many hours did developers work this week?`:** the table has one row per developer, and the row hours sum to the summed developer Clockify entries in range. A `chart` block exists.
  - **Sara, the same question:** the text contains the exact Developer copy, and the table rows are exactly `You` and `Platform team total`.
  - **Leak check:** for every question in spec §4.6 asked as Sara, every `received` TimeReport entry has `personId === 'p-sara'`, no `received` project has `budgetHours`, and no received issue/PR/entry has `projectId` beacon or comet.
  - **`How are the projects going?`:**
    - as Maya → 4 `status` blocks: atlas `at-risk`, comet `off-track`, beacon and delta `on-track`
    - as Sara → 2 blocks (atlas, delta)
  - **`What's blocking Atlas?`**, `what's blocking atlas`, `Atlas's blockers?` → a table with 3 blocked issues, and the text mentions the waiting PR (Review Focus 2)
  - **`What's blocking Zephyr?`** → `I can't find a project called Zephyr.` with no blocks
  - **Sara, `What's blocking Beacon?`** → the exact `Beacon isn't one of the projects you can see. Your projects: Atlas, Delta.`, and `tools` includes no `jira.issues` call with projectId beacon (Review Focus 2)
  - **`Why did AWS costs go up?`:** as Maya → a `line` chart and the text contains `12 extra instances`; as Daniel → the text contains `AWS costs are visible to leadership.` and a table block of health
  - **`What did we decide in yesterday's standup?`** as Daniel → the text contains each planted decision
  - **`Write a status update for the team`** → a `draft` block with `channel: 'teams'` whose body contains the PRs-merged number from `team-health`
  - **`How is the team doing?` with `setDown('Jira', true)`** → the text contains `Jira didn't respond` (`setDown('Jira', false)` in `afterEach`)
  - **Monday `2026-10-05T00:30:00`, `How many hours did developers work this week?`** as Maya → `JSON.stringify(result)` contains neither `NaN` nor `Infinity`, and every hours cell is 0 (Review Focus 3)
  - **`Tell me a joke`** → the text starts `I'm not sure what you're asking.` and `tools` is empty
  - **Attachment** `{ id: 'a', name: 'notes.txt', type: 'text/plain', size: 2048 }` with empty text → `activities` include a `file` activity and the text contains `I've read notes.txt (2.0 KB).`
- [ ] **Step 2: Run** `npx vitest run demo/hermes`. Expected: FAIL.
- [ ] **Step 3: Implement** `brain.ts`, `testing.ts`, `intents.ts` and `definition.ts`.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS (existing tests included).
- [ ] **Step 5: Commit** `git commit -m "Add the Hermes agent: cross-system intents with role-aware answers"`

---

### Task 6: Conversation store, provider and page context

**Files:**
- Create: `demo/chat-app/useUploads.ts` (extracted from `useChat.ts`)
- Modify: `demo/chat-app/useChat.ts` (use `useUploads`; behavior unchanged)
- Create: `demo/assistant/conversation.ts`
- Create: `demo/assistant/AssistantProvider.tsx`
- Create: `demo/assistant/usePageContext.ts`
- Create: `demo/assistant/speakable.ts`
- Test: `demo/assistant/conversation.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 5 (`say` for the fake brain).
- Produces (`useUploads.ts`): `useUploads(): { uploads: Upload[]; attachFiles(files: FileList | null): void; addUploads(atts: ChatAttachment[]): void; removeUpload(id: string): void; takeReady(): ChatAttachment[] }`. Move `Upload` there and re-export it from `useChat.ts`.
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
- Produces (`speakable.ts`): `speakable(reply: AssistantReply): string`: the reply text, then for the first block one of `I've put a table on screen.`, `I've put a chart on screen.`, `I've put the numbers on screen.` (stat), `I've put the status on screen.`, `I've put a draft on screen.`, or nothing for `link`.
- Produces (`AssistantProvider.tsx`):
  - `<AssistantProvider agent={AgentDefinition} user?={User} now?={() => Date}>`. It creates one `Conversation` per `(agent, user?.id)` with `useMemo`, disposing the old one on change. That is what clears and aborts on a user switch (Review Focus 4).
  - `useAssistant(): { agent; user?; conversation: Conversation; snapshot: ConversationSnapshot; page: PageContext; open: boolean; setOpen(o: boolean, opener?: HTMLElement | null): void; inline: boolean; setInline(on: boolean): void; unread: boolean }`
  - `unread` becomes true when a reply finishes while `open` and `inline` are both false, and resets on open.
- Produces (`usePageContext.ts`): `usePageContext(ctx: PageContext): void`. It registers on mount and on change (keyed by `page`/`id`/`title`) and restores `{ page: 'unknown', title: document.title }` on unmount.

- [ ] **Step 1: Write the failing tests** with a fake agent. Its brain streams `say(emit, 'one two three', signal, 5)`; on the text `slow` it waits 200 ms (abortable), then says `late`. It throws on `boom`. Assert:
  - `send('hi')` resolves to a reply with state `done` and text `one two three`
  - `send('slow')`, then immediately `send('hi')`: the turns are `[slow: stopped, hi: done]`, the stopped reply's text has no `late`, and `busy` ends `false` (Review Focus 1)
  - `send('boom')` → state `error`
  - `send('')` → `null`
  - `clear()` after two turns → `turns` is empty and `archive[0].title` is the first question
  - `restore(archive[0].id)` brings the turns back
  - `dispose()` during `slow` → no listener calls afterwards and the brain's signal is aborted (Review Focus 4)
  - `speakable` of a reply with text `Done.` and a table block → `Done. I've put a table on screen.`
- [ ] **Step 2: Run** `npx vitest run demo/assistant/conversation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `useUploads` (cut from `useChat`), `conversation.ts`, `speakable.ts`, `AssistantProvider.tsx` and `usePageContext.ts`.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS, including `demo/chat-app/activity.test.ts`.
- [ ] **Step 5: Commit** `git commit -m "Add the assistant's conversation store, provider and page context"`

---

### Task 7: Hermes entry, build, sign-in and layout

**Files:**
- Create: `hermes/index.html` (copy of the root `index.html` shell with the Hermes title, description and theme-color; script `/demo/hermes/main.tsx`; the `<noscript>` text adapted)
- Create: `demo/hermes/routes.ts`
- Create: `demo/hermes/main.tsx`
- Create: `demo/hermes/App.tsx`
- Create: `demo/hermes/UserMenu.tsx`
- Create: `demo/hermes/pages/SignIn.tsx`
- Create: `demo/hermes/pages/NotFound.tsx`
- Create: `demo/hermes/hermes.css`
- Modify: `vite.config.ts` (multi-entry, generalized prerender, dev/preview fallback)
- Modify: `playwright.config.ts` (the mobile project's `testMatch` becomes `/(smoke|navigation|assistant|hermes)\.spec\.ts/`)
- Modify: `e2e/fixtures.ts` (export `signInAs(page: Page, id: string): Promise<void>`)
- Test: `demo/site/site.test.ts` (add Hermes routes cases), `e2e/hermes.spec.ts` (new; extended in Tasks 9–10)

**Interfaces:**
- Consumes: Tasks 4–6; `Link`, `navigate`, `useLocation`, `useScrollManagement` from `demo/site/router.tsx`.
- Produces (`routes.ts`, no React):
  - `hermesPageMeta(path: string): { title: string; description: string } | null`. Titles are `<Page> · Hermes`; Home is `Hermes: ask anything about Brightline Labs`; a project is `<Project name> · Hermes`.
  - `HERMES_PATHS: string[]` = `/hermes`, `/hermes/sign-in`, `/hermes/team`, `/hermes/projects`, the four `/hermes/projects/<id>`, `/hermes/connections`
- Produces (`vite.config.ts`):
  - `interface SiteBuild { shell: string; paths: string[]; meta: (p: string) => PageMeta | null }`
  - `SITES: SiteBuild[]` = docs (`index.html`, `ALL_PATHS`, `pageMeta`) and Hermes (`hermes/index.html`, `HERMES_PATHS`, `hermesPageMeta`)
  - `build.rollupOptions.input` = `{ main: 'index.html', hermes: 'hermes/index.html' }`
  - `prerenderRoutes()` loops over `SITES`. Each site reads its own built shell and writes `dist/<path>/index.html` per path with `withMeta`. The root `404.html` stays as it is.
  - `siteFallback(prefixes: string[])` is a plugin with `configureServer` and `configurePreviewServer` middleware. A `GET` whose `accept` includes `text/html`, whose path has no extension, and which starts with `base + 'hermes'` is rewritten to `base + 'hermes/index.html'`.
  - `withMeta` stays exported unchanged.
- Produces (`App.tsx`):
  - It reads `useUser()` and `useLocation()`. When `guard(path, user)` returns a value, it calls `navigate(value, { replace: true })` and renders nothing.
  - `/hermes/sign-in` renders `SignIn` without the assistant.
  - Every other route is wrapped in `<AssistantProvider agent={hermesAgent} user={user} now={hermesNow}>`.
  - The header has brand `Hermes`, nav (`Home, Team, Projects, Connections`) and `<UserMenu/>`.
  - `<main className="route">` switches on path.
  - `document.title` is set from `hermesPageMeta`, falling back to `Page not found · Hermes`.
  - Until Task 9, Home/Team/Projects/Project/Connections each render a heading-only page (`<h1>` = page name); Task 9 replaces these. Unknown project ids and unknown paths render `NotFound` (`<h1>No page at <path></h1>` + a link `Back to Home`).
- Produces (`UserMenu.tsx`):
  - a button with the user's name and title, plus a visible `Demo user` tag
  - a menu with `Switch demo user` items (one per other `DEMO_USERS` entry → `signIn(id)`) and `Sign out` (→ `signOut()` then `navigate('/hermes/sign-in')`)
  - Escape closes it and focus returns to the button.
- Produces (`SignIn.tsx`):
  - `<h1>Sign in to Hermes</h1>`
  - the text `This is a demo. Pick a sample employee to sign in as — no password needed.`
  - one button per `DEMO_USERS` entry showing name, title and role
  - on click: `signIn(id)` then `navigate(safeNext(<next query param>), { replace: true })`

- [ ] **Step 1: Write the failing unit tests** in `site.test.ts`:
  - every `HERMES_PATHS` entry has `hermesPageMeta`
  - `hermesPageMeta('/hermes/projects/atlas')!.title` is `Atlas · Hermes`
  - `hermesPageMeta('/hermes/nope')` and `hermesPageMeta('/hermes/projects/zephyr')` → null
  - `HERMES_PATHS` has no duplicates
- [ ] **Step 2: Write the failing e2e tests** in `e2e/hermes.spec.ts`:
  - signed out, `/hermes/team` → the URL becomes `/hermes/sign-in?next=%2Fhermes%2Fteam`
  - clicking the `Daniel Okafor` button → the URL becomes `/hermes/team` and the user menu shows `Daniel Okafor`
  - `Sign out` → back on sign-in
  - `/hermes/sign-in?next=https://evil.test` + sign-in → the URL is `/hermes/`
  - signed in, each `HERMES_PATHS` entry has the title from `hermesPageMeta`
  - `/hermes/projects/zephyr` shows `No page at /hermes/projects/zephyr`

  Sign in through `page.addInitScript((id) => sessionStorage.setItem('hermes.user', id), 'p-maya')`. Export `signInAs(page, id)` from `e2e/fixtures.ts` for later tasks.
- [ ] **Step 3: Run** `npx vitest run demo/site && npx playwright test e2e/hermes.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `routes.ts`, the Vite changes, `main.tsx`, `App.tsx`, `UserMenu.tsx`, `SignIn.tsx`, `NotFound.tsx` and `hermes.css`.
- [ ] **Step 5: Run** `npx vitest run && npm run build && ls dist/hermes/projects/atlas/index.html && npx playwright test e2e/hermes.spec.ts`. Expected: PASS and the file exists.
- [ ] **Step 6: Run** `npm run test:all`. Expected: PASS; the docs e2e is unaffected.
- [ ] **Step 7: Commit** `git commit -m "Build Hermes as its own entry with demo sign-in and its layout"`

---

### Task 8: The assistant UI: dock, panel, composer and answer blocks

**Files:**
- Create: `demo/assistant/Dock.tsx`
- Create: `demo/assistant/Panel.tsx`
- Create: `demo/assistant/Thread.tsx`
- Create: `demo/assistant/Composer.tsx`
- Create: `demo/assistant/AskBar.tsx`
- Create: `demo/assistant/AssistantInline.tsx`
- Create: `demo/assistant/shortcuts.ts`
- Create: `demo/assistant/blocks/` (`Blocks.tsx`, `Table.tsx`, `Chart.tsx`, `Stat.tsx`, `Status.tsx`, `Draft.tsx`, `LinkCard.tsx`, `scale.ts`)
- Create: `demo/assistant/assistant.css`
- Modify: `demo/hermes/App.tsx` (mount `<AskBar/>` in the header and `<Dock/>` + `<Panel/>` outside `<main>`)
- Test: `demo/assistant/ui.test.ts`, `e2e/assistant.spec.ts`

**Interfaces:**
- Consumes: Tasks 1, 5, 6; `Link` from the router; `ActivityRow`, `ActivitySummary`, `Answer` from `demo/chat-app`; `useDictation` from `demo/chat-app/useDictation.ts`; `useUploads` (Task 6); `AssistantOrb` from `src/orbs`; `signInAs` from `e2e/fixtures.ts` (Task 7).
- Produces (`shortcuts.ts`):
  - `isOpenShortcut(e: { key: string; metaKey: boolean; ctrlKey: boolean; target: { tagName?: string; isContentEditable?: boolean } | null }): boolean`: `/` only when the target isn't `INPUT`/`TEXTAREA`/`SELECT`/contenteditable; `k` with meta or ctrl anywhere.
  - `dockState(s: ConversationSnapshot): AssistantState`: the last reply's `working` → `'thinking'`, `writing` → `'speaking'`, `error` → `'error'`, otherwise `'idle'`.
- Produces (`blocks/scale.ts`): `niceTicks(max: number, count?: number /* 4 */): number[]`: ascending from 0, the last tick ≥ `max`, with step 1/2/5 × 10ⁿ. For `max <= 0` or a non-finite `max` it returns `[0, 1]`.
- Produces (`blocks/Blocks.tsx`): `<Blocks blocks={Block[]} />`. Each renderer is also exported so pages can reuse `Table`, `Chart` and `Status`.
- UI behavior (pinned):
  - **Dock:** a `<button aria-label="Open <agent.name>">` holding `AssistantOrb` at 56px with `state={dockState(...)}`, fixed bottom-right. The unread badge has `aria-label="New answer"`. It is hidden while `inline` is true.
  - **Panel:**
    - At ≥ 768px it's `<aside aria-label={agent.name}>`, 420px wide on the right, and not modal.
    - Below 768px it's `role="dialog" aria-modal="true" aria-label={agent.name}`, a bottom sheet at 85vh that traps focus.
    - Opening focuses the composer textarea. `Esc` closes and focus returns to the opener.
    - The header has `Expand` (toggles `data-expanded="true"` for a full-viewport panel; the label becomes `Collapse`), `Clear conversation` and `Close`.
    - An empty thread shows `agent.greeting(user)` and `agent.suggestions(page, user)` as buttons; clicking one sends it.
    - The panel never renders while `inline` is true.
  - **Thread:** for each turn, the user bubble, `ActivityRow` while the reply is `working`, `ActivitySummary` once activities finish, `Answer`, then `<Blocks/>`. A stopped reply shows `Stopped.` and an error shows its message. Only the latest answer is in an `aria-live="polite"` region.
  - **Composer:**
    - a textarea labelled `Ask <agent.name>`
    - an attach button (files/images through `useUploads`)
    - a dictation button via `useDictation`, rendered only when `supported`
    - `Send`, which becomes `Stop` while busy
    - `Enter` sends and `Shift+Enter` adds a new line
  - **AskBar:** a header button `Ask Hermes` (`Ask <agent.name>`) showing the `/` key hint. It opens the panel, passing itself as the opener.
  - **Global key handler** (in `Panel.tsx`): `isOpenShortcut` → `preventDefault` + open.
  - **Blocks:**
    - `Table`: a real `<table>` with `<caption>` when given; a row `href` renders the first cell as `<Link>`.
    - `Chart`: SVG bars/lines using `niceTicks`, `role="img"` + `aria-label` = caption, and a visually hidden `<table>` with the same data.
    - `Stat`: a `<dl>`.
    - `Status`: a badge with text `On track` / `At risk` / `Off track`, plus reasons, `Sources: …` and a link when `href` is set.
    - `Draft`: the channel name, the body in `<pre>`, a `Copy` button (`navigator.clipboard.writeText`, then `Copied` for 2 s), and the label `Demo — not sent`.
    - `LinkCard`: a `<Link>` card.
  - **AssistantInline:** renders `Thread` + suggestions + `Composer` in-page, calling `setInline(true)` on mount and `false` on unmount. Hermes Home uses it in Task 9.

- [ ] **Step 1: Write the failing unit tests** in `demo/assistant/ui.test.ts`:
  - `isOpenShortcut({ key: '/', target: { tagName: 'BODY' } })` → true
  - the same with `tagName: 'TEXTAREA'` or `'INPUT'`, or with `isContentEditable: true` → false (Review Focus 5)
  - `{ key: 'k', metaKey: true, target: { tagName: 'INPUT' } }` → true
  - `{ key: 'k', target: body }` → false
  - `dockState` maps each reply state
  - `niceTicks(87)` → `[0, 25, 50, 75, 100]`
  - `niceTicks(0)` and `niceTicks(NaN)` → `[0, 1]` (Review Focus 3)
  - `niceTicks(3.2).at(-1)` ≥ 3.2
- [ ] **Step 2: Write the failing e2e tests** in `e2e/assistant.spec.ts`, signed in as `p-maya` on `/hermes/team`:
  - Click `Open Hermes` → the composer is focused; `Esc` closes and focus is back on the dock.
  - `/` on the page body opens the panel. Typing `/` inside the composer leaves the panel open and the textarea value ends with `/`. `Control+K` also opens it (Review Focus 5).
  - Asking `How are the projects going?` shows 4 status badges.
  - **Persistence:** ask `How is the team doing?`, click nav `Projects` right away, then expect the stat block to appear in the panel; the URL is `/hermes/projects` and the turn is still there.
  - **Second question mid-stream:** ask `How is the team doing?`, then immediately ask `What are my open tickets?` → the first turn shows `Stopped.` and the second shows a table (Review Focus 1).
  - `Write a status update for the team` → `Demo — not sent` is visible, and `Copy` puts text on the clipboard.
  - **Mobile (Pixel 7 project only):** the panel has `role="dialog"`, and `scrollWidth` ≤ viewport width.
- [ ] **Step 3: Run** `npx vitest run demo/assistant && npx playwright test e2e/assistant.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the files above and mount them in `demo/hermes/App.tsx`.
- [ ] **Step 5: Run** `npm run test:all`. Expected: PASS on desktop and mobile.
- [ ] **Step 6: Commit** `git commit -m "Add the assistant dock, panel, composer and answer blocks"`

---

### Task 9: Hermes pages

**Files:**
- Create: `demo/hermes/pages/Home.tsx`, `Team.tsx`, `Projects.tsx`, `Project.tsx`, `Connections.tsx`
- Modify: `demo/hermes/App.tsx` (routes)
- Modify: `demo/hermes/hermes.css`
- Test: `e2e/hermes.spec.ts`

**Interfaces:**
- Consumes: Tasks 2–8; `queryTool(hermesAgent, toolId, input, { user, now: hermesNow() })` for all page data, so pages obey the same policy; `visibleProjectIds`, `projectStatus`, `proRatedCapacity`, `loadState`; `Table`, `Chart`, `Status` from `demo/assistant/blocks`; `useDown`, `setDown`; `AssistantInline`, `useAssistant`, `usePageContext`.
- Produces (one `<h1>` per page; each registers page context `{ page: '<name>', title, id? }`):

| Page | h1 | Content |
|---|---|---|
| Home | `Good morning/afternoon/evening, <first name>` (by `hermesNow()` hour: < 12, < 18, else) | `Today at a glance` `<dl>`: `Hours logged this week`, `PRs merged`, `Tickets closed`, `Open blockers` (per policy); `<AssistantInline/>`; `Recent conversations` from `snapshot.archive`, a button per item calling `conversation.restore(id)`, the section hidden when empty |
| Team | `Team` | a `Table` per visible person (name, role, hours this week, pro-rated capacity, load as `Over` / `Under` / `OK`); a Developer sees only their own row plus a `Platform team total` row, with the exact Developer copy above the table |
| Projects | `Projects` | a `Status` block per visible project linking to its detail page |
| Project | the project name | sprint progress (`completed / committed` points), blocked issues table, open PRs with review wait in days, recent decisions from meetings, hours logged; `Budget` shown only when `budgetHours` is present; page context `{ page: 'project', id, title: name }`; a project outside `visibleProjectIds` renders `NotFound` |
| Connections | `Connections` | one row per system (Directory, Clockify, Jira, GitHub, Teams, AWS) with `Connected` (or `Outage (simulated)` when down), last sync (= `hermesNow()` minus a seeded 2–9 min), "what Hermes can read", and a checkbox `Simulate an outage` → `setDown(system, checked)`; then three disabled cards `Slack`, `Google Drive`, `Salesforce` labelled `Coming later` |

- [ ] **Step 1: Write the failing e2e tests** in `e2e/hermes.spec.ts`:
  - **Home as Maya:** the h1 starts with `Good` and ends with `Maya`, the four glance labels are visible, the inline composer is visible, and the dock is not.
  - **Recent conversations:**
    1. On Home, ask `How is the team doing?`, then `Clear conversation`.
    2. `Recent conversations` lists `How is the team doing?`.
    3. Restoring it brings the turn back.
  - **Team:** as Sara, the exact Developer copy is visible and the table has 2 rows (`Sara Lindqvist`, `Platform team total`); as Maya, the table has a row for each of the 12 non-leadership people.
  - **`/hermes/projects` as Sara** → 2 status cards; `/hermes/projects/beacon` as Sara → the not-found page.
  - **`/hermes/projects/atlas` as Maya:** `At risk`, 3 blocked-issue rows and `Budget` are visible; as Sara, `Budget` is absent.
  - **Project page context:** on `/hermes/projects/atlas`, the suggestion `How is this one doing?` → the answer contains `Atlas`.
  - **Connections:**
    1. Check `Simulate an outage` for Jira → the row shows `Outage (simulated)`.
    2. Asking `How is the team doing?` in the panel → `Jira didn't respond`.
- [ ] **Step 2: Run** `npx playwright test e2e/hermes.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the pages and routes.
- [ ] **Step 4: Run** `npx playwright test e2e/hermes.spec.ts e2e/assistant.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the Hermes home, team, projects and connections pages"`

---

### Task 10: Hermes end-to-end suite: smoke, roles and user switching

**Files:**
- Modify: `e2e/hermes.spec.ts`

**Interfaces:**
- Consumes: `HERMES_PATHS`, `hermesPageMeta` (Task 7); `signInAs`, `test`, `expect` from `e2e/fixtures.ts` (its `errors` fixture fails a test on console errors).

- [ ] **Step 1: Add the tests:**
  - **smoke loop over `HERMES_PATHS`** signed in as `p-maya`: title equals `hermesPageMeta(path).title`, exactly one visible `h1`, `scrollWidth` ≤ viewport width, and no serious/critical axe violations on `main` and `header` (excluding `canvas` and `svg`)
  - **role difference:**
    1. As Maya, ask `How many hours did developers work this week?` → the table has > 2 rows.
    2. Use `Switch demo user` → Sara → the thread is empty.
    3. Ask again → the exact Developer copy is visible and the rows are `You` and `Platform team total`.
  - **mid-reply switch** (Review Focus 4): as Maya on `/hermes/team`, ask `How is the team doing?` and switch to Sara before the reply finishes. For 3 s, poll that the thread has 0 turns and no `stat` block appears.
  - **AWS:** Maya's `Why did AWS costs go up?` shows a chart and `12 extra instances`; Daniel's shows `AWS costs are visible to leadership.`
- [ ] **Step 2: Run** `npx playwright test e2e/hermes.spec.ts`. Expected: PASS. If something fails, fix it in the owning task's files and note which one in the commit message.
- [ ] **Step 3: Run** `npm run test:all`. Expected: PASS.
- [ ] **Step 4: Commit** `git commit -m "Add browser tests for every Hermes page, role and user switch"`

---

### Task 11: Hands-free voice mode

**Files:**
- Create: `demo/assistant/voice.ts`
- Create: `demo/assistant/VoiceMode.tsx`
- Modify: `demo/assistant/Composer.tsx` (a `Voice mode` button)
- Modify: `demo/assistant/Panel.tsx` and `AssistantInline.tsx` (show `VoiceMode` while it's active)
- Modify: `demo/assistant/assistant.css`
- Test: `demo/assistant/conversation.test.ts`, `e2e/assistant.spec.ts`

**Interfaces:**
- Consumes: `Conversation`, `speakable` (Task 6); `useVoiceAssistant` from `demo/voice-assistant/useVoiceAssistant.ts`; `AssistantOrb`.
- Produces (`voice.ts`): `voiceResponder(c: Conversation): (text: string, signal: AbortSignal) => Promise<string>`. It calls `c.send(text)`, calls `c.stop()` when `signal` aborts, and resolves to `speakable(reply)`. For a `null` or stopped reply it resolves to `''`.
- Produces (`VoiceMode.tsx`):
  - `useVoiceAssistant({ respond: voiceResponder(conversation) })` driving an `AssistantOrb` (120px) with its `state` and `stream`
  - a caption of what was heard
  - an `End voice mode` button
- Answers still render as turns in the thread, blocks included.
- The `Voice mode` button is rendered only when both `support.recognition` and `support.synthesis` are true. Typing always works.

- [ ] **Step 1: Write the failing tests:**
  - **unit:** `voiceResponder(c)('hi', signal)` resolves to the reply's speakable text, and aborting the signal during the fake brain's `slow` answer resolves to `''` with the turn `stopped`
  - **e2e:** in headless Chromium, which has no speech recognition, `Voice mode` and the dictation button are absent and typing still answers
- [ ] **Step 2: Run** `npx vitest run demo/assistant && npx playwright test e2e/assistant.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `voice.ts`, `VoiceMode.tsx` and the Composer/Panel/Inline changes.
- [ ] **Step 4: Run** `npm run test:all`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add a hands-free voice mode to the assistant"`

---

### Task 12: Link Hermes from the docs and document it

**Precondition:** `git status --short demo/site README.md` must be empty. **If it isn't, stop and ask the user** to commit or stash first. Do not commit their changes.

**Files:**
- Modify: `demo/site/routes.ts` (add `SITE_LINKS: { name: string; summary: string; href: '/hermes/'; tint: string }[]` with one entry for Hermes)
- Modify: `demo/site/pages/Examples.tsx` (a `Full sites` section rendering `SITE_LINKS` as plain `<a href={href(link.href)}>` cards, since they leave the docs app)
- Modify: `README.md` (a new `## AI-native sites` section after `## Demo & development`)
- Test: `demo/site/site.test.ts`, `e2e/examples.spec.ts`

**Interfaces:**
- Consumes: `href` from `demo/site/router.tsx`.
- README section content:
  1. what Hermes is
  2. `npm run dev` → `http://localhost:5318/hermes/`
  3. the demo users and roles
  4. the three layers
  5. how to plug in a real model (replace `brain` with a server that streams `AssistantEvent`s), real connectors (implement `Tool.run` server-side for AWS, Jira, Microsoft Graph/Teams, Clockify and GitHub), the policy server-side, and a real identity provider behind `auth.ts` (spec §9)
  6. the reminder that the data is generated and Hermes is read-only
  7. a line that the shell is site-agnostic, so a second agent (e.g. Fleet) can reuse it

- [ ] **Step 1: Write the failing tests:**
  - `SITE_LINKS[0].href === '/hermes/'`
  - in `e2e/examples.spec.ts`, on `/examples` clicking `Hermes` navigates to `/hermes/sign-in?next=%2Fhermes`, because the visitor is signed out
- [ ] **Step 2: Run** `npx vitest run demo/site && npx playwright test e2e/examples.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the link, the section and the README text.
- [ ] **Step 4: Run** `npm run test:all`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Link the Hermes site from the docs and document it"`
