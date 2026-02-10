import { ItemView, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import { GameProvider, GameEntry, createProvider } from "./GameProvider";
import { VIEW_TYPE_GAME } from "./GameView";
import { ChessJournalSettings, ExternalSource, sourceKey, sourceDisplayName } from "./settings";
import { ChessComProvider } from "./ChessComProvider";

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
	private sortDesc: boolean = false;
	private sortActionEl: HTMLElement | null = null;

	private selectedIndex: number = -1;
	private rowElements: Map<number, HTMLElement> = new Map();

	private selectEl: HTMLSelectElement;
	private filterRow: HTMLElement;
	private usernameSelectEl: HTMLSelectElement;
	private loadingEl: HTMLElement;
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
			sourceKey: this.currentSource ? sourceKey(this.currentSource) : "",
			// Backward compat: also write sourcePath for older versions
			sourcePath: this.currentSource && this.currentSource.type !== "chesscom"
				? this.currentSource.path : "",
			sortDesc: this.sortDesc,
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as Record<string, unknown>;
		if (typeof s?.sortDesc === "boolean") {
			this.sortDesc = s.sortDesc;
			this.updateSortAction();
		}
		// Try sourceKey first, fall back to sourcePath for backward compat
		const key = typeof s?.sourceKey === "string" ? s.sourceKey
			: typeof s?.sourcePath === "string" ? s.sourcePath
			: "";
		if (key && this.selectEl) {
			this.selectEl.value = key;
			await this.onSourceChange(key);
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
			const option = this.selectEl.createEl("option", { text: sourceDisplayName(source) });
			option.value = sourceKey(source);
		}

		this.selectEl.addEventListener("change", () => this.onSourceChange(this.selectEl.value));

		// Username filter row (hidden by default)
		this.filterRow = container.createDiv("chess-journal-db-filter-row");
		this.filterRow.style.display = "none";
		this.usernameSelectEl = this.filterRow.createEl("select", { cls: "chess-journal-db-username-select" });
		this.usernameSelectEl.addEventListener("change", () => this.onUsernameFilterChange());

		// Search row: input + sort toggle
		const searchRow = container.createDiv("chess-journal-db-search-row");
		const searchInput = searchRow.createEl("input", {
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

		this.sortActionEl = searchRow.createEl("button", {
			cls: "chess-journal-db-sort-btn clickable-icon",
			attr: { "aria-label": this.sortDesc ? "Date: newest first" : "Date: oldest first" },
		});
		setIcon(this.sortActionEl, this.sortDesc ? "sort-desc" : "sort-asc");
		this.sortActionEl.addEventListener("click", () => this.toggleSort());

		// Loading indicator
		this.loadingEl = container.createDiv("chess-journal-db-loading");
		this.loadingEl.setText("Loading games...");
		this.loadingEl.style.display = "none";

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

	private async onSourceChange(key: string): Promise<void> {
		if (this.provider) {
			this.provider.close();
			this.provider = null;
		}
		this.currentSource = null;
		this.resetList();
		this.hideUsernameFilter();
		this.updateStatus();

		if (!key) return;

		const source = this.settings.externalSources.find(s => sourceKey(s) === key);
		if (!source) return;

		try {
			this.loadingEl.style.display = "";
			this.provider = createProvider(source);
			await this.provider.open();
			this.currentSource = source;
			this.loadingEl.style.display = "none";
			this.totalCount = this.provider.getGameCount();
			this.showUsernameFilter();
			this.updateStatus();
			this.loadPage();
		} catch (e) {
			this.loadingEl.style.display = "none";
			this.statusEl.setText(`Error opening source: ${e.message}`);
		}
	}

	private showUsernameFilter(): void {
		if (!(this.provider instanceof ChessComProvider)) {
			this.hideUsernameFilter();
			return;
		}

		const usernames = this.provider.getUsernames();
		if (usernames.length <= 1) {
			this.hideUsernameFilter();
			return;
		}

		this.usernameSelectEl.empty();
		const allOption = this.usernameSelectEl.createEl("option", { text: "All users" });
		allOption.value = "";
		for (const u of usernames) {
			const opt = this.usernameSelectEl.createEl("option", { text: u });
			opt.value = u;
		}
		this.filterRow.style.display = "";
	}

	private hideUsernameFilter(): void {
		this.filterRow.style.display = "none";
		this.usernameSelectEl.empty();
	}

	private onUsernameFilterChange(): void {
		if (!(this.provider instanceof ChessComProvider)) return;
		const value = this.usernameSelectEl.value || null;
		this.provider.setUsernameFilter(value);
		this.resetList();
		this.totalCount = this.provider.getGameCount();
		this.updateStatus();
		this.loadPage();
	}

	private toggleSort(): void {
		this.sortDesc = !this.sortDesc;
		this.updateSortAction();
		this.resetList();
		if (this.provider) {
			this.totalCount = this.provider.getGameCount();
		}
		this.loadPage();
		this.app.workspace.requestSaveLayout();
	}

	private updateSortAction(): void {
		if (!this.sortActionEl) return;
		const icon = this.sortDesc ? "sort-desc" : "sort-asc";
		const label = this.sortDesc ? "Date: newest first" : "Date: oldest first";
		this.sortActionEl.setAttribute("aria-label", label);
		setIcon(this.sortActionEl, icon);
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

		const displayed = this.displayedGames.length;
		let entries: GameEntry[];

		if (this.searchQuery) {
			if (this.sortDesc && displayed === 0) {
				// Probe to get the total count for reverse pagination
				const probe = this.provider.search(this.searchQuery, 0, 0);
				this.totalCount = probe.total;
			}
			if (this.sortDesc) {
				const reverseOffset = Math.max(0, this.totalCount - displayed - PAGE_SIZE);
				const limit = Math.min(PAGE_SIZE, this.totalCount - displayed);
				const result = this.provider.search(this.searchQuery, reverseOffset, limit);
				entries = result.games.reverse();
				this.totalCount = result.total;
			} else {
				const result = this.provider.search(this.searchQuery, displayed, PAGE_SIZE);
				entries = result.games;
				this.totalCount = result.total;
			}
		} else {
			this.totalCount = this.provider.getGameCount();
			if (this.sortDesc) {
				const reverseOffset = Math.max(0, this.totalCount - displayed - PAGE_SIZE);
				const limit = Math.min(PAGE_SIZE, this.totalCount - displayed);
				entries = this.provider.getGames(reverseOffset, limit).reverse();
			} else {
				entries = this.provider.getGames(displayed, PAGE_SIZE);
			}
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
