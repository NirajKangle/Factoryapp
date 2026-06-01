# Frontend setup (React + TypeScript + Tailwind + shadcn)

The Flask app originally used `templates/index.html` only. The React UI lives in `frontend/` and builds into `static/dist/`, which Flask serves automatically when present.

## Prerequisites

Install **Node.js LTS** (includes npm): https://nodejs.org/

Verify:

```powershell
node -v
npm -v
```

## Project structure (shadcn conventions)

```
frontend/
  components.json          # shadcn CLI config
  src/
    components/
      ui/                  # shadcn UI primitives (required path)
        badge.tsx
        status.tsx
        card.tsx
        avatar.tsx
        kanban-board.tsx   # job pipeline kanban (wired to Flask API)
    lib/
      utils.ts             # cn() helper used by all shadcn components
      job-status.ts        # maps shop stages → Status visuals
    App.tsx                # job tracker UI
    index.css              # Tailwind + shadcn CSS variables
```

### Why `src/components/ui`?

shadcn expects UI primitives under **`components/ui`**. The CLI installs Badge, Button, etc. there, and imports use `@/components/ui/...`. Keeping this path means:

- Future `npx shadcn@latest add ...` commands work without reconfiguration
- Shared `cn()` utility and Tailwind tokens stay consistent
- Components compose predictably (`Status` imports `Badge` from the same folder)

The `@/` alias maps to `src/` (see `vite.config.ts` and `tsconfig.app.json`).

## Install dependencies

```powershell
cd frontend
npm install
```

Installed packages include:

- `class-variance-authority` — Badge variants (required by shadcn Badge)
- `clsx` + `tailwind-merge` — `cn()` utility
- `lucide-react` — icons in the job tracker header/cards
- `tailwindcss`, `postcss`, `autoprefixer`, `tailwindcss-animate`

## Optional: initialize via shadcn CLI

If starting fresh elsewhere, you can scaffold with:

```powershell
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npx shadcn@latest init
npx shadcn@latest add badge
```

Then paste `status.tsx` into `src/components/ui/`.

This repo already contains the files above, so CLI init is optional.

## Development (recommended)

Terminal 1 — Flask API:

```powershell
cd C:\Users\welln\Factoryapp
python app.py
```

Terminal 2 — Vite dev server (proxies `/api` and `/jobs` to Flask):

```powershell
cd frontend
npm run dev
```

Open http://localhost:5173

## Production build

```powershell
cd frontend
npm run build
cd ..
python app.py
```

Open http://127.0.0.1:5000 — Flask serves `static/dist/index.html`.

If you have not built yet, Flask falls back to `templates/index.html`.

## Status component usage in this app

Shop pipeline stages map to Status visuals in `src/lib/job-status.ts`:

| Job stage  | Status variant |
|-----------|----------------|
| Pre-Work  | `maintenance`  |
| Machining | `online`       |
| QC        | `degraded`     |
| Dispatch  | `online`       |

Each job card and column header uses `<Status>`, `<StatusIndicator>`, and `<StatusLabel>` from `@/components/ui/status`.
