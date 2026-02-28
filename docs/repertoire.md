# Opening Repertoire

## Overview

A repertoire is a personal opening book stored as a `.repertoire` file (JSON). Multiple repertoires can coexist in the vault. Clicking a `.repertoire` file opens it as a full editor tab (like canvas). Each repertoire is associated with a colour (white or black), which determines which moves are "yours" at each position.

The primary use case is browsing and reference — your own bespoke opening book. Lines are added either by dragging pieces on an interactive board or by right-clicking nodes in the Opening Explorer move tree.

---

## File Format

Extension: `.repertoire` — registered with Obsidian via `registerExtensions`.

```json
{
  "version": 1,
  "color": "black",
  "root": {
    "san": null,
    "epd": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    "noteFile": null,
    "children": [
      {
        "san": "e4",
        "epd": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
        "noteFile": null,
        "children": [
          {
            "san": "e6",
            "epd": "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
            "noteFile": "Openings/Repertoire/French Defense.md",
            "children": []
          }
        ]
      }
    ]
  }
}
```

`epd` is the first four fields of the FEN (position, side to move, castling, en passant). It uniquely identifies the position and is computed via chess.js during line entry.

---

## Data Types

### `src/RepertoireTypes.ts` (new file)

```typescript
export interface RepertoireNode {
  san: string | null;       // null for the root node
  epd: string;              // first 4 FEN fields — position identity
  noteFile: string | null;  // vault-relative path to linked markdown note
  children: RepertoireNode[];
}

export interface RepertoireData {
  version: 1;
  color: "white" | "black";
  root: RepertoireNode;
}
```

---

## Files to Create

### `src/RepertoireTypes.ts`
Types only (see above).

### `src/RepertoireView.ts`

Extends `TextFileView` (not `ItemView`) so Obsidian handles file read/write, dirty tracking, and save automatically.

```
export const VIEW_TYPE_REPERTOIRE = "chess-journal-repertoire";

export class RepertoireView extends TextFileView {
  constructor(leaf: WorkspaceLeaf, private settings: ChessJournalSettings) { ... }

  getViewType()    { return VIEW_TYPE_REPERTOIRE; }
  getDisplayText() { return this.file?.basename ?? "Repertoire"; }
  getIcon()        { return "book-marked"; }

  setViewData(data: string, clear: boolean): void  // parse JSON → this.repertoire
  getViewData(): string                            // JSON.stringify(this.repertoire, null, 2)
  clear(): void                                    // reset state
}
```

**Private state:**
```typescript
private repertoire: RepertoireData;
private currentPath: string[];   // SAN sequence from root to current node
private viewMode: "board" | "tree" = "board";
private chess = new Chess();     // tracks position at currentPath
private board: Chessboard | null = null;
private boardRafId: number | null = null;
```

**`setViewData`** parses the JSON and calls `render()`. If the file is new/empty it initialises a default `RepertoireData` (prompting for colour via a modal, or deriving from the filename).

**`getViewData`** serialises `this.repertoire` to JSON.

**`requestSave()`** is called whenever the tree is mutated (new node added, note linked).

---

#### Board View Layout

```
[Toolbar: board-icon | tree-icon]
─────────────────────────────────────
[Breadcrumb: Start › 1. e4 › 1...e6]   (each crumb is clickable)
[Chessboard — full-width, interactive]
─────────────────────────────────────
Opponent's moves:           (or "Your moves:" when it's your turn)
  1. e4   1. d4   1. c4     (clickable; navigates into the tree)
─────────────────────────────────────
[Note content rendered here]
[+ Add note]  (if no note linked)
```

The board is oriented based on repertoire colour (Black repertoire → board flipped).

**Determining whose turn it is**: ply count of `currentPath` + repertoire colour determines whether the current position is "your" turn or the opponent's turn. This controls:
- Which colour label appears above the continuations list
- Which colour piece dragging is enabled for on the board
- Visual styling of move chips

