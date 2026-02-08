import { Plugin, PluginSettingTab, App, Setting, TextFileView, WorkspaceLeaf } from "obsidian";
import { Chessboard } from "cm-chessboard";
import { Chess, Move } from "chess.js";
// @ts-ignore - imported as text via esbuild loader
import stauntyPiecesSvg from "cm-chessboard/assets/pieces/staunty.svg";
// @ts-ignore - imported as text via esbuild loader
import standardPiecesSvg from "cm-chessboard/assets/pieces/standard.svg";

const SPRITE_WRAPPER_ID = "chess-journal-sprite";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type PieceSet = "standard" | "staunty";

interface ChessJournalSettings {
	pieceSet: PieceSet;
}

const DEFAULT_SETTINGS: ChessJournalSettings = {
	pieceSet: "standard"
};

const PIECE_SETS: Record<PieceSet, string> = {
	staunty: stauntyPiecesSvg,
	standard: standardPiecesSvg
};

class PgnViewer {
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

const VIEW_TYPE_PGN = "pgn-file-view";

class PgnFileView extends TextFileView {
	getViewType() { return VIEW_TYPE_PGN; }
	getDisplayText() { return this.file?.basename || "PGN"; }

	setViewData(data: string, clear: boolean) {
		this.contentEl.empty();
		this.contentEl.createEl("pre", {
			cls: "chess-journal-pgn-text",
			text: data,
		});
	}

	getViewData() { return this.data; }

	clear() { this.contentEl.empty(); }
}

export default class ChessJournalPlugin extends Plugin {
	private boards: Chessboard[] = [];
	private pgnViewers: PgnViewer[] = [];
	settings: ChessJournalSettings;

	async onload() {
		console.log("Loading Chess Journal plugin");

		await this.loadSettings();
		this.addSettingTab(new ChessJournalSettingTab(this.app, this));

		// Inject the pieces SVG sprite into the document
		this.injectPiecesSprite();

		// FEN code block processor
		this.registerMarkdownCodeBlockProcessor("fen", (source, el, ctx) => {
			const fen = source.trim();

			// Validate the FEN string
			try {
				new Chess(fen);
			} catch (e) {
				el.createEl("div", {
					text: `Invalid FEN: ${fen}`,
					cls: "chess-journal-error"
				});
				return;
			}

			// Create a container for the board
			const container = el.createEl("div", {
				cls: "chess-journal-board"
			});

			// Create the chessboard
			const board = new Chessboard(container, {
				position: fen,
				assetsUrl: "",
				assetsCache: true,
				style: {
					cssClass: "chess-journal",
					showCoordinates: true,
					pieces: {
						file: `pieces/${this.settings.pieceSet}.svg`
					}
				}
			});

			this.boards.push(board);
		});

		// PGN code block processor
		this.registerMarkdownCodeBlockProcessor("pgn", (source, el, ctx) => {
			const pgn = source.trim();

			try {
				const viewer = new PgnViewer(el, pgn, this.settings.pieceSet);
				this.pgnViewers.push(viewer);
			} catch (e) {
				el.createEl("div", {
					text: `Invalid PGN: ${e.message}`,
					cls: "chess-journal-error"
				});
			}
		});

		// PGN file format support
		this.registerView(VIEW_TYPE_PGN, (leaf) => new PgnFileView(leaf));
		this.registerExtensions(["pgn"], VIEW_TYPE_PGN);
	}

	injectPiecesSprite() {
		// Remove existing sprite if present (for reloading with new piece set)
		const existing = document.getElementById(SPRITE_WRAPPER_ID);
		if (existing) {
			existing.remove();
		}

		// Create a hidden wrapper div and inject the SVG (bundled at build time)
		const wrapper = document.createElement("div");
		wrapper.id = SPRITE_WRAPPER_ID;
		wrapper.style.position = "absolute";
		wrapper.style.width = "0";
		wrapper.style.height = "0";
		wrapper.style.overflow = "hidden";
		wrapper.setAttribute("aria-hidden", "true");
		wrapper.innerHTML = PIECE_SETS[this.settings.pieceSet];

		document.body.appendChild(wrapper);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		console.log("Unloading Chess Journal plugin");

		// Remove the injected sprite
		const wrapper = document.getElementById(SPRITE_WRAPPER_ID);
		if (wrapper) {
			wrapper.remove();
		}

		// Clean up all board instances
		for (const board of this.boards) {
			board.destroy();
		}
		this.boards = [];

		// Clean up PGN viewers
		for (const viewer of this.pgnViewers) {
			viewer.destroy();
		}
		this.pgnViewers = [];
	}
}

class ChessJournalSettingTab extends PluginSettingTab {
	plugin: ChessJournalPlugin;

	constructor(app: App, plugin: ChessJournalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Piece set")
			.setDesc("Choose which chess piece style to use")
			.addDropdown(dropdown => dropdown
				.addOption("standard", "Standard")
				.addOption("staunty", "Staunty")
				.setValue(this.plugin.settings.pieceSet)
				.onChange(async (value: PieceSet) => {
					this.plugin.settings.pieceSet = value;
					await this.plugin.saveSettings();
					this.plugin.injectPiecesSprite();
				}));
	}
}
