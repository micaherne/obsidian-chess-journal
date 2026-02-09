import { App, Notice, PluginSettingTab, Setting } from "obsidian";

export type PieceSet = "standard" | "staunty";

export interface PgnSource {
	type: "pgn";
	path: string;
}

export interface ScidSource {
	type: "scid";
	path: string;
}

export interface ChessComSource {
	type: "chesscom";
	usernames: string[];
}

export type ExternalSource = PgnSource | ScidSource | ChessComSource;

export type ExternalSourceType = ExternalSource["type"];

const SUPPORTED_EXTENSIONS: Record<string, "pgn" | "scid"> = {
	".pgn": "pgn",
	".si4": "scid",
	".si5": "scid",
};

export function detectSourceType(path: string): "pgn" | "scid" | null {
	const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
	return SUPPORTED_EXTENSIONS[ext] ?? null;
}

export function sourceKey(source: ExternalSource): string {
	switch (source.type) {
		case "pgn":
		case "scid":
			return source.path;
		case "chesscom":
			return "chesscom";
	}
}

export function sourceDisplayName(source: ExternalSource): string {
	switch (source.type) {
		case "pgn":
		case "scid":
			return source.path.split(/[/\\]/).pop() || source.path;
		case "chesscom":
			return "Chess.com";
	}
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
			.setName("Add file source")
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

					const exists = this.plugin.settings.externalSources.some(
						s => s.type !== "chesscom" && s.path === filePath
					);
					if (exists) {
						new Notice("This source has already been added.");
						return;
					}

					this.plugin.settings.externalSources.push({ path: filePath, type });
					await this.plugin.saveSettings();
					this.display();
				}));

		containerEl.createEl("h3", { text: "Chess.com" });
		this.renderChessComSection(containerEl);
	}

	private renderSourcesList(container: HTMLElement): void {
		container.empty();

		const fileSources = this.plugin.settings.externalSources.filter(
			(s): s is PgnSource | ScidSource => s.type !== "chesscom"
		);

		if (fileSources.length === 0) {
			container.createEl("p", {
				text: "No file sources configured.",
				cls: "setting-item-description",
			});
			return;
		}

		for (const source of fileSources) {
			new Setting(container)
				.setName(sourceDisplayName(source))
				.setDesc(source.type === "pgn" ? "PGN file" : "SCID database")
				.addButton(button => button
					.setButtonText("Remove")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.externalSources =
							this.plugin.settings.externalSources.filter(s => s !== source);
						await this.plugin.saveSettings();
						this.display();
					}));
		}
	}

	private getChessComSource(): ChessComSource | null {
		return this.plugin.settings.externalSources.find(
			(s): s is ChessComSource => s.type === "chesscom"
		) ?? null;
	}

	private renderChessComSection(container: HTMLElement): void {
		const chesscom = this.getChessComSource();

		// Username list
		if (chesscom && chesscom.usernames.length > 0) {
			for (const username of chesscom.usernames) {
				new Setting(container)
					.setName(username)
					.addButton(button => button
						.setButtonText("Remove")
						.setWarning()
						.onClick(async () => {
							chesscom.usernames = chesscom.usernames.filter(u => u !== username);
							if (chesscom.usernames.length === 0) {
								this.plugin.settings.externalSources =
									this.plugin.settings.externalSources.filter(s => s !== chesscom);
							}
							await this.plugin.saveSettings();
							this.display();
						}));
			}
		}

		// Add username
		let usernameInput = "";
		new Setting(container)
			.setName("Add username")
			.setDesc("Enter a chess.com username to fetch their games")
			.addText(text => text
				.setPlaceholder("username")
				.onChange(value => { usernameInput = value.trim(); }))
			.addButton(button => button
				.setButtonText("Add")
				.onClick(async () => {
					if (!usernameInput) {
						new Notice("Please enter a username.");
						return;
					}
					const lower = usernameInput.toLowerCase();
					let source = this.getChessComSource();
					if (source) {
						if (source.usernames.some(u => u.toLowerCase() === lower)) {
							new Notice("This username has already been added.");
							return;
						}
						source.usernames.push(usernameInput);
					} else {
						source = { type: "chesscom", usernames: [usernameInput] };
						this.plugin.settings.externalSources.push(source);
					}
					await this.plugin.saveSettings();
					this.display();
				}));
	}
}
