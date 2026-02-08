import { ItemView, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { GameProvider, GameEntry, createProvider } from "./GameProvider";
import { VIEW_TYPE_GAME } from "./GameView";
import { ChessJournalSettings, ExternalSource } from "./settings";

export const VIEW_TYPE_DATABASE = "chess-journal-database-view";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

export class DatabaseView extends ItemView {
	private settings: ChessJournalSettings;
	private provider: GameProvider | null = null;
	private currentSource: ExternalSource | null = null;
	private displayedGames: GameEntry[] = [];
	private totalCount: number = 0;
	private searchQuery: string = "";
	private searchTimeout: number | null = null;

	private selectedIndex: number = -1;
	private rowElements: Map<number, HTMLElement> = new Map();

	private selectEl: HTMLSelectElement;
	private listEl: HTMLElement;
	private statusEl: HTMLElement;
	private loadMoreEl: HTMLButtonElement;

	constructor(leaf: WorkspaceLeaf, settings: ChessJournalSettings) {
		super(leaf);
		this.settings = settings;
	}

	getViewType(): string {
		return VIEW_TYPE_DATABASE;
	}

	getDisplayText(): string {
		return "Game database";
	}

	getIcon(): string {
		return "database";
	}

	getState(): Record<string, unknown> {
		return {
			sourcePath: this.currentSource?.path ?? "",
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as Record<string, unknown>;
		const path = typeof s?.sourcePath === "string" ? s.sourcePath : "";
		if (path && this.selectEl) {
			this.selectEl.value = path;
			await this.onSourceChange(path);
		}
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("chess-journal-database");

		// Source selector row
		const selectorRow = container.createDiv("chess-journal-db-selector-row");
		this.selectEl = selectorRow.createEl("select", { cls: "chess-journal-db-source-select" });

		const defaultOption = this.selectEl.createEl("option", { text: "Select a source..." });
		defaultOption.value = "";

		for (const source of this.settings.externalSources) {
			const basename = source.path.split(/[/\\]/).pop() || source.path;
			const option = this.selectEl.createEl("option", { text: basename });
			option.value = source.path;
		}

		this.selectEl.addEventListener("change", () => this.onSourceChange(this.selectEl.value));

		// Search box
		const searchInput = container.createEl("input", {
			type: "text",
			placeholder: "Search games...",
			cls: "chess-journal-db-search",
		});
		searchInput.addEventListener("input", () => {
			if (this.searchTimeout !== null) {
				window.clearTimeout(this.searchTimeout);
			}
			this.searchTimeout = window.setTimeout(() => {
				this.searchQuery = searchInput.value.trim();
				this.resetList();
				this.loadPage();
			}, DEBOUNCE_MS);
		});

		// Game list
		this.listEl = container.createDiv("chess-journal-db-list");

		// Load more button
		this.loadMoreEl = container.createEl("button", {
			text: "Load more",
			cls: "chess-journal-db-load-more",
		});
		this.loadMoreEl.addEventListener("click", () => this.loadPage());
		this.loadMoreEl.style.display = "none";

		// Status line
		this.statusEl = container.createDiv("chess-journal-db-status");
	}

	async onClose(): Promise<void> {
		if (this.searchTimeout !== null) {
			window.clearTimeout(this.searchTimeout);
		}
		if (this.provider) {
			this.provider.close();
			this.provider = null;
		}
	}

	private async onSourceChange(path: string): Promise<void> {
		if (this.provider) {
			this.provider.close();
			this.provider = null;
		}
		this.currentSource = null;
		this.resetList();
		this.updateStatus();

		if (!path) return;

		const source = this.settings.externalSources.find(s => s.path === path);
		if (!source) return;

		try {
			this.provider = createProvider(source.type);
			await this.provider.open(source.path);
			this.currentSource = source;
			this.totalCount = this.provider.getGameCount();
			this.updateStatus();
			this.loadPage();
		} catch (e) {
			this.statusEl.setText(`Error opening source: ${e.message}`);
		}
	}

	private resetList(): void {
		this.displayedGames = [];
		this.listEl.empty();
		this.rowElements.clear();
		this.selectedIndex = -1;
		this.totalCount = 0;
		this.loadMoreEl.style.display = "none";
	}

	private loadPage(): void {
		if (!this.provider) return;

		const offset = this.displayedGames.length;
		let entries: GameEntry[];

		if (this.searchQuery) {
			const result = this.provider.search(this.searchQuery, offset, PAGE_SIZE);
			entries = result.games;
			this.totalCount = result.total;
		} else {
			entries = this.provider.getGames(offset, PAGE_SIZE);
			this.totalCount = this.provider.getGameCount();
		}

		for (const entry of entries) {
			this.displayedGames.push(entry);
			this.renderGameRow(entry);
		}

		// Show/hide load more
		const allLoaded = this.displayedGames.length >= this.totalCount;
		this.loadMoreEl.style.display = allLoaded ? "none" : "";

		this.updateStatus();
	}

	private renderGameRow(entry: GameEntry): void {
		const row = this.listEl.createDiv("chess-journal-db-row");
		this.rowElements.set(entry.index, row);

		if (entry.index === this.selectedIndex) {
			row.addClass("is-selected");
		}

		const white = entry.headers["White"] || "?";
		const black = entry.headers["Black"] || "?";
		const result = entry.headers["Result"] || "";
		const date = entry.headers["Date"] || "";
		const eco = entry.headers["ECO"] || "";

		const players = row.createDiv("chess-journal-db-row-players");
		players.setText(`${white} vs ${black}`);

		const info = row.createDiv("chess-journal-db-row-info");
		const parts: string[] = [];
		if (result) parts.push(result);
		if (date && date !== "????.??.??") parts.push(date);
		if (eco) parts.push(eco);
		info.setText(parts.join("  "));

		row.addEventListener("click", () => this.openGame(entry));
	}

	private async openGame(entry: GameEntry): Promise<void> {
		if (!this.provider) return;

		const pgn = this.provider.getGamePgn(entry.index);
		if (!pgn) return;

		// Update selection highlight
		const prevRow = this.rowElements.get(this.selectedIndex);
		if (prevRow) prevRow.removeClass("is-selected");
		this.selectedIndex = entry.index;
		const newRow = this.rowElements.get(entry.index);
		if (newRow) newRow.addClass("is-selected");

		const white = entry.headers["White"] || "?";
		const black = entry.headers["Black"] || "?";
		const title = `${white} vs ${black}`;

		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_GAME,
			active: true,
		});
		const view = leaf.view;
		if (view && view.getViewType() === VIEW_TYPE_GAME) {
			await view.setState({ pgn, title }, { history: false });
		}
	}

	private updateStatus(): void {
		if (!this.provider) {
			this.statusEl.setText("");
			return;
		}
		const shown = this.displayedGames.length;
		const total = this.totalCount;
		this.statusEl.setText(`Showing ${shown} of ${total} games`);
	}
}
