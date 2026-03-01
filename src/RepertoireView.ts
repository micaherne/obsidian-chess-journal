import {
	App,
	MarkdownRenderer,
	Menu,
	Modal,
	Notice,
	TFile,
	TextFileView,
	WorkspaceLeaf,
	setIcon,
} from "obsidian";
import { Chess } from "chess.js";
// @ts-ignore
import { Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { ChessJournalSettings } from "./settings";
import { RepertoireData, RepertoireNode } from "./RepertoireTypes";
import { createRepertoireNote } from "./createRepertoireNote";
import { ECO_DATA } from "./eco-data";
import { LichessMastersProvider } from "./LichessMastersProvider";
import { OpeningExplorerResult, OpeningExplorerMove } from "./OpeningExplorerProvider";

class ConfirmModal extends Modal {
	private title: string;
	private message: string;
	private onConfirm: () => void;

	constructor(app: App, title: string, message: string, onConfirm: () => void) {
		super(app);
		this.title = title;
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		this.contentEl.createEl("h3", { text: this.title });
		this.contentEl.createEl("p", { text: this.message });
		const btns = this.contentEl.createDiv({ cls: "modal-button-container" });
		btns.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => this.close());
		const del = btns.createEl("button", { cls: "mod-warning", text: "Delete" });
		del.addEventListener("click", () => { this.close(); this.onConfirm(); });
	}

	onClose() { this.contentEl.empty(); }
}

export const VIEW_TYPE_REPERTOIRE = "chess-journal-repertoire";

// Use string literal to avoid circular import with OpeningExplorerView
const OPENING_EXPLORER_VIEW_TYPE = "chess-journal-opening-explorer";

const START_EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type ViewMode = "board" | "tree";

export class RepertoireView extends TextFileView {
	private settings: ChessJournalSettings;
	private repertoire: RepertoireData = this.defaultRepertoire();
	private currentPath: string[] = [];
	private viewMode: ViewMode = "board";
	private chess = new Chess();
	private board: Chessboard | null = null;
	private boardRafId: number | null = null;
	private expandedTreePaths = new Set<string>();
	private showEcoLabels = false;
	private noteIndex = new Map<string, TFile>();
	private pendingNote: { epd: string; file: TFile } | null = null;

	// Masters data
	private mastersResult: OpeningExplorerResult | null = null;
	private mastersLoading = false;
	private mastersError: string | null = null;
	private mastersFetchId = 0;
	private mastersFetchTimeout: number | null = null;
	private mastersForPath: string | null = null;
	private readonly mastersProvider: LichessMastersProvider;

	constructor(leaf: WorkspaceLeaf, settings: ChessJournalSettings) {
		super(leaf);
		this.settings = settings;
		this.mastersProvider = new LichessMastersProvider(settings);
	}

	getViewType(): string { return VIEW_TYPE_REPERTOIRE; }
	getDisplayText(): string { return this.file?.basename ?? "Repertoire"; }
	getIcon(): string { return "book-marked"; }

	// -------------------------------------------------------------------------
	// TextFileView contract
	// -------------------------------------------------------------------------

	setViewData(data: string, clear: boolean): void {
		try {
			this.repertoire = JSON.parse(data);
		} catch {
			this.repertoire = this.defaultRepertoire();
		}
		if (clear) {
			this.currentPath = [];
			this.viewMode = "board";
			this.expandedTreePaths = new Set();
		}
		this.render();
	}

	getViewData(): string {
		return JSON.stringify(this.repertoire, null, 2);
	}

	clear(): void {
		this.destroyBoard();
		this.contentEl.empty();
	}

