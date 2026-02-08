import { Chessboard } from "cm-chessboard";
import { Chess, Move } from "chess.js";
import { PieceSet } from "./settings";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export class PgnViewer {
	private board: Chessboard;
	private moves: Move[];
	private comments: Map<string, string>;
	private result: string;
	private currentMoveIndex: number = -1; // -1 = starting position
	private moveElements: HTMLElement[] = [];
	private movesPanel: HTMLElement;

	constructor(
		container: HTMLElement,
		pgn: string,
		pieceSet: PieceSet
	) {
		// Parse the PGN
		const chess = new Chess();
		chess.loadPgn(pgn);
		this.moves = chess.history({ verbose: true });

		// Get comments as a map from FEN to comment
		this.comments = new Map();
		for (const { fen, comment } of chess.getComments()) {
			this.comments.set(fen, comment);
		}

		// Get headers
		const headers = chess.header();
		const white = headers["White"] || "?";
		const black = headers["Black"] || "?";
		const date = headers["Date"] || "";
		this.result = headers["Result"] || "*";

		// Create layout
		const wrapper = container.createEl("div", { cls: "chess-journal-pgn-viewer" });

		// Title
		const title = wrapper.createEl("div", { cls: "chess-journal-title" });
		const players = `${white} vs ${black}`;
		title.createEl("span", { text: players, cls: "chess-journal-players" });
		if (date && date !== "????.??.??") {
			title.createEl("span", { text: ` (${date})`, cls: "chess-journal-date" });
		}

		// Board container
		const boardContainer = wrapper.createEl("div", { cls: "chess-journal-board" });

		// Controls
		const controls = wrapper.createEl("div", { cls: "chess-journal-controls" });

		const startBtn = controls.createEl("button", { text: "«", cls: "chess-journal-btn" });
		const prevBtn = controls.createEl("button", { text: "‹", cls: "chess-journal-btn" });
		const nextBtn = controls.createEl("button", { text: "›", cls: "chess-journal-btn" });
		const endBtn = controls.createEl("button", { text: "»", cls: "chess-journal-btn" });

		startBtn.addEventListener("click", () => this.goToStart());
		prevBtn.addEventListener("click", () => this.goToPrev());
		nextBtn.addEventListener("click", () => this.goToNext());
		endBtn.addEventListener("click", () => this.goToEnd());

		// Moves panel
		this.movesPanel = wrapper.createEl("div", { cls: "chess-journal-moves" });
		this.renderMoves(this.movesPanel);

		// Create the chessboard
		this.board = new Chessboard(boardContainer, {
			position: START_FEN,
			assetsUrl: "",
			assetsCache: true,
			style: {
				cssClass: "chess-journal",
				showCoordinates: true,
				pieces: {
					file: `pieces/${pieceSet}.svg`
				}
			}
		});
	}

	private renderMoves(container: HTMLElement) {
		this.moveElements = [];

		for (let i = 0; i < this.moves.length; i++) {
			const move = this.moves[i];

			// Add move number before white's move
			if (move.color === "w") {
				const moveNum = Math.floor(i / 2) + 1;
				container.createEl("span", {
					text: `${moveNum}.`,
					cls: "chess-journal-move-number"
				});
			}

			const moveEl = container.createEl("span", {
				text: move.san,
				cls: "chess-journal-move"
			});

			moveEl.addEventListener("click", () => this.goToMove(i));
			this.moveElements.push(moveEl);

			// Add comment if present for this position
			const comment = this.comments.get(move.after);
			if (comment) {
				container.createEl("span", {
					text: comment,
					cls: "chess-journal-comment"
				});
			}
		}

		// Add result
		if (this.result && this.result !== "*") {
			container.createEl("span", {
				text: this.result,
				cls: "chess-journal-result"
			});
		}
	}

	private updateBoard() {
		const fen = this.currentMoveIndex < 0
			? START_FEN
			: this.moves[this.currentMoveIndex].after;

		this.board.setPosition(fen, true);

		// Update active move highlighting
		this.moveElements.forEach((el, i) => {
			el.classList.toggle("active", i === this.currentMoveIndex);
		});

		// Scroll active move into view
		if (this.currentMoveIndex >= 0 && this.moveElements[this.currentMoveIndex]) {
			this.moveElements[this.currentMoveIndex].scrollIntoView({ block: "nearest" });
		} else if (this.currentMoveIndex < 0) {
			this.movesPanel.scrollTop = 0;
		}
	}

	goToStart() {
		this.currentMoveIndex = -1;
		this.updateBoard();
	}

	goToEnd() {
		this.currentMoveIndex = this.moves.length - 1;
		this.updateBoard();
	}

	goToPrev() {
		if (this.currentMoveIndex >= 0) {
			this.currentMoveIndex--;
			this.updateBoard();
		}
	}

	goToNext() {
		if (this.currentMoveIndex < this.moves.length - 1) {
			this.currentMoveIndex++;
			this.updateBoard();
		}
	}

	goToMove(index: number) {
		this.currentMoveIndex = index;
		this.updateBoard();
	}

	destroy() {
		this.board.destroy();
	}
}
