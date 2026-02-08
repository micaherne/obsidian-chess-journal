# CLAUDE.md

Project guidelines for Claude when working on this codebase.

## Commit Messages

- Do not add Co-Authored-By lines or credit Claude in commit messages

## Dependencies

- Use chess.js for all chess logic (parsing, validation, move generation, PGN handling)
- Use cm-chessboard for board rendering
- Do not hand-code functionality that is already handled by dependencies
- Bundle assets from dependencies at build time rather than copying them separately

## Code Style

- Keep solutions simple and focused
- Prefer using library features over custom implementations
