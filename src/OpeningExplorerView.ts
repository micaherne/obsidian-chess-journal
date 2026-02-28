import { ItemView, TFile, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import { ChessJournalSettings } from "./settings";
import { createOpeningNote } from "./createOpeningNote";
import { ECO_DATA, EcoEntry } from "./eco-data";

export const VIEW_TYPE_OPENING_EXPLORER = "chess-journal-opening-explorer";

// ---------------------------------------------------------------------------
// ECO browser data structures
// ---------------------------------------------------------------------------

const LETTER_NAMES: Record<string, string> = {
	A: "Flank Openings",
	B: "Semi-Open Games",
	C: "Open Games & French Defense",
	D: "Closed & Semi-Closed Games",
	E: "Indian Defenses",
};

type CodeMap = Map<string, EcoEntry[]>;
type LetterMap = Map<string, CodeMap>;

function buildLetterMap(): LetterMap {
	const map: LetterMap = new Map();
	for (const entry of ECO_DATA) {
		const letter = entry.eco[0];
		if (!map.has(letter)) map.set(letter, new Map());
		const codeMap = map.get(letter)!;
		if (!codeMap.has(entry.eco)) codeMap.set(entry.eco, []);
		codeMap.get(entry.eco)!.push(entry);
	}
	return map;
}

const LETTER_MAP: LetterMap = buildLetterMap();

// ---------------------------------------------------------------------------
// Move tree data structures
// ---------------------------------------------------------------------------

interface MoveTreeNode {
	entry: EcoEntry;
	moves: string[];       // Full SAN sequence for this node
	children: MoveTreeNode[];
}

/** Strip move numbers and result tokens from a PGN string, returning SAN moves. */
function parsePgnMoves(pgn: string): string[] {
	return pgn.split(/\s+/).filter(
		t => t && !/^\d+\.\.?\.?$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)
	);
}

/** Format the moves added by a node relative to its parent. */
function getMoveLabel(moves: string[], parentDepth: number): string {
	const parts: string[] = [];
	for (let i = parentDepth; i < moves.length; i++) {
		const moveNum = Math.floor(i / 2) + 1;
		const isWhite = i % 2 === 0;
		if (i === parentDepth) {
			parts.push(isWhite ? `${moveNum}. ${moves[i]}` : `${moveNum}...${moves[i]}`);
		} else {
			parts.push(isWhite ? `${moveNum}. ${moves[i]}` : moves[i]);
		}
	}
	return parts.join(" ");
}

function sortMoveNodes(nodes: MoveTreeNode[]): void {
	// Nodes with children (branching lines) before leaf nodes (specific variations)
	nodes.sort((a, b) => (b.children.length > 0 ? 1 : 0) - (a.children.length > 0 ? 1 : 0));
	for (const node of nodes) {
		if (node.children.length > 0) sortMoveNodes(node.children);
	}
}

function buildMoveTree(): MoveTreeNode[] {
	// Parse moves for every entry
	const parsed = ECO_DATA.map(entry => ({
		entry,
		moves: parsePgnMoves(entry.pgn),
	}));

	// Sort ascending by move count so parents are always processed before children
	parsed.sort((a, b) => a.moves.length - b.moves.length);

	// Lookup: move-sequence key → node
	const lookup = new Map<string, MoveTreeNode>();
	const roots: MoveTreeNode[] = [];

	for (const { entry, moves } of parsed) {
		const node: MoveTreeNode = { entry, moves, children: [] };
		lookup.set(moves.join(" "), node);

		// Find parent: strip one move at a time from the end
		let parent: MoveTreeNode | undefined;
		for (let i = moves.length - 1; i > 0; i--) {
			parent = lookup.get(moves.slice(0, i).join(" "));
			if (parent) break;
		}

		if (parent) {
			parent.children.unshift(node);
		} else {
			roots.unshift(node);
		}
	}

	sortMoveNodes(roots);
	return roots;
}

