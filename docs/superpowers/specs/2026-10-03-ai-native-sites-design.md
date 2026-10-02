# AI-native sites: Fleet and Hermes

Date: 2026-10-03 · Status: draft for review · Branch: `ai-sites`

> **Scope update (2026-10-03):** build **Hermes only** for now. The Fleet site (§3) is deferred. The shared assistant shell (§2) stays site-agnostic so Fleet can be added later as a second agent. Fleet-only requirements (success criterion 3, §3, the Fleet rows in §8) do not apply to this round.

## 1. Intent

Most websites are pages first, with a chatbot bolted on. These two sites are the other way round: an AI assistant is always present on every page, keeps its conversation as you move around, knows what page you are looking at, and answers in whatever form fits the question — a sentence, a table, a chart, a status card, a draft message, or a spoken reply.

We build two showcase sites in this repo, both using ThinkingOrbs to show what the assistant is doing:

- **Fleet** — a standalone fleet-management product with a **limited** assistant that only handles fleet management.
- **Hermes** — the internal portal for Hermes Agent, the company's AI that is connected to every company system (AWS, Jira, Teams, Clockify, GitHub, more later). Only verified users can use it. It has **full access** to the systems, but what each user sees depends on their role.

### What the user said vs. what we assumed

| Said by the user | Assumed / decided in brainstorming |
|---|---|
| Two sites: fleet management and Hermes Agent | Both live in this repo as showcase demos (approach A) |
| AI available 24/7 on all pages, answers any time | A shared dock that persists across pages and keeps the chat |
| Hermes: company data moving to AWS; Hermes gets access to AWS, Jira, Teams, Clockify, GitHub and other apps | Connected systems are simulated with seeded sample data; a real backend can replace the local brain and tools later |
| Only verified users can use the Hermes site | Demo sign-in with sample employees behind an `auth` interface |
| Example questions: how is the team doing, how many hours did developers work, how are projects going | These are the headline intents and must work end to end |
| "Supports all types of communication and replies according to the request" | Input: typing, dictation, hands-free voice, file/screenshot attachments. Output: text plus rich blocks chosen per question; spoken replies in voice mode; drafted Teams messages/emails (never sent) |
| Hermes has full access; the Fleet agent is limited to fleet management; separate AIs | Two separate agent definitions on one shared UI shell; scope enforced by which tools an agent is given |
| (Chosen) Role-based visibility in Hermes | Leadership / Manager / Developer roles enforced in the tool layer |

### Success criteria

1. On both sites, the assistant can be opened from every page, and navigating keeps the conversation and any answer that is still streaming.
2. Every example question in §3.4 and §4.6 produces a correct answer computed from the sample data (not canned text), with the right rich block.
3. The Fleet assistant declines every non-fleet question and cannot reach non-fleet data; the Fleet bundle contains no Hermes code or data.
4. In Hermes, a Developer can never receive another person's individual hours or company-wide AWS costs, whatever they ask; Hermes says what is restricted and offers what is allowed.
5. Everything works offline with no API key, passes axe checks, works at phone width, and respects reduced motion.
6. The brain and tools sit behind interfaces a real model and real connectors can replace without changing the UI.

### Out of scope

Real LLM calls, real connectors or credentials, real authentication, sending messages or writing to any system, persistence beyond the browser session, multi-language UI.

## 2. Architecture

Three layers, each knowing nothing about the one above it:

```
 ┌─────────── Site (fleet | hermes) ───────────┐
 │ pages, brand, sample data, page context      │
 │ ┌──────── Agent definition ───────────────┐  │
 │ │ name · scope · tools · brain · prompts  │  │
 │ └─────────────────────────────────────────┘  │
 └──────────────────────────────────────────────┘
 ┌──────── Shared assistant shell ──────────────┐
 │ dock · panel · composer · voice · blocks     │
 │ conversation state · tool runner · protocol  │
 └──────────────────────────────────────────────┘
 ┌──────── ThinkingOrbs (src/orbs) ─────────────┐
```

- **Shell** (`demo/assistant/`): UI and conversation mechanics only. No data, no domain knowledge.
- **Agent definition** (per site): what the assistant is called, what it covers, which tools it may call, and the brain that decides which tools to call and how to answer.
- **Site**: pages, brand, sample data, and the page context each page registers.

### 2.1 Protocol (`demo/assistant/protocol.ts`)

Extends the chat sample's `AgentEvent` (`demo/chat-app/agent.ts`) and reuses its types; it does not fork them.

