import { ItemView, WorkspaceLeaf } from "obsidian";
import { PgnViewer } from "./PgnViewer";
import { PieceSet } from "./settings";

export const VIEW_TYPE_GAME = "chess-journal-game-view";

export class GameView extends ItemView {
	private pgn: string = "";
	private title: string = "Game";
	private pieceSet: PieceSet;
	private viewer: PgnViewer | null = null;

	constructor(leaf: WorkspaceLeaf, pieceSet: PieceSet) {
		super(leaf);
		this.pieceSet = pieceSet;
	}

	getViewType(): string {
		return VIEW_TYPE_GAME;
	}

	getDisplayText(): string {
		return this.title;
	}

	getIcon(): string {
		return "crown";
	}

	async setState(state: { pgn: string; title: string }, result: any): Promise<void> {
		this.pgn = state.pgn;
		this.title = state.title;
		await super.setState(state, result);
		this.render();
	}

	getState(): any {
		return { pgn: this.pgn, title: this.title };
	}

	async onOpen(): Promise<void> {
		if (this.pgn) {
			this.render();
		}
	}

	async onClose(): Promise<void> {
		if (this.viewer) {
			this.viewer.destroy();
			this.viewer = null;
		}
	}

	private render(): void {
		if (this.viewer) {
			this.viewer.destroy();
			this.viewer = null;
		}
		this.contentEl.empty();

		if (!this.pgn) return;

		try {
			this.viewer = new PgnViewer(this.contentEl, this.pgn, this.pieceSet);
		} catch (e) {
			this.contentEl.createEl("div", {
				text: `Error loading game: ${e.message}`,
				cls: "chess-journal-error",
			});
		}

		this.leaf.updateHeader();
	}
}