const MOVE_TREE: MoveTreeNode[] = buildMoveTree();

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

type ViewMode = "eco" | "moves";

export class OpeningExplorerView extends ItemView {
	private settings: ChessJournalSettings;
	private viewMode: ViewMode = "eco";

	// ECO browser state
	private searchQuery = "";
	private expandedCodes = new Set<string>();
	private collapsedLetters = new Set<string>(["A", "B", "C", "D", "E"]);
	private searchTimeout: number | null = null;

	// Move tree state
	private expandedMovePaths = new Set<string>();

	constructor(leaf: WorkspaceLeaf, settings: ChessJournalSettings) {
		super(leaf);
		this.settings = settings;
	}

	getViewType(): string { return VIEW_TYPE_OPENING_EXPLORER; }
	getDisplayText(): string { return "Opening Explorer"; }
	getIcon(): string { return "book-open"; }

	getState(): Record<string, unknown> {
		return {
			viewMode: this.viewMode,
			searchQuery: this.searchQuery,
			expandedCodes: [...this.expandedCodes],
			collapsedLetters: [...this.collapsedLetters],
			expandedMovePaths: [...this.expandedMovePaths],
		};
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		if (state.viewMode === "eco" || state.viewMode === "moves") this.viewMode = state.viewMode;
		if (typeof state.searchQuery === "string") this.searchQuery = state.searchQuery;
		if (Array.isArray(state.expandedCodes)) this.expandedCodes = new Set(state.expandedCodes as string[]);
		if (Array.isArray(state.collapsedLetters)) this.collapsedLetters = new Set(state.collapsedLetters as string[]);
		if (Array.isArray(state.expandedMovePaths)) this.expandedMovePaths = new Set(state.expandedMovePaths as string[]);
		this.render();
		return super.setState(state, result);
	}

	async onOpen(): Promise<void> { this.render(); }

