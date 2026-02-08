import { App, PluginSettingTab, Setting } from "obsidian";

export type PieceSet = "standard" | "staunty";

export interface ChessJournalSettings {
	pieceSet: PieceSet;
}

export const DEFAULT_SETTINGS: ChessJournalSettings = {
	pieceSet: "standard"
};

export interface ChessJournalPluginInterface {
	settings: ChessJournalSettings;
	saveSettings(): Promise<void>;
	injectPiecesSprite(): void;
}

export class ChessJournalSettingTab extends PluginSettingTab {
	plugin: ChessJournalPluginInterface;

	constructor(app: App, plugin: ChessJournalPluginInterface & { app: App; manifest: any }) {
		super(app, plugin as any);
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
				.onChange(async (value: string) => {
					this.plugin.settings.pieceSet = value as PieceSet;
					await this.plugin.saveSettings();
					this.plugin.injectPiecesSprite();
				}));
	}
}
