import { Plugin } from "obsidian";
import { Chessboard } from "cm-chessboard";
import { Chess } from "chess.js";
// @ts-ignore - imported as text via esbuild loader
import piecesSvg from "cm-chessboard/assets/pieces/staunty.svg";

const SPRITE_WRAPPER_ID = "chess-journal-sprite";

export default class ChessJournalPlugin extends Plugin {
	private boards: Chessboard[] = [];

	async onload() {
		console.log("Loading Chess Journal plugin");

		// Inject the pieces SVG sprite into the document
		this.injectPiecesSprite();

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
				assetsCache: true, // Use cached sprite from DOM
				style: {
					cssClass: "chess-journal",
					showCoordinates: true,
					pieces: {
						file: "pieces/staunty.svg" // Not actually used when cached
					}
				}
			});

			this.boards.push(board);
		});
	}

	injectPiecesSprite() {
		// Check if already injected
		if (document.getElementById(SPRITE_WRAPPER_ID)) {
			return;
		}

		// Create a hidden wrapper div and inject the SVG (bundled at build time)
		const wrapper = document.createElement("div");
		wrapper.id = SPRITE_WRAPPER_ID;
		wrapper.style.position = "absolute";
		wrapper.style.width = "0";
		wrapper.style.height = "0";
		wrapper.style.overflow = "hidden";
		wrapper.setAttribute("aria-hidden", "true");
		wrapper.innerHTML = piecesSvg;

		document.body.appendChild(wrapper);
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
	}
}
