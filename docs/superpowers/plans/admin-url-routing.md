# Plan: Replace Admin Toggle with URL-Based Routing

## Context

The admin/caregiver dashboard is currently accessible via a React state toggle (two buttons, fixed top-right). The user wants `/` for the chat view and `/admin` for the admin dashboard — proper URL-based navigation without a toggle button.

No new dependencies needed. The History API handles it natively.

## No Config Changes Required

- `wrangler.jsonc` already has `"not_found_handling": "single-page-application"` and `"run_worker_first": ["/agents/*"]` — `/admin` gets SPA fallback automatically in production.
- Vite dev server already handles SPA fallback for unknown paths.
- `server.ts` is unaffected — `routeAgentRequest` only intercepts `/agents/*`.

**Only file to edit: `src/app.tsx`**

## Implementation (5 targeted edits in `src/app.tsx`)

### 1. Replace `AppView` type + `useState` with URL-driven state

Remove:
```ts
type AppView = "chat" | "admin";
// inside App():
const [view, setView] = useState<AppView>("chat");
```

Add before `App()`:
```ts
function getView(): "chat" | "admin" {
  return window.location.pathname === "/admin" ? "admin" : "chat";
}
```

Replace the `useState` call:
```ts
const [view, setView] = useState<"chat" | "admin">(getView);
```

(`getView` passed by reference so React calls it once at mount to seed from the current URL.)

### 2. Add `popstate` listener for back/forward support

Add immediately after the `useState` call (inside `App`):
```ts
useEffect(() => {
  const onPopState = () => setView(getView());
  window.addEventListener("popstate", onPopState);
  return () => window.removeEventListener("popstate", onPopState);
}, []);
```

### 3. Update Chat button `onClick`

```ts
onClick={() => {
  history.pushState(null, "", "/");
  setView("chat");
}}
```

### 4. Update Admin button `onClick`

```ts
onClick={() => {
  history.pushState(null, "", "/admin");
  setView("admin");
}}
```

### 5. The view-conditional render — no change needed

```tsx
{view === "chat" ? <Chat /> : <AdminDashboard />}
```

## Critical File

- `memory-companion/src/app.tsx` — all 5 edits here

## Verification

1. `npm run dev` → visit `http://localhost:5173/` — chat view loads
2. Navigate directly to `http://localhost:5173/admin` — admin view loads (no 404)
3. Click Admin button → address bar shows `/admin`, admin view renders
4. Click Chat button → address bar shows `/`, chat view renders
5. Use browser Back/Forward → URL and view stay in sync (tests `popstate` handler)
6. Refresh on `/admin` → admin view loads immediately (no flicker to chat)
7. Send a chat message → WebSocket to agent still works (unaffected by routing change)
