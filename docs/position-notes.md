# Position Notes

Index-card style notes capturing a specific board position for study, separate from game annotation.

## Concept

Inspired by the study cards used by players like Keres and Polgar: a note focused on a single interesting position, with space for the user's own observations. Unlike a game note, it is not tied to a full game — the position is the subject.

## Note Structure

```markdown
---
fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -"
source: "[[Kasparov vs Karpov (1985.11.28)]]"
tags:
  - position
---

```fen
r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -
```
```

- `fen` — 4-field FEN only (piece placement, side to move, castling, en passant). Halfmove clock and fullmove number are stripped so the same position matches regardless of when it occurred in a game.
- `source` — wikilink to the game note the position came from, if one exists. Omitted for standalone notes.
- `tags: [position]` — distinguishes position notes from game notes.
- The `fen` code block renders the board interactively using the existing renderer.

## Triggering

A button in the game viewer controls bar, next to the existing copy FEN button. Available whenever a game is open and the viewer is at any position.

## Filename & Creation Flow

1. Name is auto-generated: `Position from {White} vs {Black} ({Date}).md`
2. Same filename sanitisation and collision handling as game notes.
3. Note is immediately opened in a new tab — the auto-generated name is a placeholder the user is expected to rename.
4. Saved to the same notes folder as game notes.

## Implementation

### New files

- `src/createPositionNote.ts` — takes a FEN and optional source game path, normalises the FEN, builds frontmatter and body, writes the file. Mirrors `createGameNote.ts`.

### Changed files

- `src/GameView.ts` — add "create position note" button to the controls bar, call `onCreatePositionNote()` on click.
- `src/main.ts` — wire up the handler that calls `createPositionNote` with vault access and passes it through to GameView.

## Future

- Standalone creation via command palette (prompt for FEN, no source game).