```ts
type Block =
  | { kind: 'table'; columns: Column[]; rows: Row[]; caption?: string }
  | { kind: 'chart'; type: 'bar' | 'line'; series: Series[]; x: string[]; unit?: string; caption?: string }
  | { kind: 'stat'; items: { label: string; value: string; delta?: string; tone?: Tone }[] }
  | { kind: 'status'; title: string; status: 'on-track' | 'at-risk' | 'off-track'; reasons: string[]; sources: string[] }
  | { kind: 'draft'; channel: 'teams' | 'email'; to?: string; subject?: string; body: string }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'location'; vehicleId: string; label: string };

type AssistantEvent = AgentEvent | { type: 'block'; block: Block };

interface PageContext { page: string; title: string; id?: string; data?: unknown }

interface Tool<I = unknown, O = unknown> {
  id: string;            // 'fleet.vehicles', 'clockify.timeEntries'
  label: string;         // shown on the ToolOrb chip: "Reading Clockify"
  system: string;        // 'Fleet', 'Clockify', 'Jira', …
  run(input: I, ctx: ToolContext): Promise<O>;
}

interface ToolContext { user?: User; signal: AbortSignal }

type Brain = (
  input: { text: string; attachments: ChatAttachment[] },
  ctx: { page: PageContext; user?: User; history: Turn[]; call: CallTool },
  emit: (e: AssistantEvent) => void,
  signal: AbortSignal
) => Promise<void>;

interface AgentDefinition {
  id: 'fleet' | 'hermes';
  name: string;
  scope: string;                         // one sentence, used in the intro and in declines
  tools: Tool[];                         // the only data the agent can reach
  brain: Brain;
  suggestions(page: PageContext, user?: User): string[];
  policy?: (tool: Tool, input: unknown, user?: User) => PolicyResult;   // Hermes only
}
```

`call` is the only way a brain reaches data. It looks the tool up in the agent's own `tools` list (unknown id → error), runs the policy if there is one, emits the `tool` events that drive the ToolOrb (`running` → `done` / `error`), and returns the result or a `PolicyResult` denial.

### 2.2 Shell components

