import * as fs from "fs";
import { GameProvider, GameHeaders, GameEntry, GameSearchResult } from "./GameProvider";

interface GameIndex {
	start: number;
	end: number;
	headers: GameHeaders;
}

export class PgnProvider implements GameProvider {
	private fileContent: string = "";
	private games: GameIndex[] = [];

	async open(path: string): Promise<void> {
		const raw = fs.readFileSync(path, "utf-8");
		this.loadContent(raw);
	}

	loadContent(raw: string): void {
		this.fileContent = raw.replace(/\r\n/g, "\n");
		this.indexGames();
	}

	close(): void {
		this.fileContent = "";
		this.games = [];
	}

	getGameCount(): number {
		return this.games.length;
	}

	getGames(offset: number, limit: number): GameEntry[] {
		return this.games.slice(offset, offset + limit).map((g, i) => ({
			index: offset + i,
			headers: g.headers,
		}));
	}

	getGamePgn(index: number): string {
		const game = this.games[index];
		if (!game) return "";
		return this.fileContent.substring(game.start, game.end).trim();
	}

	search(query: string, offset: number, limit: number): GameSearchResult {
		const lowerQuery = query.toLowerCase();
		const matches: GameEntry[] = [];

		for (let i = 0; i < this.games.length; i++) {
			const headers = this.games[i].headers;
			const found = Object.values(headers).some(
				v => v.toLowerCase().includes(lowerQuery)
			);
			if (found) {
				matches.push({ index: i, headers });
			}
		}

		return {
			games: matches.slice(offset, offset + limit),
			total: matches.length,
		};
	}

	private indexGames(): void {
		this.games = [];
		const chunks = this.fileContent.split(/\n\n(?=\[)/);
		const headerRegex = /^\[(\w+)\s+"(.*)"\]/gm;

		let position = 0;
		for (const chunk of chunks) {
			const trimmed = chunk.trim();
			if (trimmed.length === 0) {
				position += chunk.length + 2;
				continue;
			}

			const headers: GameHeaders = {};
			let match: RegExpExecArray | null;
			headerRegex.lastIndex = 0;
			while ((match = headerRegex.exec(trimmed)) !== null) {
				headers[match[1]] = match[2];
			}

			// Only index chunks that have at least one header
			if (Object.keys(headers).length > 0) {
				const start = this.fileContent.indexOf(trimmed, position);
				this.games.push({
					start,
					end: start + trimmed.length,
					headers,
				});
			}

			position += chunk.length + 2; // +2 for the \n\n separator
		}
	}
}
