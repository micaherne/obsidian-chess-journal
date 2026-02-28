# Opening Explorer View — Implementation Plan

## Context
The plugin already captures ECO codes in game note front matter when importing from external sources. This adds an Opening Explorer sidebar view that lets users browse the ECO opening taxonomy and find or create notes tagged with each opening code.

The view is designed as a browseable tree for now, with the architecture kept clean enough that a future board view (showing the position at each opening) can be added as a toggle later — the ECO data will already include EPD (FEN-like) position strings.

---

## ECO Data Source
Lichess publishes opening data at `github.com/lichess-org/chess-openings` (CC0 license). The `dist/` TSV files (a.tsv–e.tsv) have columns: `eco`, `name`, `pgn`, `uci`, `epd`. There are ~3,600 entries total.

**Strategy:** Write a one-time generation script, run it, and commit the resulting `src/eco-data.json` to the repo. No network access needed during normal builds.

---

## Files to Create

### `scripts/generate-eco-data.ts`
Node script that:
- Fetches `https://raw.githubusercontent.com/lichess-org/chess-openings/master/dist/{a-e}.tsv`
- Parses each TSV (tab-separated, first row is header)
- Outputs `src/eco-data.json` as `EcoEntry[]`

```typescript
interface EcoEntry {
  eco: string;   // "B01"
  name: string;  // "Scandinavian Defense: Icelandic-Palme Gambit"
  pgn: string;   // "1. e4 d5 2. exd5 Nf6 3. c4 e6"
  epd: string;   // EPD position string (for future board view)
}
```

### `src/eco-data.json`
Generated and committed. Imported by the view at runtime.

### `src/OpeningExplorerView.ts`
Main view file (see below).

### `src/createOpeningNote.ts`
Mirrors `createGameNote.ts`/`createPositionNote.ts` pattern:
```typescript
export async function createOpeningNote(
  app: App,
  folder: string,
  eco: string,
  openingName: string
): Promise<TFile>
```
- Front matter: `eco: "B01"`, `opening: "Scandinavian Defense"`, `tags:\n  - opening`
- File name: `sanitizeFilename(eco + " " + openingName) + ".md"`
- Body: `# B01 – Scandinavian Defense\n\n` (user fills in their notes)
- Folder creation + collision handling same as `createGameNote.ts`

---

## Files to Modify

### `src/settings.ts`
- Add `openingsFolder: string` to `ChessJournalSettings` interface
- Add `openingsFolder: ""` to `DEFAULT_SETTINGS`
- Add a `Setting` for "Openings folder" in `ChessJournalSettingTab.display()`, following the same pattern as the existing "Games folder" and "Positions folder" settings (lines 112–132)

### `src/main.ts`
- Import `VIEW_TYPE_OPENING_EXPLORER`, `OpeningExplorerView`
- In `onload()`: register view, add ribbon icon (`"book-open"`, "Opening Explorer"), add command `"open-opening-explorer"`
- In `onunload()`: `detachLeavesOfType(VIEW_TYPE_OPENING_EXPLORER)`
- Ribbon/command pattern: identical to the existing `VIEW_TYPE_DATABASE` block (lines 99–128)

### `styles.css`
Add styles following the existing `.chess-journal-*` naming pattern. Key classes:
- `.chess-journal-explorer` — flex column container, full height
- `.chess-journal-explorer-search` — full-width search input
- `.chess-journal-explorer-tree` — scrollable flex-grow area
- `.chess-journal-explorer-letter` — letter group header (bold, sticky)
- `.chess-journal-explorer-code-row` — clickable ECO code row with toggle arrow, uses same hover/selected pattern as `.chess-journal-db-row`
- `.chess-journal-explorer-badge` — note count pill (muted color)
- `.chess-journal-explorer-detail` — expanded panel showing variations list, notes list, create button
- `.chess-journal-explorer-note-link` — clickable note name, opens file

---

## OpeningExplorerView Design

```typescript
export const VIEW_TYPE_OPENING_EXPLORER = "chess-journal-opening-explorer";

export class OpeningExplorerView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private settings: ChessJournalSettings) { ... }

  getViewType() { return VIEW_TYPE_OPENING_EXPLORER; }
  getDisplayText() { return "Opening Explorer"; }
  getIcon() { return "book-open"; }

  async onOpen() { this.render(); }
  async onClose() {}
  getState() { return { expandedCode, searchQuery }; }
  async setState(state, result) { /* restore + re-render */ }
}
```

**Internal data model** (computed once on open from `eco-data.json`):
```
letterGroups: Map<string, Map<string, EcoEntry[]>>
  "B" → Map {
    "B01" → [
      { eco: "B01", name: "Scandinavian Defense", pgn: "1. e4 d5", epd: "..." },
      { eco: "B01", name: "Scandinavian Defense: Icelandic-Palme Gambit", ... },
      ...
    ]
  }
```

**Rendered tree:**
```
[Search...                      ]
─────────────────────────────────
▶ A  Flank Openings
▶ B  Semi-Open Games
▼ C  Open Games & French Defense
    ▶ C00  King's Pawn Opening
    ▼ C01  French Defense: Exchange   [2 notes]
         French Defense: Exchange Variation  (1. e4 e6 2. d4 d5 3. exd5)
         French Defense: Exchange, Spassky Variation  (1. e4 e6 ...)
         ── Notes ──
         [📄 French Defense notes]   ← opens file
         [📄 C01 exchange ideas]
         [+ Create opening note]
    ▶ C02  French Defense: Advance
▶ D  Closed & Semi-Closed Games
▶ E  Indian Defenses
```

**Vault note lookup** (called when a code row is expanded):
```typescript
private getNotesForEco(eco: string): TFile[] {
  return this.app.vault.getMarkdownFiles().filter(f => {
    const cache = this.app.metadataCache.getFileCache(f);
    return cache?.frontmatter?.eco === eco;
  });
}
```
Called only on expand, so iterating all markdown files is fine.

**Search behaviour:** Filters the tree to ECO codes whose code or any variation name contains the query (case-insensitive). Matching codes are auto-expanded. Letter groups with no matches are hidden.

**State persistence:** `getState()`/`setState()` save `expandedCode: string | null` (at most one code expanded at a time) and `searchQuery`.

**ECO letter group names:**
- A: Flank Openings
- B: Semi-Open Games
- C: Open Games & French Defense
- D: Closed & Semi-Closed Games
- E: Indian Defenses

---

## Build: Adding the generate script

Add to `package.json` scripts:
```json
"generate-eco": "npx ts-node scripts/generate-eco-data.ts"
```

The script is run once by the developer; `src/eco-data.json` is committed. The regular `build` and `dev` scripts are unchanged — esbuild will bundle the JSON import automatically.

---

## Verification
1. Run `node scripts/generate-eco-data.ts` → `src/eco-data.json` created with ~3,600 entries
2. `npm run build` → compiles without errors
3. Open Obsidian, click ribbon icon → Opening Explorer panel opens in right sidebar
4. Type "Sicilian" in search → tree filters to B20–B99 codes
5. Click a code row → expands to show variations; notes with matching `eco` front matter are listed
6. Click a note link → opens the note in the editor
7. Click "+ Create opening note" → note created in openingsFolder with `eco` and `opening` front matter; note opens in editor
8. Settings tab → "Openings folder" field visible and saves correctly