**Multiple "your" moves**: the continuations list shows all children regardless — there is no artificial limit. The visual distinction (your moves vs opponent moves) is purely cosmetic.

---

#### Board Interaction (cm-chessboard input API)

Enable move input for the side to move using `board.enableMoveInput(callback, color)`. In the callback:

- `INPUT_EVENT_TYPE.moveInputStarted` — return `true` to allow dragging from that square (validate there is a legal move)
- `INPUT_EVENT_TYPE.validateMoveInput` — call `chess.move({ from, to, promotion })`:
  - If illegal: return `false` (piece snaps back)
  - If legal: check whether this SAN exists in `currentNode.children`
    - **Exists** → navigate to it (push SAN to `currentPath`, re-render)
    - **New** → compute EPD from `chess.fen()`, add `RepertoireNode` to children, navigate, call `this.requestSave()`

On re-render the board is destroyed and recreated via `requestAnimationFrame` (same pattern as `OpeningExplorerView`).

---

#### Tree View

Read-only. Same render pattern as the ECO move tree in `OpeningExplorerView`:
- Collapsible nodes
- Your moves (colour + ply parity) visually distinct from opponent moves
- Clicking a node sets `currentPath` to that node's full path and switches to board view

Helper: walk the tree to reconstruct the full SAN path to any node (needed when the user clicks a tree node to navigate).

---

#### Note Section

When a note is linked (`currentNode.noteFile !== null`):
1. Resolve the file: `this.app.vault.getFileByPath(noteFile)`
2. Read content: `await this.app.vault.read(file)`
3. Render: `await MarkdownRenderer.render(this.app, content, noteEl, file.path, this)`

When no note is linked:
- Show an "+ Add note" button
- On click: call `createRepertoireNote(...)`, link the returned `TFile` path into `currentNode.noteFile`, call `this.requestSave()`, open the note in a split leaf

A "link existing note" option (file picker) can be added later — for now, create-new is sufficient.

---

### `src/createRepertoireNote.ts`

Mirrors `createPositionNote.ts`. Creates a markdown file with front matter and opens it.

```typescript
export async function createRepertoireNote(
  app: App,
  folder: string,
  epd: string,
  repertoireName: string,
  eco: string | null,
  openingName: string | null,
): Promise<TFile>
```

Front matter:
```yaml
epd: "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -"
eco: "C00"              # omitted if unknown
opening: "French Defense"  # omitted if unknown
repertoire: "My Black Repertoire"
tags:
  - repertoire-note
```

File name: `sanitizeFilename(epd.split(" ")[0]) + ".md"` (just the piece placement part, which is human-readable enough and unique per position).

Folder creation and collision handling follow the same pattern as `createGameNote.ts`.

---

### `src/NewRepertoireModal.ts`

A simple `Modal` subclass shown by the "Create new repertoire" command.

Fields:
- **Name** — text input (becomes the filename: `{name}.repertoire`)
- **Colour** — toggle/dropdown: White / Black

On confirm:
1. Build initial `RepertoireData` with an empty root node and the chosen colour
2. Create the file in the vault (in `settings.repertoireNotesFolder` if set, otherwise vault root)
3. Open it with `app.workspace.getLeaf().openFile(file)`

---

## Files to Modify

### `src/main.ts`

- Import `VIEW_TYPE_REPERTOIRE`, `RepertoireView`
- In `onload()`:
  - `this.registerView(VIEW_TYPE_REPERTOIRE, (leaf) => new RepertoireView(leaf, this.settings))`
  - `this.registerExtensions(["repertoire"], VIEW_TYPE_REPERTOIRE)`
  - Add command `"create-repertoire"` / "Create new repertoire" → `new NewRepertoireModal(this.app, this.settings).open()`
- In `onunload()`: `this.app.workspace.detachLeavesOfType(VIEW_TYPE_REPERTOIRE)`

### `src/settings.ts`

