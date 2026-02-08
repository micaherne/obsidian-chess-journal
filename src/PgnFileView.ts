import { TextFileView } from "obsidian";

export const VIEW_TYPE_PGN = "pgn-file-view";

export class PgnFileView extends TextFileView {
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
