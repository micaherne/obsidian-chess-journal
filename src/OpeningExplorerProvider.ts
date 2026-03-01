export interface OpeningExplorerMove {
	uci: string;
	san: string;
	white: number;
	draws: number;
	black: number;
	averageRating?: number;
}

export interface OpeningExplorerResult {
	white: number;
	draws: number;
	black: number;
	moves: OpeningExplorerMove[];
}

export interface OpeningExplorerProvider {
	readonly name: string;
	getMoves(fen: string): Promise<OpeningExplorerResult>;
}
