import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { PgnViewer } from "./PgnViewer";
import { ChessJournalSettings } from "./settings";
import { createGameNote } from "./createGameNote";

export const VIEW_TYPE_GAME = "chess-journal-game-view";

export class GameView extends ItemView {
	private pgn: string = "";
	private title: string = "Game";
	private settings: ChessJournalSettings;
	private viewer: PgnViewer | null = null;

	constructor(leaf: WorkspaceLeaf, settings: ChessJournalSettings) {
		super(leaf);
		this.settings = settings;
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
		this.addAction("file-plus", "Create note", () => this.onCreateNote());

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

	private async onCreateNote(): Promise<void> {
		if (!this.pgn) {
			new Notice("No game loaded");
			return;
		}
		try {
			const file = await createGameNote(this.app, this.settings.notesFolder, this.pgn);
			const leaf = this.app.workspace.getLeaf("tab");
			await leaf.openFile(file);
			new Notice(`Created ${file.path}`);
		} catch (e) {
			new Notice(`Failed to create note: ${e.message}`);
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
			this.viewer = new PgnViewer(this.contentEl, this.pgn, this.settings.pieceSet);
		} catch (e) {
			this.contentEl.createEl("div", {
				text: `Error loading game: ${e.message}`,
				cls: "chess-journal-error",
			});
		}

		this.leaf.updateHeader();
	}
}