- **`AssistantProvider`**: sits above the site router. Holds the conversation (turns, the streaming reply, abort controller), the current `PageContext`, voice mode and panel state. Navigating never unmounts it.
- **`usePageContext(ctx)`**: hook each page calls to register what it shows. The latest registration wins; it is cleared on unmount.
- **`Dock`**: an `AssistantOrb` fixed in the bottom-right corner on every page. It is idle-breathing at rest and mirrors the agent's state (`thinking`, `speaking`, …) while a reply runs, even with the panel closed. A small badge marks an unread answer.
- **`Panel`**: a side panel at ≥ 768px, a bottom sheet below that, and a full-screen mode (Hermes Home uses this inline). It holds the conversation, page-aware suggestion chips, the composer, a stop button, and a "clear conversation" control.
- **Openers**: dock click, the header "Ask AI" bar, `/` (when not typing in a field) and `⌘K`/`Ctrl+K`. `Esc` closes the panel. Focus moves into the panel on open and returns to the opener on close.
- **Composer**: text, attachments (files, images, video, using the chat sample's ingest/vision/reel handling), and dictation (reuses `demo/chat-app/useDictation.ts`).
- **Voice mode**: hands-free. Reuses `demo/voice-assistant/useVoiceAssistant.ts` for listening, turn-taking and speech synthesis. The brain is the same; spoken replies read the text part and say "I've put a table on screen" for blocks.
- **Reply rendering**: reuses the chat sample's `ActivityRow`, `ActivitySummary` and `Answer` (orbs for live activity, then a collapsible timeline), plus a new `blocks/` renderer for each `Block` kind. Charts are inline SVG with no chart library, follow the `dataviz` skill's guidance, and have a data-table fallback for screen readers.
- **`LinkCard` / `location`**: navigate inside the site with the router. The assistant stays open.

### 2.3 Brains

Each site's brain is a local intent engine:

1. **Classify**: match the text (and page context, e.g. "this one" on a vehicle page) against the agent's intents with keyword/pattern rules and entity extraction (vehicle ids, driver names, people, project names, time ranges like "this week", "last month", "yesterday").
2. **Scope check**: no matching intent and the text looks like another domain → decline with the agent's `scope` and three suggestions. No match but plausibly in scope → say what was not understood and offer suggestions.
3. **Plan and call**: emit a short `thinking` step, then call the intent's tools through `call` (the ToolOrb shows each one).
4. **Compute**: aggregate the real sample data (sums, filters, rankings, deltas, status rules).
5. **Answer**: stream a short text answer, then emit blocks. Always name the sources ("From Clockify and Jira").

Intents are plain data and functions in `agent/intents.ts`, each testable on its own: `{ id, match(text, ctx) → params | null, run(params, ctx, emit) }`.

## 3. Fleet site

Entry `fleet.html` → `/fleet/`. Brand: its own name, a clean operational look, light and dark themes.

### 3.1 Pages

| Route | Content | Page context |
|---|---|---|
| `/fleet/` Overview | KPI tiles (active, on trip, in shop, open alerts); live SVG map with vehicles moving along routes; alert feed | `overview`, KPI values, open alerts |
| `/fleet/vehicles` | Filterable list (type, status, depot) | `vehicles`, active filters, visible ids |
| `/fleet/vehicles/:id` | Status, location, fuel, odometer, current trip, service history, upcoming maintenance, recent trips | `vehicle`, id, full record |
| `/fleet/drivers` and `/:id` | List; detail with hours driven, safety score, assigned vehicle, recent trips | `driver(s)` |
| `/fleet/trips` | Active and completed trips, ETA, delays with reason | `trips` |
| `/fleet/maintenance` | Due, overdue, in shop | `maintenance` |
| `/fleet/fuel` | Spend over time and per vehicle, efficiency | `fuel`, range shown |
| `/fleet/settings` | Demo controls: "flaky telematics" toggle, simulation speed | — |

The map is a stylized, hand-drawn city (roads as SVG paths, depots, a few landmarks), not real geography, so it works with no tiles. Vehicles interpolate along route paths from the simulation clock. A `location` block highlights a vehicle and pans the map to it.

### 3.2 Data

`demo/fleet/data/generate.ts`, seeded (same output every time for a given seed and "now"):

- 24 vehicles: trucks `TRK-01…`, vans `VAN-01…`, cars `CAR-01…`, each with depot, fuel type, tank size, odometer, service interval.
- 18 drivers with license class, assigned vehicle, shift pattern.
- 30 days of trips (route, start/end, planned vs actual duration, delay reason when late: traffic, loading, breakdown, detour), fuel fill-ups, service records, and telematics events (harsh braking, speeding, idling).
- Derived: next service due (by km and by date), alerts (late, overdue service, low fuel, safety events).
- A simulation clock (`sim.ts`) advances active trips in real time × speed so the map, ETAs and "late" status are live. Tests pin the clock.

### 3.3 Fleet agent

- **Name**: Fleet Assistant. **Scope**: "I handle fleet management: vehicles, drivers, trips, fuel, maintenance and alerts."
- **Tools**: `fleet.vehicles`, `fleet.drivers`, `fleet.trips`, `fleet.maintenance`, `fleet.fuel`, `fleet.alerts`. Nothing else is registered, and nothing else is in the bundle.

### 3.4 Questions it must answer

| Question | Tools | Answer |
|---|---|---|
| Which vehicles are due for service? | maintenance, vehicles | Sentence + table (vehicle, due by, km left / days overdue) + links |
| Why is VAN-12 late? | trips, vehicles | Delay reason and minutes late + stat (ETA, delay) + `location` |
| Where is TRK-14? | vehicles, trips | `location` + current trip and ETA |
| Fuel spend this month vs last? | fuel | Bar chart by week + stat with % change |
| Who's our safest driver? / worst idling this week? | drivers, trips | Ranked table |
| How many vehicles are on the road right now? | vehicles, trips | Stat |
| Any open alerts? | alerts | Table grouped by type + links |
| (on a vehicle page) Anything wrong with this one? | vehicles, maintenance, alerts | Uses page context: summary of issues or "all clear" |
| What's the weather? / How many hours did devs work? / Write a poem | — | Decline with scope + three fleet suggestions |

## 4. Hermes site

Entry `hermes.html` → `/hermes/`. Brand: Hermes Agent; the company name lives in `demo/hermes/config.ts`, default a fictional company.

### 4.1 Sign-in

- Every route except `/hermes/sign-in` requires a user. Without one, you are redirected to sign-in, then back.
- The sign-in page says "Sign in with your company account" and shows a clearly labelled **demo** picker of sample employees, one per role, with name, title and role. No password fields.
- `auth.ts` exposes `useUser()`, `signIn(userId)`, `signOut()`. The user is kept in `sessionStorage` (wrapped in try/catch; falls back to memory). A real provider (e.g. AWS Cognito or Microsoft Entra ID) can replace it behind the same interface.
- The header shows the signed-in user and a "switch demo user" menu. Switching clears the conversation, since answers depend on role.

### 4.2 Roles and policy

| Role | People & hours | Projects | AWS |
|---|---|---|---|
| Leadership | Everyone, individually | All, including budgets | Costs and health |
| Manager | Their team, individually; others as team totals | All, including budgets | Health only |
| Developer | Own hours; team totals only | Their team's projects, no budgets | Health only |

`policy.ts` runs on every tool call, before and after it runs:
- **Before**: deny a whole tool when a role may not use it (e.g. `aws.costs` for Developer and Manager).
- **After**: filter or aggregate the result (e.g. per-person hours for others become a team total).
- The brain receives either the permitted data or a denial with a reason and an allowed alternative. It never sees restricted data.
- Hermes words restrictions plainly: "Individual hours for other people are visible to managers. Here's your team's total instead."

### 4.3 Pages

| Route | Content |
|---|---|
| `/hermes/` Home | The AI is the page: the assistant panel full screen with a greeting by name, suggestion chips for your role, "Today at a glance" stat cards (hours logged, PRs merged, tickets closed, blockers), recent conversations in this session |
| `/hermes/team` | People, roles, this week's hours vs capacity, recent activity (filtered by policy) |
| `/hermes/projects` and `/:id` | List with status; detail: sprint progress and blockers (Jira), open PRs and review times (GitHub), recent decisions (Teams), hours/budget (Clockify; budget per policy) |
| `/hermes/connections` | Each system with status, last sync, what Hermes can read; "flaky connection" toggle per system; "Add an app" placeholders |
| `/hermes/sign-in` | See §4.1 |

The docked assistant is on every page. On Home it is shown inline and the dock is hidden.

### 4.4 Data

`demo/hermes/data/generate.ts`, seeded:

- 14 people across 2–3 teams (developers, QA, design, PM, an engineering manager, leadership), each with weekly capacity.
- 4 projects with a team, a start date, a budget in hours, a target date.
- **Clockify**: 6 weeks of time entries (person, project, date, hours, description).
- **Jira**: sprints, issues (status, assignee, story points, blocked flag and blocker reason, created/resolved dates).
- **GitHub**: PRs (author, reviewers, opened/merged, review wait) and commits per repo.
- **Teams**: channel messages and meeting notes (standups, planning) containing decisions and blockers written as plain text.
- **AWS**: monthly cost per service for 6 months (with one deliberate spike and a cause), and service health/deployments.

### 4.5 Hermes agent

- **Name**: Hermes. **Scope**: company systems: people, hours, projects, code, conversations and cloud.
- **Tools**: `clockify.timeEntries`, `jira.issues`, `jira.sprints`, `github.pullRequests`, `github.commits`, `teams.messages`, `teams.meetings`, `aws.costs`, `aws.health`, `directory.people`.
- **Read-only.** Drafts are shown as `draft` blocks with a Copy button and a "Demo — not sent" label. Nothing is ever sent.

### 4.6 Questions it must answer

| Question | Systems | Answer |
|---|---|---|
| How is the team doing? | Clockify, Jira, GitHub, Teams | Summary + stat block (hours vs capacity, PRs merged, tickets closed) + who is over/under capacity (per policy) + current blockers + sources |
| How many hours did developers work this week? | Clockify, directory | Table per developer + total (Leadership/Manager), or own hours + team total (Developer) + chart vs last week |
| How are the projects going? | Jira, GitHub, Clockify | One `status` block per visible project with reasons |
| What's blocking Atlas? | Jira, GitHub, Teams | Blocked tickets, stale PRs, related Teams messages |
| What did we decide in yesterday's standup? | Teams | Decisions and action items from the meeting notes |
| Summarize #backend this week | Teams | Short summary + key threads |
| Why did AWS costs go up? | AWS | Line chart + the service that drove it (Leadership), or a restriction message (others) |
| What are my open tickets? / my hours this week | Jira / Clockify | Uses the signed-in user |
| Write a status update for the team | Jira, GitHub, Clockify | `draft` block (Teams) built from real numbers |
| (on a project page) How is this one doing? | per project | Uses page context |

Status rules (for `status` blocks) are explicit and tested: e.g. *off track* if the projected finish is after the target date; *at risk* if more than 2 tickets are blocked or any PR has waited more than 3 days for review; otherwise *on track*.

## 5. Error handling and edge cases

- **Not understood**: say so and offer suggestions for the current page.
- **Out of scope (Fleet)**: decline with the scope sentence + three suggestions. Never partially answer.
- **Not permitted (Hermes)**: say what is restricted and why, then answer with what is allowed.
- **Tool fails** (the flaky toggles): the ToolOrb chip shows the failure; the brain answers with what it has and names the missing source ("Jira didn't respond, so blockers aren't included").
- **Stop**: aborts the brain and tools via `AbortSignal`; the partial answer stays, marked as stopped.
- **New question while one is streaming**: the first is stopped, then the new one starts.
- **No microphone / speech not supported**: voice controls are hidden or show why; typing always works.
- **Unknown route**: each site has its own not-found page with the dock still available.
- **Storage unavailable**: everything works in memory.

## 6. Accessibility, responsiveness, motion

- The dock, panel and blocks are keyboard-operable with visible focus. The panel is a labelled dialog on mobile and a complementary region on desktop.
- Streaming text and status changes are announced politely; the orbs' existing ARIA conventions apply.
- Every chart has a table fallback and a text summary.
- Works at 375px wide with no horizontal scroll; the panel becomes a bottom sheet.
- `prefers-reduced-motion`: map vehicles jump between positions instead of gliding; orbs use their reduced-motion modes.
- Light and dark themes per site.

## 7. Build and structure

```
demo/assistant/
  AssistantProvider.tsx  usePageContext.ts  Dock.tsx  Panel.tsx  Composer.tsx
  blocks/ (Table, Chart, Stat, Status, Draft, Link, Location, index)
  protocol.ts  callTool.ts  intents.ts (helpers: time ranges, entity matching)
  assistant.css
demo/fleet/
  main.tsx  App.tsx  router  config.ts  fleet.css
  data/ (generate.ts, sim.ts, types.ts)
  pages/ (Overview, Vehicles, Vehicle, Drivers, Driver, Trips, Maintenance, Fuel, Settings, NotFound)
  map/ (CityMap.tsx, routes.ts)
  agent/ (tools.ts, intents.ts, brain.ts, definition.ts)
demo/hermes/
  main.tsx  App.tsx  router  config.ts  auth.ts  policy.ts  hermes.css
  data/ (generate.ts, types.ts)
  pages/ (SignIn, Home, Team, Projects, Project, Connections, NotFound)
  agent/ (tools.ts, intents.ts, brain.ts, definition.ts)
fleet.html  hermes.html
```

- Vite builds three HTML entries (`index.html`, `fleet.html`, `hermes.html`) via `build.rollupOptions.input`. The prerender plugin writes an `index.html` per route under `/fleet/` and `/hermes/` with the right title and description, so deep links work on a static host.
- The routing approach follows the existing `demo/site/router.tsx` (a small custom router). It is generalized or reused rather than adding a routing dependency.
- No new runtime dependencies.
- The docs site's Examples page gets two cards linking to `/fleet/` and `/hermes/`.
- `README.md` gets a short section describing the two sites and how to plug in a real model and connectors.

## 8. Testing

**Vitest (unit)**
- Data generators are deterministic for a fixed seed and clock.
- Each intent: matching (including entities and time ranges) and computed results, e.g. the hours table sums equal the raw Clockify entries; due/overdue maintenance is correct at a pinned date; project status rules.
- Fleet scope guard: a list of off-topic questions are all declined; `call` rejects any tool id not in the agent's list.
- Hermes policy: for each role and each tool, restricted fields never appear in what the brain receives (checked over every intent's questions).
- `callTool` emits the right ToolOrb events for success, failure and abort.

**Playwright (browser)**
- Every route on both sites renders with no console errors and passes axe.
- The dock opens with click, `/` and `⌘K`; focus is trapped/returned correctly; `Esc` closes.
- Persistence: ask a question, navigate while it streams, and the answer finishes and the conversation is still there.
- One headline question per site end to end, checking the rendered block (table rows, chart, status cards).
- Hermes: signed-out redirect; Developer vs Leadership get different answers to "How many hours did developers work this week?".
- Fleet: an off-topic question is declined.
- Mobile viewport: bottom sheet, no horizontal scroll.
- Bundle check: the built Fleet assets contain no Hermes module ids or data strings, and vice versa.

## 9. Swapping in real systems later

- **Brain** → a server endpoint that calls a real model with the agent's tools as tool definitions and streams `AssistantEvent`s back. The UI does not change.
- **Tools** → real connectors (AWS SDK, Jira, Microsoft Graph for Teams, Clockify, GitHub APIs) behind the same `Tool` interface, running server-side.
- **Policy** → enforced server-side on the same tool calls; the tool allowlist per agent becomes the permission boundary, so the Fleet agent still cannot reach company systems.
- **Auth** → a real identity provider behind `auth.ts`; roles come from the directory.
