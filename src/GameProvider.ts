import { ExternalSource } from "./settings";
import { PgnProvider } from "./PgnProvider";
import { ScidProvider } from "./ScidProvider";
import { ChessComProvider } from "./ChessComProvider";

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
	open(): Promise<void>;
	close(): void;
	getGameCount(): number;
	getGames(offset: number, limit: number): GameEntry[];
	getGamePgn(index: number): string;
	search(query: string, offset: number, limit: number): GameSearchResult;
}

export function createProvider(source: ExternalSource): GameProvider {
	switch (source.type) {
		case "pgn":
			return new PgnProvider(source.path);
		case "scid":
			return new ScidProvider(source.path);
		case "chesscom":
			return new ChessComProvider(source.usernames);
		default:
			throw new Error(`Unsupported source type: ${(source as any).type}`);
	}
}
