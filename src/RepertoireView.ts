import {
	MarkdownRenderer,
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

export const VIEW_TYPE_REPERTOIRE = "chess-journal-repertoire";

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

	constructor(leaf: WorkspaceLeaf, settings: ChessJournalSettings) {
		super(leaf);
		this.settings = settings;
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
		this.destroyBoard();
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	private defaultRepertoire(): RepertoireData {
		return {
			version: 1,
			color: "black",
			root: { san: null, epd: START_EPD, noteFile: null, children: [] },
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
		// ply 1 = white's first move, ply 2 = black's first move, etc.
		const isWhiteMove = ply % 2 === 1;
		return this.repertoire.color === "white" ? isWhiteMove : !isWhiteMove;
	}

	private getEcoForEpd(epd: string): { eco: string; name: string } | null {
		const match = ECO_DATA.find(e => e.epd === epd);
		return match ? { eco: match.eco, name: match.name } : null;
	}

	// -------------------------------------------------------------------------
	// Render
	// -------------------------------------------------------------------------

	private render(): void {
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

		// Colour badge (informational)
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
		}
	}

	private renderNoteSection(container: HTMLElement): void {
		const currentNode = this.getCurrentNode();
		const noteSection = container.createDiv({ cls: "chess-journal-rep-note-section" });

		if (currentNode.noteFile) {
			const abstractFile = this.app.vault.getAbstractFileByPath(currentNode.noteFile);
			if (abstractFile instanceof TFile) {
				this.renderNoteContent(noteSection, abstractFile);
				return;
			}
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
					this.app, folder, epd, repName,
					ecoMatch?.eco ?? null,
					ecoMatch?.name ?? null,
				);
				node.noteFile = noteFile.path;
				this.requestSave();
				await this.app.workspace.getLeaf(true).openFile(noteFile);
				this.render();
			} catch (e) {
				new Notice(`Failed to create note: ${e.message}`);
			}
		});
	}

	private async renderNoteContent(container: HTMLElement, noteFile: TFile): Promise<void> {
		const content = await this.app.vault.read(noteFile);
		if (!container.isConnected) return;
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
						currentNode.children.push({ san, epd, noteFile: null, children: [] });
						this.requestSave();
					}
					this.currentPath = [...this.currentPath, san];
					// Re-render after the piece animation finishes
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
	// Tree view
	// -------------------------------------------------------------------------

	private renderTreeView(container: HTMLElement): void {
		const tree = container.createDiv({ cls: "chess-journal-rep-tree" });

		if (this.repertoire.root.children.length === 0) {
			tree.createDiv({
				cls: "chess-journal-rep-empty-hint",
				text: "No lines in repertoire yet. Switch to board view to add moves.",
			});
			return;
		}

		for (const child of this.repertoire.root.children) {
			if (child.san) this.renderTreeNode(tree, child, [child.san], 1);
		}
	}

	private renderTreeNode(
		container: HTMLElement,
		node: RepertoireNode,
		path: string[],
		ply: number,
	): void {
		if (!node.san) return;

		const pathKey = path.join(" ");
		const isExpanded = this.expandedTreePaths.has(pathKey);
		const hasChildren = node.children.length > 0;
		const isMine = this.isMyPly(ply);

		const moveNum = Math.ceil(ply / 2);
		const moveLabel = ply % 2 === 1
			? `${moveNum}. ${node.san}`
			: `${moveNum}...${node.san}`;

		const nodeEl = container.createDiv({ cls: "chess-journal-rep-tree-node" });
		const header = nodeEl.createDiv({
			cls: "chess-journal-rep-tree-header" + (isMine ? " is-mine" : ""),
		});

		const toggleEl = header.createSpan({ cls: "chess-journal-explorer-toggle" });
		if (hasChildren) {
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

		const sanEl = header.createSpan({ cls: "chess-journal-rep-tree-san", text: moveLabel });
		sanEl.addEventListener("click", () => {
			this.currentPath = path;
			this.viewMode = "board";
			this.render();
		});

		if (node.noteFile) {
			const noteIcon = header.createSpan({ cls: "chess-journal-rep-tree-note-icon" });
			setIcon(noteIcon, "file-text");
		}

		if (!isExpanded || !hasChildren) return;

		const childrenEl = nodeEl.createDiv({ cls: "chess-journal-rep-tree-children" });
		for (const child of node.children) {
			if (child.san) {
				this.renderTreeNode(childrenEl, child, [...path, child.san], ply + 1);
			}
		}
	}
}