	async onClose(): Promise<void> {
		if (this.searchTimeout !== null) window.clearTimeout(this.searchTimeout);
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	private render(): void {
		const treeEl = this.contentEl.querySelector<HTMLElement>(".chess-journal-explorer-tree");
		const savedScroll = treeEl?.scrollTop ?? 0;

		this.contentEl.empty();
		const container = this.contentEl.createDiv({ cls: "chess-journal-explorer" });

		this.renderToolbar(container);

		if (this.viewMode === "eco") {
			this.renderEcoContent(container);
		} else {
			this.renderMoveContent(container);
		}

		if (savedScroll > 0) {
			window.requestAnimationFrame(() => {
				const newTreeEl = this.contentEl.querySelector<HTMLElement>(".chess-journal-explorer-tree");
				if (newTreeEl) newTreeEl.scrollTop = savedScroll;
			});
		}
	}

	private renderToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: "chess-journal-explorer-toolbar" });

		const ecoBtn = toolbar.createEl("button", { cls: "chess-journal-explorer-mode-btn" });
		setIcon(ecoBtn, "tag");
		ecoBtn.setAttribute("aria-label", "ECO browser");
		if (this.viewMode === "eco") ecoBtn.classList.add("is-active");
		ecoBtn.addEventListener("click", () => {
			this.viewMode = "eco";
			this.render();
		});

		const movesBtn = toolbar.createEl("button", { cls: "chess-journal-explorer-mode-btn" });
		setIcon(movesBtn, "git-branch");
		movesBtn.setAttribute("aria-label", "Move tree");
		if (this.viewMode === "moves") movesBtn.classList.add("is-active");
		movesBtn.addEventListener("click", () => {
			this.viewMode = "moves";
			this.render();
		});
	}

	// ---------------------------------------------------------------------------
	// ECO browser
	// ---------------------------------------------------------------------------

	private buildNoteIndex(): Map<string, TFile[]> {
		const index = new Map<string, TFile[]>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const eco = cache?.frontmatter?.eco;
			if (typeof eco === "string" && eco) {
				if (!index.has(eco)) index.set(eco, []);
				index.get(eco)!.push(file);
			}
		}
		return index;
	}

	private renderEcoContent(container: HTMLElement): void {
		const searchRow = container.createDiv({ cls: "chess-journal-explorer-search-row" });
		const searchInput = searchRow.createEl("input", {
			cls: "chess-journal-explorer-search",
			attr: { type: "text", placeholder: "Search openings..." },
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			if (this.searchTimeout !== null) window.clearTimeout(this.searchTimeout);
			this.searchTimeout = window.setTimeout(() => {
				this.searchQuery = searchInput.value;
				this.render();
				const newInput = this.contentEl.querySelector<HTMLInputElement>(".chess-journal-explorer-search");
				if (newInput) {
					newInput.focus();
					const len = newInput.value.length;
					newInput.setSelectionRange(len, len);
				}
			}, 200);
		});

		const noteIndex = this.buildNoteIndex();
		const query = this.searchQuery.toLowerCase();
		const tree = container.createDiv({ cls: "chess-journal-explorer-tree" });

		for (const [letter, codeMap] of LETTER_MAP) {
			const matchingCodes: [string, EcoEntry[]][] = [];
			for (const [code, entries] of codeMap) {
				if (!query || code.toLowerCase().includes(query) || entries.some(e => e.name.toLowerCase().includes(query))) {
					matchingCodes.push([code, entries]);
				}
			}
			if (query && matchingCodes.length === 0) continue;

			const isCollapsed = !query && this.collapsedLetters.has(letter);
			const letterEl = tree.createDiv({ cls: "chess-journal-explorer-letter" });

			const letterHeader = letterEl.createDiv({ cls: "chess-journal-explorer-letter-header" });
			const letterToggle = letterHeader.createSpan({ cls: "chess-journal-explorer-toggle" });
			setIcon(letterToggle, isCollapsed ? "chevron-right" : "chevron-down");
			letterHeader.createSpan({ cls: "chess-journal-explorer-letter-id", text: letter });
			letterHeader.createSpan({ cls: "chess-journal-explorer-letter-name", text: LETTER_NAMES[letter] ?? "" });
			letterHeader.addEventListener("click", () => {
				if (this.collapsedLetters.has(letter)) {
					this.collapsedLetters.delete(letter);
				} else {
					this.collapsedLetters.add(letter);
				}
				this.render();
			});

			if (isCollapsed) continue;

			const letterBody = letterEl.createDiv({ cls: "chess-journal-explorer-letter-body" });
			for (const [code, entries] of matchingCodes) {
				this.renderCodeGroup(letterBody, code, entries, noteIndex, query);
			}
		}
	}

	private renderCodeGroup(
		container: HTMLElement,
		code: string,
		entries: EcoEntry[],
		noteIndex: Map<string, TFile[]>,
		query: string
	): void {
		const notes = noteIndex.get(code) ?? [];
		const isExpanded = query ? true : this.expandedCodes.has(code);
		const rootName = entries[0].name.split(":")[0].trim();

		const codeEl = container.createDiv({ cls: "chess-journal-explorer-code" });
		const header = codeEl.createDiv({ cls: "chess-journal-explorer-code-header" });
		const toggle = header.createSpan({ cls: "chess-journal-explorer-toggle" });
		setIcon(toggle, isExpanded ? "chevron-down" : "chevron-right");
		header.createSpan({ cls: "chess-journal-explorer-code-id", text: code });
		header.createSpan({ cls: "chess-journal-explorer-code-name", text: rootName });
		if (notes.length > 0) {
			header.createSpan({ cls: "chess-journal-explorer-badge", text: String(notes.length) });
		}
		header.addEventListener("click", () => {
			if (this.expandedCodes.has(code)) {
				this.expandedCodes.delete(code);
			} else {
				this.expandedCodes.add(code);
			}
			this.render();
		});

		if (!isExpanded) return;

		const detail = codeEl.createDiv({ cls: "chess-journal-explorer-code-detail" });

		const visibleEntries = query && !code.toLowerCase().includes(query)
			? entries.filter(e => e.name.toLowerCase().includes(query))
			: entries;

		const varList = detail.createDiv({ cls: "chess-journal-explorer-variations" });
		for (const entry of visibleEntries) {
			const varName = entry.name === rootName ? "Main line"
				: entry.name.startsWith(rootName + ":") ? entry.name.slice(rootName.length + 1).trim()
				: entry.name;
			const varEl = varList.createDiv({ cls: "chess-journal-explorer-variation" });
			varEl.createSpan({ cls: "chess-journal-explorer-variation-name", text: varName });
			if (entry.pgn) {
				varEl.createSpan({ cls: "chess-journal-explorer-pgn", text: entry.pgn });
			}
		}

		const notesSection = detail.createDiv({ cls: "chess-journal-explorer-notes-section" });
		if (notes.length > 0) {
			notesSection.createDiv({ cls: "chess-journal-explorer-notes-header", text: "Notes" });
			for (const note of notes) {
				const noteLink = notesSection.createDiv({ cls: "chess-journal-explorer-note-link" });
				const icon = noteLink.createSpan({ cls: "chess-journal-explorer-note-icon" });
				setIcon(icon, "file-text");
				noteLink.createSpan({ text: note.basename });
				noteLink.addEventListener("click", () => { this.app.workspace.getLeaf().openFile(note); });
			}
		}

		const createBtn = notesSection.createEl("button", {
			cls: "chess-journal-explorer-create-btn",
			text: "+ Create opening note",
		});
		createBtn.addEventListener("click", async () => {
			const file = await createOpeningNote(this.app, this.settings.openingsFolder, code, rootName);
			await this.app.workspace.getLeaf().openFile(file);
			this.render();
		});
	}

	// ---------------------------------------------------------------------------
	// Move tree
	// ---------------------------------------------------------------------------

	private renderMoveContent(container: HTMLElement): void {
		const tree = container.createDiv({ cls: "chess-journal-explorer-tree" });
		for (const root of MOVE_TREE) {
			this.renderMoveNode(tree, root, 0);
		}
	}

	private renderMoveNode(container: HTMLElement, node: MoveTreeNode, parentDepth: number): void {
		const key = node.moves.join(" ");
		const isExpanded = this.expandedMovePaths.has(key);
		const hasChildren = node.children.length > 0;

		const nodeEl = container.createDiv({ cls: "chess-journal-explorer-move-node" });
		const header = nodeEl.createDiv({ cls: "chess-journal-explorer-move-header" });

		const toggle = header.createSpan({ cls: "chess-journal-explorer-toggle" });
		if (hasChildren) {
			setIcon(toggle, isExpanded ? "chevron-down" : "chevron-right");
		}

		header.createSpan({
			cls: "chess-journal-explorer-move-san",
			text: getMoveLabel(node.moves, parentDepth),
		});

		// Opening name: last colon-segment is most specific, rest is context
		const nameParts = node.entry.name.split(":");
		const specificName = nameParts[nameParts.length - 1].trim();
		header.createSpan({ cls: "chess-journal-explorer-move-name", text: specificName });
		header.createSpan({ cls: "chess-journal-explorer-move-eco", text: node.entry.eco });

		if (hasChildren) {
			header.addEventListener("click", () => {
				if (this.expandedMovePaths.has(key)) {
					this.expandedMovePaths.delete(key);
				} else {
					this.expandedMovePaths.add(key);
				}
				this.render();
			});
		}

		if (!isExpanded || !hasChildren) return;

		const childrenEl = nodeEl.createDiv({ cls: "chess-journal-explorer-move-children" });
		for (const child of node.children) {
			this.renderMoveNode(childrenEl, child, node.moves.length);
		}
	}
}
