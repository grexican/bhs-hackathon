# Client

React 18 + Vite + TypeScript. The UI students see in their browser.

## Run

```bash
# from the repo root
npm run dev:client     # just the client
npm run dev            # client + server together
```

Client opens at http://localhost:5173.

## What's here

```
apps/client/
├── index.html             # entry HTML — Vite serves this
├── src/
│   ├── main.tsx           # mounts <App /> into #root
│   ├── App.tsx            # the page — edit this to change the demo
│   ├── api.ts             # fetch wrapper + shared types
│   ├── styles.css         # plain CSS, no framework
│   ├── components/
│   │   ├── TodoForm.tsx
│   │   ├── TodoForm.test.tsx
│   │   └── TodoList.tsx
│   └── hooks/
│       └── useTodos.ts    # custom hook — copy this pattern for your own resource
└── vite.config.ts         # /api/* is proxied to the server in dev
```

## Add a new page or feature

The fastest path is to **edit `App.tsx`** directly. For larger changes:

1. **Add a component** under `src/components/`. One file per component, named after the component (e.g. `Flashcard.tsx`).
2. **If you need server data**, write a custom hook under `src/hooks/` that mirrors `useTodos.ts` — fetch on mount, expose actions.
3. **Hit the API** via the `api` wrapper in `src/api.ts` (don't call `fetch` directly — the wrapper handles JSON parsing and errors).
4. **Style** in `styles.css`. Keep class names BEM-ish (`block__element--modifier`) so they're easy to find.

## Why no router

A single page is enough for most 24-hour hackathon apps. If you genuinely need multiple URLs, install `react-router-dom` — it's the standard pick. Tell Claude "add react-router with two pages" and it'll wire it up.

## Why no Tailwind

CSS is faster to learn for non-coders than Tailwind, and a 24-hour app doesn't accumulate enough utility-class surface to make Tailwind pay off. If you want Tailwind anyway, tell Claude "set up Tailwind in apps/client" and it'll handle the install.
