import { App, Modal, Notice, Setting } from "obsidian";
import { ChessJournalSettings } from "./settings";
import { RepertoireData } from "./RepertoireTypes";

const START_EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

export class NewRepertoireModal extends Modal {
	private name = "";
	private color: "white" | "black" = "black";

	constructor(app: App, private settings: ChessJournalSettings) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("New repertoire");

		new Setting(this.contentEl)
			.setName("Name")
			.addText(text => text
				.setPlaceholder("e.g. My Black Repertoire")
				.onChange(value => { this.name = value; }));

		new Setting(this.contentEl)
			.setName("Colour")
			.addDropdown(drop => drop
				.addOption("white", "White")
				.addOption("black", "Black")
				.setValue(this.color)
				.onChange(value => { this.color = value as "white" | "black"; }));

		new Setting(this.contentEl)
			.addButton(btn => btn
				.setButtonText("Create")
				.setCta()
				.onClick(() => this.create()));
	}

	private async create(): Promise<void> {
		const trimmed = this.name.trim();
		if (!trimmed) {
			new Notice("Please enter a name for the repertoire.");
			return;
		}

		const data: RepertoireData = {
			version: 1,
			color: this.color,
			root: {
				san: null,
				epd: START_EPD,
				
				children: [],
			},
		};

		const filename = trimmed.replace(/[\\/:*?"<>|]/g, "_") + ".repertoire";
		let filePath = filename;
		let counter = 2;
		while (this.app.vault.getAbstractFileByPath(filePath)) {
			filePath = trimmed.replace(/[\\/:*?"<>|]/g, "_") + ` ${counter}.repertoire`;
			counter++;
		}

		const file = await this.app.vault.create(filePath, JSON.stringify(data, null, 2));
		this.close();
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
