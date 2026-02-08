import { ExternalSourceType } from "./settings";
import { PgnProvider } from "./PgnProvider";
import { ScidProvider } from "./ScidProvider";

export interface GameHeaders {
	[key: string]: string;
}

export interface GameEntry {
	index: number;
	headers: GameHeaders;
}

export interface GameSearchResult {
	games: GameEntry[];
	total: number;
}

export interface GameProvider {
	open(path: string): Promise<void>;
	close(): void;
	getGameCount(): number;
	getGames(offset: number, limit: number): GameEntry[];
	getGamePgn(index: number): string;
	search(query: string, offset: number, limit: number): GameSearchResult;
}

export function createProvider(type: ExternalSourceType): GameProvider {
	switch (type) {
		case "pgn":
			return new PgnProvider();
		case "scid":
			return new ScidProvider();
		default:
			throw new Error(`Unsupported source type: ${type}`);
	}
}
