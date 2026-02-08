import { App, Notice, PluginSettingTab, Setting } from "obsidian";

export type PieceSet = "standard" | "staunty";

export type ExternalSourceType = "pgn" | "scid";

export interface ExternalSource {
	path: string;
	type: ExternalSourceType;
}

const SUPPORTED_EXTENSIONS: Record<string, ExternalSourceType> = {
	".pgn": "pgn",
	".si4": "scid",
	".si5": "scid",
};

export function detectSourceType(path: string): ExternalSourceType | null {
	const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
	return SUPPORTED_EXTENSIONS[ext] ?? null;
}

export interface ChessJournalSettings {
	pieceSet: PieceSet;
	externalSources: ExternalSource[];
}

export const DEFAULT_SETTINGS: ChessJournalSettings = {
	pieceSet: "standard",
	externalSources: [],
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

		containerEl.createEl("h3", { text: "External sources" });

		const sourcesContainer = containerEl.createDiv("external-sources-list");
		this.renderSourcesList(sourcesContainer);

		new Setting(containerEl)
			.setName("Add external source")
			.setDesc("Browse for a PGN file (.pgn) or SCID database (.si4, .si5)")
			.addButton(button => button
				.setButtonText("Browse...")
				.onClick(async () => {
					// @ts-ignore - Electron remote is available in Obsidian desktop
					const { remote } = require("electron");
					const result = await remote.dialog.showOpenDialog({
						title: "Select chess game source",
						filters: [
							{ name: "Chess files", extensions: ["pgn", "si4", "si5"] },
						],
						properties: ["openFile"],
					});

					if (result.canceled || result.filePaths.length === 0) return;

					const filePath = result.filePaths[0];
					const type = detectSourceType(filePath);
					if (!type) {
						new Notice("Unsupported file type. Supported extensions: .pgn, .si4, .si5");
						return;
					}

					if (this.plugin.settings.externalSources.some(s => s.path === filePath)) {
						new Notice("This source has already been added.");
						return;
					}

					this.plugin.settings.externalSources.push({ path: filePath, type });
					await this.plugin.saveSettings();
					this.display();
				}));
	}

	private renderSourcesList(container: HTMLElement): void {
		container.empty();

		if (this.plugin.settings.externalSources.length === 0) {
			container.createEl("p", {
				text: "No external sources configured.",
				cls: "setting-item-description",
			});
			return;
		}

		for (const source of this.plugin.settings.externalSources) {
			new Setting(container)
				.setName(source.path)
				.setDesc(source.type === "pgn" ? "PGN file" : "SCID database")
				.addButton(button => button
					.setButtonText("Remove")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.externalSources =
							this.plugin.settings.externalSources.filter(s => s.path !== source.path);
						await this.plugin.saveSettings();
						this.display();
					}));
		}
	}
}
