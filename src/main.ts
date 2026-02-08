import { Plugin } from "obsidian";
import { Chessboard } from "cm-chessboard";
import { Chess } from "chess.js";
// @ts-ignore - imported as text via esbuild loader
import stauntyPiecesSvg from "cm-chessboard/assets/pieces/staunty.svg";
// @ts-ignore - imported as text via esbuild loader
import standardPiecesSvg from "cm-chessboard/assets/pieces/standard.svg";

import { PieceSet, ChessJournalSettings, DEFAULT_SETTINGS, ChessJournalSettingTab } from "./settings";
import { PgnViewer } from "./PgnViewer";
import { VIEW_TYPE_PGN, PgnFileView } from "./PgnFileView";

const SPRITE_WRAPPER_ID = "chess-journal-sprite";

const PIECE_SETS: Record<PieceSet, string> = {
	staunty: stauntyPiecesSvg,
	standard: standardPiecesSvg
};

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