	async onClose(): Promise<void> {
		if (this.mastersFetchTimeout !== null) window.clearTimeout(this.mastersFetchTimeout);
		this.mastersFetchId++;
		this.destroyBoard();
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	private defaultRepertoire(): RepertoireData {
		return {
			version: 1,
			color: "black",
			root: { san: null, epd: START_EPD, children: [] },
		};
	}

	private syncChess(): void {
		this.chess.reset();
		for (const san of this.currentPath) {
			this.chess.move(san);
		}
	}

	private getCurrentNode(): RepertoireNode {
		let node = this.repertoire.root;
		for (const san of this.currentPath) {
			const child = node.children.find(c => c.san === san);
			if (!child) break;
			node = child;
		}
		return node;
	}

	private isMyTurn(): boolean {
		const turn = this.chess.turn();
		return this.repertoire.color === "white" ? turn === "w" : turn === "b";
	}

	/** True when a move at the given 1-based ply is the repertoire owner's move. */
	private isMyPly(ply: number): boolean {
		const isWhiteMove = ply % 2 === 1;
		return this.repertoire.color === "white" ? isWhiteMove : !isWhiteMove;
	}

	private getNodeAtPath(path: string[]): RepertoireNode | null {
		let node = this.repertoire.root;
		for (const san of path) {
			const child = node.children.find(c => c.san === san);
			if (!child) return null;
			node = child;
		}
		return node;
	}

	private countSubtree(node: RepertoireNode): number {
		return 1 + node.children.reduce((sum, c) => sum + this.countSubtree(c), 0);
	}

	private deleteNode(nodePath: string[]): void {
		let parent = this.repertoire.root;
		for (const san of nodePath.slice(0, -1)) {
			const child = parent.children.find(c => c.san === san);
			if (!child) return;
			parent = child;
		}
		const sanToDelete = nodePath[nodePath.length - 1];
		parent.children = parent.children.filter(c => c.san !== sanToDelete);

		// If current position is within the deleted subtree, retreat to the parent
		const deletedKey = nodePath.join(" ");
		if (this.currentPath.join(" ").startsWith(deletedKey)) {
			this.currentPath = nodePath.slice(0, -1);
		}

		this.requestSave();
		this.render();
	}

	private confirmDelete(nodePath: string[]): void {
		const node = this.getNodeAtPath(nodePath);
		if (!node) return;
		const count = this.countSubtree(node);
		const san = nodePath[nodePath.length - 1];
		new ConfirmModal(
			this.app,
			`Delete ${san}?`,
			`This will delete ${count} position${count === 1 ? "" : "s"} (including all continuations). This cannot be undone.`,
			() => this.deleteNode(nodePath),
		).open();
	}

	/** Build an EPD → TFile map for notes belonging to this repertoire. */
	private buildNoteIndex(): void {
		const repName = this.file?.basename ?? "";
		this.noteIndex = new Map<string, TFile>();
		for (const f of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
			if (fm?.epd && fm?.repertoire === repName) {
				this.noteIndex.set(fm.epd as string, f);
			}
		}
		// Inject a just-created note in case the metadata cache hasn't indexed it yet
		if (this.pendingNote && !this.noteIndex.has(this.pendingNote.epd)) {
			this.noteIndex.set(this.pendingNote.epd, this.pendingNote.file);
		}
		this.pendingNote = null;
	}

	private getEcoForEpd(epd: string): { eco: string; name: string } | null {
		const match = ECO_DATA.find(e => e.epd === epd);
		return match ? { eco: match.eco, name: match.name } : null;
	}

	// -------------------------------------------------------------------------
	// Opening explorer sync
	// -------------------------------------------------------------------------

	private syncOpeningExplorer(): void {
		const epd = this.chess.fen().split(" ").slice(0, 4).join(" ");
		const leaves = this.app.workspace.getLeavesOfType(OPENING_EXPLORER_VIEW_TYPE);
		if (leaves.length === 0) return;
		const view = leaves[0].view as any;
		if (typeof view.navigateToEpd === "function") {
			view.navigateToEpd(epd);
		}
	}

	// -------------------------------------------------------------------------
	// Render
	// -------------------------------------------------------------------------

	private render(): void {
		this.buildNoteIndex();
		this.destroyBoard();
		this.syncChess();
		this.contentEl.empty();

		const container = this.contentEl.createDiv({ cls: "chess-journal-rep" });
		this.renderToolbar(container);

		if (this.viewMode === "board") {
			this.renderBoardView(container);
		} else {
			this.renderTreeView(container);
		}

		this.syncOpeningExplorer();
	}

	private renderToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: "chess-journal-rep-toolbar" });

		const boardBtn = toolbar.createEl("button", { cls: "chess-journal-rep-mode-btn" });
		setIcon(boardBtn, "layout-panel-top");
		boardBtn.setAttribute("aria-label", "Board view");
		if (this.viewMode === "board") boardBtn.classList.add("is-active");
		boardBtn.addEventListener("click", () => { this.viewMode = "board"; this.render(); });

		const treeBtn = toolbar.createEl("button", { cls: "chess-journal-rep-mode-btn" });
		setIcon(treeBtn, "git-branch");
		treeBtn.setAttribute("aria-label", "Tree view");
		if (this.viewMode === "tree") treeBtn.classList.add("is-active");
		treeBtn.addEventListener("click", () => { this.viewMode = "tree"; this.render(); });

		toolbar.createSpan({
			cls: "chess-journal-rep-colour-badge",
			text: this.repertoire.color === "white" ? "White" : "Black",
		});
	}

	// -------------------------------------------------------------------------
	// Board view
	// -------------------------------------------------------------------------

	private renderBoardView(container: HTMLElement): void {
		const view = container.createDiv({ cls: "chess-journal-rep-board-view" });
		this.renderBreadcrumb(view);
		const boardWrap = view.createDiv({ cls: "chess-journal-rep-board-wrap" });
		boardWrap.createDiv({ cls: "chess-journal-rep-board" });
		this.renderContinuations(view);
		this.renderMastersSection(view);
		this.renderNoteSection(view);

		this.boardRafId = window.requestAnimationFrame(() => {
			this.boardRafId = null;
			this.instantiateBoard();
		});
	}

	private renderBreadcrumb(container: HTMLElement): void {
		const row = container.createDiv({ cls: "chess-journal-rep-breadcrumb" });

		const startCrumb = row.createSpan({ cls: "chess-journal-rep-crumb", text: "Start" });
		startCrumb.addEventListener("click", () => { this.currentPath = []; this.render(); });

		this.currentPath.forEach((san, i) => {
			row.createSpan({ cls: "chess-journal-rep-crumb-sep", text: "›" });
			const ply = i + 1;
			const moveNum = Math.ceil(ply / 2);
			const label = ply % 2 === 1 ? `${moveNum}. ${san}` : san;
			const crumb = row.createSpan({ cls: "chess-journal-rep-crumb", text: label });
			crumb.addEventListener("click", () => {
				this.currentPath = this.currentPath.slice(0, i + 1);
				this.render();
			});
		});
	}

	private renderContinuations(container: HTMLElement): void {
		const section = container.createDiv({ cls: "chess-journal-rep-continuations" });
		const currentNode = this.getCurrentNode();

		if (currentNode.children.length === 0) {
			section.createDiv({
				cls: "chess-journal-rep-empty-hint",
				text: "No moves here yet — drag pieces on the board above to add lines.",
			});
			return;
		}

		const isMine = this.isMyTurn();
		section.createDiv({
			cls: "chess-journal-rep-section-label",
			text: isMine ? "Your moves" : "Opponent's moves",
		});

		const moveList = section.createDiv({ cls: "chess-journal-rep-move-list" });
		const ply = this.currentPath.length + 1;
		const moveNum = Math.ceil(ply / 2);
		const isWhiteTurn = this.chess.turn() === "w";

		for (const child of currentNode.children) {
			if (!child.san) continue;
			const label = isWhiteTurn ? `${moveNum}. ${child.san}` : `${moveNum}...${child.san}`;
			const chip = moveList.createEl("button", {
				cls: "chess-journal-rep-move-chip" + (isMine ? " is-mine" : ""),
				text: label,
			});
			chip.addEventListener("click", () => {
				this.currentPath = [...this.currentPath, child.san!];
				this.render();
			});
			chip.addEventListener("contextmenu", (e: MouseEvent) => {
				e.preventDefault();
				const nodePath = [...this.currentPath, child.san!];
				const menu = new Menu();
				menu.addItem(item => item.setTitle("Delete move").setIcon("trash-2")
					.onClick(() => this.confirmDelete(nodePath)));
				menu.showAtMouseEvent(e);
			});
		}
	}

	// -------------------------------------------------------------------------
	// Masters section
	// -------------------------------------------------------------------------

	private cancelMastersFetch(): void {
		this.mastersFetchId++;
		if (this.mastersFetchTimeout !== null) {
			window.clearTimeout(this.mastersFetchTimeout);
			this.mastersFetchTimeout = null;
		}
		this.mastersResult = null;
		this.mastersLoading = false;
		this.mastersError = null;
	}

	private scheduleMastersFetch(): void {
		if (this.mastersFetchTimeout !== null) window.clearTimeout(this.mastersFetchTimeout);
		this.mastersFetchTimeout = window.setTimeout(() => {
			this.mastersFetchTimeout = null;
			void this.fetchMasters();
		}, 300);
	}

	private async fetchMasters(): Promise<void> {
		const fetchId = ++this.mastersFetchId;
		this.mastersLoading = true;
		this.mastersError = null;
		this.render();

		const fen = this.chess.fen();

		for (let attempt = 0; ; attempt++) {
			if (fetchId !== this.mastersFetchId) return;

			try {
				const result = await this.mastersProvider.getMoves(fen);
				if (fetchId !== this.mastersFetchId) return;
				this.mastersResult = result;
				break;
			} catch (e: any) {
				if (fetchId !== this.mastersFetchId) return;
				if (e?.status === 429) {
					const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
					await new Promise<void>(resolve => window.setTimeout(resolve, delay));
					continue;
				}
				this.mastersError = e instanceof Error ? e.message : String(e);
				break;
			}
		}

		if (fetchId !== this.mastersFetchId) return;
		this.mastersLoading = false;
		this.render();
	}

	private renderMastersSection(container: HTMLElement): void {
		// Detect position change and trigger a new fetch if needed
		const pathKey = this.currentPath.join("\0");
		if (pathKey !== this.mastersForPath) {
			this.cancelMastersFetch();
			this.mastersForPath = pathKey;
		}
		if (!this.mastersResult && !this.mastersLoading && !this.mastersError) {
			this.scheduleMastersFetch();
		}

		const section = container.createDiv({ cls: "chess-journal-rep-masters" });

		const header = section.createDiv({ cls: "chess-journal-rep-masters-header" });
		header.createSpan({ cls: "chess-journal-rep-section-label", text: "Masters" });

		if (this.mastersLoading) {
			section.createDiv({ cls: "chess-journal-rep-masters-status", text: "Loading…" });
			return;
		}

		if (this.mastersError) {
			section.createDiv({ cls: "chess-journal-rep-masters-status chess-journal-rep-masters-error", text: this.mastersError });
			return;
		}

		if (!this.mastersResult || this.mastersResult.moves.length === 0) {
			section.createDiv({ cls: "chess-journal-rep-masters-status", text: "No games found." });
			return;
		}

		const total = this.mastersResult.white + this.mastersResult.draws + this.mastersResult.black;
		header.createSpan({ cls: "chess-journal-rep-masters-total", text: `${total.toLocaleString()} games` });

		const table = section.createEl("table", { cls: "chess-journal-rep-masters-table" });
		const tbody = table.createEl("tbody");

		for (const move of this.mastersResult.moves) {
			this.renderMastersRow(tbody, move);
		}
	}

	private renderMastersRow(tbody: HTMLElement, move: OpeningExplorerMove): void {
		const row = tbody.createEl("tr", { cls: "chess-journal-rep-masters-row" });
		row.addEventListener("click", () => this.playMastersMove(move.san));

		row.createEl("td", { cls: "chess-journal-rep-masters-san", text: move.san });

		const moveTotal = move.white + move.draws + move.black;
		row.createEl("td", { cls: "chess-journal-rep-masters-games", text: moveTotal.toLocaleString() });

		const barTd = row.createEl("td");
		const bar = barTd.createDiv({ cls: "chess-journal-wdl-bar" });
		if (moveTotal > 0) {
			const wPct = (move.white / moveTotal) * 100;
			const dPct = (move.draws / moveTotal) * 100;
			const bPct = (move.black / moveTotal) * 100;
			if (wPct > 0) {
				const seg = bar.createDiv({ cls: "chess-journal-wdl-bar-white" });
				seg.style.width = `${wPct.toFixed(1)}%`;
				seg.title = `White: ${wPct.toFixed(1)}%`;
			}
			if (dPct > 0) {
				const seg = bar.createDiv({ cls: "chess-journal-wdl-bar-draw" });
				seg.style.width = `${dPct.toFixed(1)}%`;
				seg.title = `Draw: ${dPct.toFixed(1)}%`;
			}
			if (bPct > 0) {
				const seg = bar.createDiv({ cls: "chess-journal-wdl-bar-black" });
				seg.style.width = `${bPct.toFixed(1)}%`;
				seg.title = `Black: ${bPct.toFixed(1)}%`;
			}
		}

		if (move.averageRating) {
			row.createEl("td", { cls: "chess-journal-rep-masters-rating", text: String(move.averageRating) });
		} else {
			row.createEl("td");
		}
	}

	private playMastersMove(san: string): void {
		const move = this.chess.move(san);
		if (!move) return;
		const currentNode = this.getCurrentNode();
		const existing = currentNode.children.find(c => c.san === san);
		if (!existing) {
			const epd = this.chess.fen().split(" ").slice(0, 4).join(" ");
			currentNode.children.push({ san, epd, children: [] });
			this.requestSave();
		}
		this.currentPath = [...this.currentPath, san];
		this.render();
	}

	private renderNoteSection(container: HTMLElement): void {
		const epd = this.chess.fen().split(" ").slice(0, 4).join(" ");
		const noteSection = container.createDiv({ cls: "chess-journal-rep-note-section" });

		const abstractFile = this.noteIndex.get(epd);
		if (abstractFile) {
			const noteHeader = noteSection.createDiv({ cls: "chess-journal-rep-note-header" });
			const openBtn = noteHeader.createEl("button", { cls: "chess-journal-rep-note-open-btn" });
			setIcon(openBtn, "external-link");
			openBtn.setAttribute("aria-label", "Open note for editing");
			openBtn.addEventListener("click", () => {
				this.app.workspace.getLeaf(true).openFile(abstractFile);
			});
			const noteContent = noteSection.createDiv({ cls: "chess-journal-rep-note-content" });
			this.renderNoteContent(noteContent, abstractFile);
			return;
		}

		const addBtn = noteSection.createEl("button", {
			cls: "chess-journal-rep-add-note-btn",
			text: "+ Add note for this position",
		});
		addBtn.addEventListener("click", async () => {
			const node = this.getCurrentNode();
			const epd = this.chess.fen().split(" ").slice(0, 4).join(" ");
			const ecoMatch = this.getEcoForEpd(epd);
			const folder = this.settings.repertoireNotesFolder;
			const repName = this.file?.basename ?? "Repertoire";

			try {
				const noteFile = await createRepertoireNote(
					this.app, folder, this.currentPath, epd, repName,
					ecoMatch?.eco ?? null,
					ecoMatch?.name ?? null,
				);
				this.pendingNote = { epd, file: noteFile };
				this.requestSave();
				this.render();
			} catch (e) {
				new Notice(`Failed to create note: ${e.message}`);
			}
		});
	}

	private async renderNoteContent(container: HTMLElement, noteFile: TFile): Promise<void> {
		const content = await this.app.vault.read(noteFile);
		await MarkdownRenderer.render(this.app, content, container, noteFile.path, this);
	}

	// -------------------------------------------------------------------------
	// Board instantiation & input
	// -------------------------------------------------------------------------

	private instantiateBoard(): void {
		const boardEl = this.contentEl.querySelector<HTMLElement>(".chess-journal-rep-board");
		if (!boardEl) return;

		const orientation = this.repertoire.color === "black" ? COLOR.black : COLOR.white;

		this.board = new Chessboard(boardEl, {
			position: this.chess.fen() || START_FEN,
			orientation,
			assetsUrl: "",
			assetsCache: true,
			style: {
				cssClass: "chess-journal",
				showCoordinates: true,
				pieces: { file: `pieces/${this.settings.pieceSet}.svg` },
			},
		});

		const moveColor = this.chess.turn() === "w" ? COLOR.white : COLOR.black;

		(this.board as any).enableMoveInput((event: any) => {
			switch (event.type) {
				case INPUT_EVENT_TYPE.moveInputStarted:
					return true;

				case INPUT_EVENT_TYPE.validateMoveInput: {
					const move = this.chess.move({
						from: event.squareFrom,
						to: event.squareTo,
						promotion: "q",
					});
					if (!move) return false;

					const san = move.san;
					const currentNode = this.getCurrentNode();
					const existing = currentNode.children.find(c => c.san === san);
					if (!existing) {
						const epd = this.chess.fen().split(" ").slice(0, 4).join(" ");
						currentNode.children.push({ san, epd, children: [] });
						this.requestSave();
					}
					this.currentPath = [...this.currentPath, san];
					window.setTimeout(() => this.render(), 200);
					return true;
				}

				case INPUT_EVENT_TYPE.moveInputCanceled:
					return;
			}
		}, moveColor);
	}

	private destroyBoard(): void {
		if (this.boardRafId !== null) {
			window.cancelAnimationFrame(this.boardRafId);
			this.boardRafId = null;
		}
		if (this.board) {
			this.board.destroy();
			this.board = null;
		}
	}

	// -------------------------------------------------------------------------
	// Tree view — linear segment rendering
	//
	// A "linear segment" is a maximal run of nodes where each has exactly one
	// child. These are collapsed into a single row so that forcing sequences
	// (or deep trunk lines like the Najdorf) don't require move-by-move
	// expansion to reach the first branch point.
	// -------------------------------------------------------------------------

	/**
	 * Ensure every ancestor segment of currentPath is expanded so the active
	 * row is visible when the tree renders.
	 */
	private expandPathToCurrentInTree(): void {
		if (this.currentPath.length === 0) return;
		this.expandAlongPath(this.repertoire.root, []);
	}

	private expandAlongPath(node: RepertoireNode, pathSoFar: string[]): void {
		const child = node.children.find(c => c.san === this.currentPath[pathSoFar.length]);
		if (!child?.san) return;

		// Collect the linear chain from this child
		const chain: RepertoireNode[] = [child];
		while (chain[chain.length - 1].children.length === 1) {
			chain.push(chain[chain.length - 1].children[0]);
		}

		const pathToFirst = [...pathSoFar, child.san];
		const pathToLast = chain.length === 1
			? pathToFirst
			: [...pathToFirst, ...chain.slice(1).map(n => n.san!)];
		const pathKey = pathToLast.join(" ");
		const currentKey = this.currentPath.join(" ");

		// If currentPath goes deeper than this segment, expand it and recurse
		if (currentKey.startsWith(pathKey + " ")) {
			this.expandedTreePaths.add(pathKey);
			this.expandAlongPath(chain[chain.length - 1], pathToLast);
		}
	}

	private renderTreeView(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: "chess-journal-rep-tree-toolbar" });
		const ecoBtn = toolbar.createEl("button", { cls: "chess-journal-rep-tree-eco-btn" });
		setIcon(ecoBtn, "tag");
		ecoBtn.setAttribute("aria-label", "Show ECO labels");
		if (this.showEcoLabels) ecoBtn.classList.add("is-active");
		ecoBtn.addEventListener("click", () => { this.showEcoLabels = !this.showEcoLabels; this.render(); });

		this.expandPathToCurrentInTree();

		const tree = container.createDiv({ cls: "chess-journal-rep-tree" });

		if (this.repertoire.root.children.length === 0) {
			tree.createDiv({
				cls: "chess-journal-rep-empty-hint",
				text: "No lines in repertoire yet. Switch to board view to add moves.",
			});
			return;
		}

		for (const child of this.repertoire.root.children) {
			if (child.san) {
				this.renderLinearSegment(tree, child, [child.san], 1);
			}
		}

		// Scroll active segment into view after layout
		window.requestAnimationFrame(() => {
			const active = tree.querySelector<HTMLElement>(".chess-journal-rep-tree-header.is-active");
			active?.scrollIntoView({ block: "nearest" });
		});
	}

	/**
	 * Render a linear segment starting at firstNode.
	 *
	 * @param pathToFirst  Full SAN path from root to firstNode (inclusive).
	 * @param startPly     1-based ply of firstNode (equals pathToFirst.length).
	 */
	private renderLinearSegment(
		container: HTMLElement,
		firstNode: RepertoireNode,
		pathToFirst: string[],
		startPly: number,
	): void {
		// Collect the linear chain: keep going while there is exactly one child
		const chain: RepertoireNode[] = [firstNode];
		while (chain[chain.length - 1].children.length === 1) {
			chain.push(chain[chain.length - 1].children[0]);
		}

		const lastNode = chain[chain.length - 1];
		const pathToLast = chain.length === 1
			? pathToFirst
			: [...pathToFirst, ...chain.slice(1).map(n => n.san!)];
		const pathKey = pathToLast.join(" ");

		const isLeaf = lastNode.children.length === 0;
		const isExpanded = !isLeaf && this.expandedTreePaths.has(pathKey);

		// A segment is "active" if the current path falls anywhere within it
		const currentKey = this.currentPath.join(" ");
		const isActive = this.currentPath.length >= pathToFirst.length &&
			this.currentPath.length <= pathToLast.length &&
			pathToLast.slice(0, this.currentPath.length).join(" ") === currentKey;

		const nodeEl = container.createDiv({ cls: "chess-journal-rep-tree-node" });
		const header = nodeEl.createDiv({ cls: "chess-journal-rep-tree-header" + (isActive ? " is-active" : "") });

		// Expand/collapse toggle (only when there are branches)
		const toggleEl = header.createSpan({ cls: "chess-journal-explorer-toggle" });
		if (!isLeaf) {
			setIcon(toggleEl, isExpanded ? "chevron-down" : "chevron-right");
			toggleEl.addEventListener("click", (e) => {
				e.stopPropagation();
				if (this.expandedTreePaths.has(pathKey)) {
					this.expandedTreePaths.delete(pathKey);
				} else {
					this.expandedTreePaths.add(pathKey);
				}
				this.render();
			});
		}

		// Move sequence
		const movesEl = header.createSpan({ cls: "chess-journal-rep-tree-moves" });
		chain.forEach((node, i) => {
			const ply = startPly + i;
			const moveNum = Math.ceil(ply / 2);
			const isWhite = ply % 2 === 1;

			if (i > 0) movesEl.createSpan({ text: " " });
			const moveEl = movesEl.createSpan({ cls: "chess-journal-rep-tree-move" });
			if (isWhite) {
				moveEl.createSpan({ cls: "chess-journal-rep-tree-move-num", text: `${moveNum}.` });
				moveEl.createSpan({ text: ` ${node.san}` });
			} else if (i === 0) {
				// First move in chain and it's black's — show move number with ellipsis
				moveEl.createSpan({ cls: "chess-journal-rep-tree-move-num", text: `${moveNum}...` });
				moveEl.createSpan({ text: node.san! });
			} else {
				moveEl.setText(node.san!);
			}
		});

		// ECO label for the last node in the chain
		if (this.showEcoLabels) {
			const eco = this.getEcoForEpd(lastNode.epd);
			if (eco) {
				const shortName = eco.name.includes(":")
				? eco.name.split(":").slice(1).join(":").trim()
				: eco.name;
			header.createSpan({ cls: "chess-journal-rep-tree-eco", text: `${shortName} (${eco.eco})` });
			}
		}

		// Note indicator if any node in the chain has a linked note
		if (chain.some(n => this.noteIndex.has(n.epd))) {
			const noteIcon = header.createSpan({ cls: "chess-journal-rep-tree-note-icon" });
			setIcon(noteIcon, "file-text");
		}

		// Right-click to delete
		header.addEventListener("contextmenu", (e: MouseEvent) => {
			e.preventDefault();
			const menu = new Menu();
			menu.addItem(item => item.setTitle("Delete move").setIcon("trash-2")
				.onClick(() => this.confirmDelete(pathToFirst)));
			menu.showAtMouseEvent(e);
		});

		// Clicking the moves area navigates to the end of the chain in board view
		movesEl.addEventListener("click", () => {
			this.currentPath = pathToLast;
			this.viewMode = "board";
			this.render();
		});

		if (isLeaf || !isExpanded) return;

		const childrenEl = nodeEl.createDiv({ cls: "chess-journal-rep-tree-children" });
		for (const child of lastNode.children) {
			if (child.san) {
				this.renderLinearSegment(
					childrenEl,
					child,
					[...pathToLast, child.san],
					startPly + chain.length,
				);
			}
		}
	}
}
