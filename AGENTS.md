## Repository layout

This repo contains a hackathon project — **Memory Companion**, a Cloudflare Agents-powered AI companion for people with early memory decline. There are two distinct top-level concerns:

- `memory-companion/` — the actual app. **It is currently the unmodified `cloudflare/agents-starter` template** (a generic chat agent with weather/calculator/scheduling tools). The Memory Companion implementation has not yet been written into it.
- `docs/superpowers/specs/2026-05-01-memory-companion-design.md` — approved design spec (architecture, schema, prompts, scheduling, failure modes).
- `docs/superpowers/plans/2026-05-01-memory-companion.md` — task-by-task implementation plan (file map + checkbox steps + TDD scaffolding for each module).
- `.claude-design/slide-previews/` — deck style explorations (style-a/b/c.html), unrelated to the app.

When asked to "work on the project" or "implement the next task," the plan is the source of truth. The plan explicitly requires execution via the `superpowers:subagent-driven-development` (preferred) or `superpowers:executing-plans` skill — invoke it before touching code.

## Commands

All commands run from `memory-companion/` (it has its own `package.json` and `node_modules`). The repo root has no package manifest.

```bash
npm run dev          # vite dev (Worker + React UI on http://localhost:5173)
npm run deploy       # vite build && wrangler deploy
npm run types        # regenerate worker-configuration.d.ts (env.d.ts) — run after editing wrangler.jsonc
npm run lint         # oxlint src/
npm run format       # oxfmt --write .
npm run check        # oxfmt --check . && oxlint src/ && tsc  (do this before claiming work is done)
npm test             # vitest run
npm run test:watch   # vitest watch mode
npx vitest run tests/path/to/file.test.ts        # single file
npx vitest run -t "describes/it title"           # single test by name
```

Linting/formatting use **oxlint + oxfmt** (Rust-based), not ESLint/Prettier. TypeScript config extends `agents/tsconfig` — don't override unless you know why.

## Architecture (target — what the plan builds toward)

**Two Durable Object classes**, both with SQLite storage:

- `CompanionAgent extends AIChatAgent<Env>` — one DO instance per user. Owns *all* memory (profile, people, events, routines, medications, medication_logs). Handles chat via `onChatMessage`, runs proactive scheduled interactions (morning briefing, evening check-in, medication reminders + 45-min follow-ups), and exposes `@callable()` methods consumed by the caregiver.
- `CaregiverAgent extends Agent<Env>` — Phase C stub. Stores a `linkedUserId`, gets a stub to the patient's `CompanionAgent`, calls callable methods to read/write memory. One-directional dependency: the patient agent has no reference to caregivers.

Bindings (`memory-companion/wrangler.jsonc`):
- `ai: { binding: "AI", remote: true }` — Workers AI, accessed via `createWorkersAI({ binding: env.AI })` from `workers-ai-provider`.
- `durable_objects.bindings`: `CompanionAgent` and `CaregiverAgent`.
- `migrations: [{ tag: "v1", new_sqlite_classes: ["CompanionAgent", "CaregiverAgent"] }]` — required for `this.sql` access.

**Anti-hallucination is the core architectural property.** The system prompt contains only date, name, city — *no* user facts. Every fact lives in SQLite and is reachable only through retrieval tools (`lookupPerson`, `getRecentEvents`, `getTodaySchedule`, `getMedications`). Each tool returns `{ found: false, message: "I don't have that in my memory yet." }` on miss; the model is instructed to use the message verbatim. **Do not move facts into the prompt as a "shortcut" — it defeats the design.**

**Parallel memory extraction.** Every user message triggers two concurrent Workers AI calls: (1) the chat response, (2) a silent extraction pass with write-only tools (`addPerson`, `addEvent`, `saveProfile`, `addMedication`). The extraction call is fire-and-forget — its errors must be swallowed (`.catch(() => {})`) so they never break the chat response.

**Transport adapters are separate from agent logic.** Hackathon UI is the React `useAgentChat` client from the starter. Production target is Telegram via an `onRequest()` handler. The agent is unaware of transport — keep it that way.

**Scheduling is idempotent and DB-driven.** Cron schedules are registered in `onStart()` only if `this.getSchedules()` is empty. Per-medication schedules are created when a medication is added; their schedule IDs are stored in agent state for cancellation. Use `this.broadcast()` (not `saveMessages()`) to notify clients of scheduled-task fires — injecting into chat history causes the model to re-trigger the same task in a loop.

## Hard-won implementation notes (from the plan)

These bite if you skip them:

- **`SELECT` reads are synchronous; `INSERT`/`UPDATE` writes must be `await`ed.** `this.sql` returns a sync iterable for reads but a promise for writes. Forgetting `await` on writes silently drops data.
- **DDL must be inline tagged template literals.** `await this.sql\`CREATE TABLE ...\`` works; passing a raw string via cast does not.
- **Do NOT add `"experimentalDecorators": true` to tsconfig.** `@callable()` uses the standard TC39 stage-3 decorator (already configured in the starter). The legacy flag breaks it.
- **Workers AI model:** the plan targets `@cf/moonshotai/kimi-k2.6`; verify availability in the Cloudflare dash before using. Fallbacks: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, or switch to Anthropic via `@ai-sdk/anthropic` + `ANTHROPIC_API_KEY` secret.
- **AI SDK + data URLs:** the starter's `inlineDataUrls()` helper in `src/server.ts` exists because the SDK's `downloadAssets` step calls `new URL(data)` on file-part strings and tries to HTTP-fetch valid `data:` URIs. Decode to `Uint8Array` before passing through. Preserve this when refactoring.
- **Distress detection runs *before* any AI call** — keyword check on the raw message; on match, emit a fixed response with emergency contacts and skip the model entirely. Don't move this into a tool — it must be unbypassable.

## Demo non-negotiables (per the spec)

The hackathon demo passes only if all of these work:
- Morning briefing fires and reads correctly from SQL
- "What's today?" returns the grounding card
- Medication reminder with acknowledgment buttons (✅ took it / ⏰ later / ❓ not sure)
- Free-text conversation with memory context (retrieval tools called)
- Zero hallucinated facts under any test input

Caregiver summaries, Telegram, and voice-note transcription are explicitly **Phase C** — pitched, not built.
