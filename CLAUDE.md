# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # start dev server
bun run build        # production build
bun run preview      # preview production build
bun run check        # svelte-check + TypeScript
bun run check:watch  # watch mode
bun run lint         # prettier --check + eslint
bun run format       # prettier --write
```

There is no test suite configured.

## Architecture

This is a **SvelteKit** single-page app (Svelte 5 with runes) modeled after LoiLoNote — a Japanese educational card-canvas tool.

### Two-layer view model

The entire app is a single route (`src/routes/+page.svelte`). `viewMode` state switches between two full-screen layers:

1. **`canvas`** — `NoteCanvas.svelte`: infinite pan/zoom canvas where `Card` objects are positioned absolutely. An SVG overlay renders `Connector` lines between cards. All pointer interaction (drag, pan, zoom, connector drawing, inline text edit) is handled in this component.

2. **`editor`** — `CardEditor.svelte`: full-screen Fabric.js canvas for rich editing of a single card (pen, highlighter, eraser, shapes, text). On back/Escape, serialises the Fabric canvas to JSON and calls `onSave`.

### State ownership

All mutable state (`notes`, `currentNoteId`, `viewMode`, `editingCardId`, `selectedCardId`) lives in `+page.svelte`. Components receive data as props and communicate upward through typed callback props (`onCardMove`, `onCardOpen`, `onSave`, etc.). Components never mutate shared state directly.

### Data model (`src/lib/types/index.ts`)

- `Note` — top-level document: contains arrays of `Card` and `Connector`, plus trash/folder metadata.
- `Card` — positioned rectangle on the canvas. `type` is `'text' | 'image' | 'pdf'`. `editorData` holds serialised Fabric.js JSON (null until the card has been opened in the editor).
- `Connector` — a directed edge between two card IDs, rendered as a yellow arrow.

### Persistence (`src/lib/utils/db.ts`)

Uses **IndexedDB** via `idb` with an in-memory `Map` fallback. The `useMemory` flag at the top of the file controls which path is active — it is currently set to `true` (in-memory only) for sandboxed deploy environments. Set it to `false` for full local persistence. Data is auto-saved every 5 s and on explicit Ctrl+S. Export/import is plain JSON (`version: 3`).

### Styling

Uses **Master CSS** (`@master/css`) — an atomic CSS-in-JS framework configured in `master.css.ts`. Styles are written as space-separated utility class strings directly in the markup (e.g. `"d:flex ai:center gap:8px"`), not Tailwind.

Design tokens are CSS variables defined in `master.css.ts` and referenced with the `$` sigil in classes (e.g. `bg:$sb-bg`). Light/dark mode is toggled by adding/removing the `dark` class on `<html>`. Key tokens:

| Token | Purpose |
|---|---|
| `cv-bg` | Canvas background (navy) |
| `sb-bg / sb-bd / sb-tx / sb-ih` | Sidebar surface/border/text/hover |
| `hd-bg / hd-tx` | Header bar |
| `ed-bg / edtb-bg / edtb-bd` | Card editor surface/toolbar |
| `pri` | Primary accent (`#4a90d9`) |
| `conn` | Connector arrow colour (yellow `#f5c542`) |
| `sel` | Card selection border |
| `tx / sf / bd` | Body text / surface / border |

### Key dependencies

- **Fabric.js** (`fabric` v7) — powers the card editor canvas: free drawing, IText, shapes, undo/redo stack.
- **pdf.js** (`pdfjs-dist`) — renders PDF pages to canvas data URLs on import.
- **idb** — IndexedDB wrapper for note persistence.
- **uuid** — generates card/note/connector IDs.
- **jsPDF** — available but not yet wired into the UI.

## Conventions

- **Svelte 5 runes** — use `$state`, `$derived`, `$props`, `$effect`. Do not use the legacy `export let` / reactive `$:` syntax.
- **No comments on obvious code** — the existing codebase is largely comment-free; match that style.
- **Japanese UI strings** — all visible labels and tooltips are in Japanese (e.g. `テキスト`, `削除`, `戻る`). Keep new UI strings in Japanese.
- **Card colors** — use the `CARD_COLORS` palette from `src/lib/types/index.ts` rather than ad-hoc hex values.
- **Double-click detection** — `NoteCanvas` implements its own double-click via two single-click events within 400 ms (native `dblclick` is unreliable on pointer-captured elements).
- **`useMemory` flag** — when adding persistence features, respect the in-memory fallback path; both `db` (IndexedDB) and `mem*` (Map) branches must stay in sync.
