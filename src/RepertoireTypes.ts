export interface RepertoireNode {
	san: string | null;       // null for the root node
	epd: string;              // first 4 FEN fields — position identity
	noteFile: string | null;  // vault-relative path to linked markdown note
	children: RepertoireNode[];
}

export interface RepertoireData {
	version: 1;
	color: "white" | "black";
	root: RepertoireNode;
}
