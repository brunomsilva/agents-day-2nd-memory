# UI Redesign — Elder-Friendly Lavender Theme

**Date:** 2026-05-01
**Status:** Approved

## Goal

Restyle the Memory Companion chat UI with a pastel lavender color scheme, elder-friendly typography, and large intuitive action buttons inspired by Apple's design language. No feature changes — full feature set preserved.

## Approach

Option B: CSS variable overrides + targeted component/Tailwind tweaks.

- Override Kumo's CSS custom properties with a lavender palette so all Kumo components inherit the new colors automatically.
- Add a custom lavender palette to Tailwind via `@theme` in `styles.css`.
- Override font sizes globally in `@layer base`.
- Restyle `NotificationCard` action buttons in `app.tsx` to be large, vertical-stack, Apple action-sheet style.

Two files change: `styles.css` and `app.tsx`. No new dependencies.

## Color System

### Light Mode

| Role | Token | Value | Notes |
|------|-------|-------|-------|
| Base background | `--kumo-bg-base` | `#F5F0FF` | Soft lavender white |
| Elevated background | `--kumo-bg-elevated` | `#EDE8FF` | Slightly deeper lavender |
| Brand/accent | `--kumo-brand` | `#7C5CBF` | AA contrast on light bg |
| Line/border | `--kumo-line` | `#D4C8F0` | Muted lavender |
| Default text | `--kumo-text-default` | `#1A1035` | Near-black with purple undertone |
| Secondary text | `--kumo-text-secondary` | `#6B5B95` | Purple-tinted secondary |
| Success | `--kumo-success` | `#4CAF82` | Vivid, unchanged for clarity |
| Danger | `--kumo-danger` | `#E05C7A` | Vivid, unchanged |
| Warning | `--kumo-warning` | `#E8A84A` | Vivid, unchanged |

### Dark Mode (`[data-mode="dark"]`)

| Role | Token | Value |
|------|-------|-------|
| Base background | `--kumo-bg-base` | `#1E1A2E` |
| Elevated background | `--kumo-bg-elevated` | `#16122A` |
| Brand/accent | `--kumo-brand` | `#A78BFA` |
| Line/border | `--kumo-line` | `#3D3560` |
| Default text | `--kumo-text-default` | `#EDE8FF` |
| Secondary text | `--kumo-text-secondary` | `#A09ABD` |

## Typography

Applied globally in `@layer base` on `html` and `body`.

| Element | Size | Weight | Line-height |
|---------|------|--------|-------------|
| Base body | 18px | 400 | 1.7 |
| Assistant messages (`.sd-theme`) | 19px | 400 | 1.75 |
| User message bubbles | 18px | 500 | 1.6 |
| Header / app title | 22px | 600 | — |
| Button labels | 16px | 600 | — |
| Badge / secondary (tool names, timestamps) | 14px | 400 | — with `letter-spacing: 0.02em` |
| Input / textarea | 18px | 400 | 1.6 |

**Font stack:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif` — uses the Apple system font on macOS/iOS, Segoe UI on Windows. No external font download required.

## Action Buttons

### NotificationCard (medication reminders, briefings)

- Layout: `flex-col gap-3 w-full` — vertical stack, no buttons crowding each other
- Each button: minimum `56px` tall, `border-radius: 14px` (rounded-2xl), `font-size: 17px`, `font-weight: 600`, full width of the notification card container
- Primary actions (e.g. "✅ Took it"): lavender brand fill, white text
- Secondary actions (e.g. "⏰ Later", "❓ Not sure"): white/light fill, lavender border, purple text
- Dismiss button (no-action notifications): secondary variant, same large style
- Card itself: `padding: 20px`, `border-radius: 20px`, `bg-purple-50` light / `bg-purple-950/30` dark

### Input area send/stop buttons

- Minimum `40×40px` hit area
- Brand lavender color for send button

## Files Changed

| File | Change |
|------|--------|
| `memory-companion/src/styles.css` | Lavender palette via `@theme`, Kumo token overrides, global font rules |
| `memory-companion/src/app.tsx` | `NotificationCard` button layout + sizing, send/stop button sizing |

## Non-goals

- No layout restructure
- No removal of debug controls, theme toggle, or any existing features
- No new component library or font download
- No changes to agent logic, server code, or wrangler config