- Add `repertoireNotesFolder: string` to `ChessJournalSettings` interface
- Add `repertoireNotesFolder: ""` to `DEFAULT_SETTINGS`
- Add "Repertoire notes folder" `Setting` in `ChessJournalSettingTab.display()`, following the existing folder setting pattern

### `src/OpeningExplorerView.ts`

Add right-click context menu to move tree nodes.

**Imports to add**: `Menu` from `"obsidian"`, `RepertoireData` from `"./RepertoireTypes"`.

**In `renderMoveNode`**, attach a `contextmenu` listener to `header`:

```typescript
header.addEventListener("contextmenu", (e: MouseEvent) => {
  e.preventDefault();
  const repFiles = this.app.vault.getFiles()
    .filter(f => f.extension === "repertoire");
  if (repFiles.length === 0) return;

  const menu = new Menu();
  for (const repFile of repFiles) {
    menu.addItem(item =>
      item
        .setTitle(`Add to ${repFile.basename}`)
        .setIcon("plus")
        .onClick(() => this.addLineToRepertoire(node.moves, repFile))
    );
  }
  menu.showAtMouseEvent(e);
});
```

**`addLineToRepertoire(moves: string[], repFile: TFile)`**:
1. Read and parse the `.repertoire` file
2. Initialise a `Chess` instance and walk `repertoire.root.children`, following each SAN in `moves`
3. For each move not yet in the tree: compute EPD via `chess.fen()`, push a new `RepertoireNode` into the current node's children
4. Write back: `await this.app.vault.modify(repFile, JSON.stringify(data, null, 2))`

This is safe to call when part of the line already exists — it only adds the missing suffix.

**`getEcoForEpd(epd: string)`** (optional helper): look up `ECO_DATA` to find the ECO code and name for the position, for populating note front matter. Already available since `ECO_DATA` is module-level.

### `styles.css`

New classes following `.chess-journal-*` convention:

| Class | Purpose |
|---|---|
| `.chess-journal-rep-toolbar` | Mode toggle bar (board/tree icons) |
| `.chess-journal-rep-mode-btn` | Icon button in toolbar; `.is-active` variant |
| `.chess-journal-rep-breadcrumb` | Breadcrumb row |
| `.chess-journal-rep-crumb` | Individual clickable breadcrumb segment |
| `.chess-journal-rep-crumb-sep` | Separator `›` between crumbs |
| `.chess-journal-rep-board-wrap` | Board container, `width: 100%; aspect-ratio: 1` |
| `.chess-journal-rep-continuations` | Section below board listing next moves |
| `.chess-journal-rep-section-label` | "Opponent's moves" / "Your moves" label |
| `.chess-journal-rep-move-chip` | Clickable move button |
| `.chess-journal-rep-move-chip.is-mine` | Your moves — accent colour |
| `.chess-journal-rep-note-section` | Note content area |
| `.chess-journal-rep-add-note-btn` | "+ Add note" button |
| `.chess-journal-rep-tree` | Tree view container |
| `.chess-journal-rep-tree-node` | Move row in tree |
| `.chess-journal-rep-tree-node.is-mine` | Your move in tree — visually distinct |

---

## Verification

1. "Create new repertoire" command → modal → enter "My Black Repertoire", colour Black → `My Black Repertoire.repertoire` created → opens as a tab in the editor
2. Board view shows the starting position flipped (black at bottom)
3. Drag a white piece on the board → move added as a child of root → board advances to new position
4. Drag a black piece in response → move added → board advances again
5. Breadcrumb shows `Start › 1. e4 › 1...e6`; click `Start` → returns to root
6. Right-click a node in the Opening Explorer move tree → context menu → "Add to My Black Repertoire" → the full line is added → navigable from the repertoire view
7. At any position, click "+ Add note" → note created in configured folder with correct front matter → note content renders inline below the board on return
8. Tree view → shows collapsible lines, your moves visually distinct → click a node → switches to board view at that position
9. Settings → "Repertoire notes folder" field visible and saves correctly
