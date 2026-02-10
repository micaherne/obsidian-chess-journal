import { requestUrl } from "obsidian";
import { GameProvider, GameHeaders, GameEntry, GameSearchResult } from "./GameProvider";
import { PgnProvider } from "./PgnProvider";
import { ChessComCache } from "./ChessComCache";

const API_BASE = "https://api.chess.com/pub/player";

export class ChessComProvider implements GameProvider {
	private usernames: string[];
	private inner = new PgnProvider();
	private cache = new ChessComCache();
	private gameOwnership: string[] = [];
	private usernameFilter: string | null = null;
	private filteredIndices: number[] | null = null;

	constructor(usernames: string[]) {
		this.usernames = usernames;
	}

	async open(): Promise<void> {
		await this.cache.open();

		const now = new Date();
		const currentKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

		// Fetch PGN per user and count games individually
		const userPgns: { username: string; pgn: string; count: number }[] = [];
		for (const username of this.usernames) {
			const pgn = await this.fetchUserPgn(username, currentKey);
			if (!pgn.trim()) {
				userPgns.push({ username, pgn: "", count: 0 });
				continue;
			}
			const temp = new PgnProvider();
			temp.loadContent(pgn);
			const count = temp.getGameCount();
			temp.close();
			userPgns.push({ username, pgn, count });
		}

		// Build combined PGN and ownership array
		const allPgn: string[] = [];
		for (const { username, pgn, count } of userPgns) {
			if (pgn) allPgn.push(pgn);
			for (let i = 0; i < count; i++) {
				this.gameOwnership.push(username);
			}
		}

		this.inner.loadContent(allPgn.join("\n\n"));

		// Sort games by Date header so date-based ordering works correctly
		const perm = this.inner.sortByDate();
		this.gameOwnership = perm.map(i => this.gameOwnership[i]);
	}

	close(): void {
		this.inner.close();
		this.cache.close();
		this.gameOwnership = [];
		this.usernameFilter = null;
		this.filteredIndices = null;
	}

	getUsernames(): string[] {
		return this.usernames;
	}

	setUsernameFilter(username: string | null): void {
		this.usernameFilter = username;
		if (username === null) {
			this.filteredIndices = null;
		} else {
			this.filteredIndices = [];
			for (let i = 0; i < this.gameOwnership.length; i++) {
				if (this.gameOwnership[i] === username) {
					this.filteredIndices.push(i);
				}
			}
		}
	}

	getGameCount(): number {
		if (this.filteredIndices !== null) {
			return this.filteredIndices.length;
		}
		return this.inner.getGameCount();
	}

	getGames(offset: number, limit: number): GameEntry[] {
		if (this.filteredIndices !== null) {
			const slice = this.filteredIndices.slice(offset, offset + limit);
			return slice.map((realIndex, i) => {
				const entry = this.inner.getGames(realIndex, 1)[0];
				return { index: offset + i, headers: entry.headers };
			});
		}
		return this.inner.getGames(offset, limit);
	}

	getGamePgn(index: number): string {
		const realIndex = this.toRealIndex(index);
		return this.inner.getGamePgn(realIndex);
	}

	search(query: string, offset: number, limit: number): GameSearchResult {
		if (this.filteredIndices !== null) {
			const lowerQuery = query.toLowerCase();
			const matches: GameEntry[] = [];

			for (let i = 0; i < this.filteredIndices.length; i++) {
				const realIndex = this.filteredIndices[i];
				const entry = this.inner.getGames(realIndex, 1)[0];
				const found = Object.values(entry.headers).some(
					v => v.toLowerCase().includes(lowerQuery)
				);
				if (found) {
					matches.push({ index: i, headers: entry.headers });
				}
			}

			return {
				games: matches.slice(offset, offset + limit),
				total: matches.length,
			};
		}
		return this.inner.search(query, offset, limit);
	}

	private toRealIndex(index: number): number {
		if (this.filteredIndices !== null) {
			return this.filteredIndices[index] ?? -1;
		}
		return index;
	}

	private async fetchUserPgn(username: string, currentMonthKey: string): Promise<string> {
		const archivesUrl = `${API_BASE}/${encodeURIComponent(username)}/games/archives`;
		const archivesResp = await requestUrl({ url: archivesUrl });
		const archives: string[] = archivesResp.json.archives ?? [];

		const pgnParts: string[] = [];

		for (const archiveUrl of archives) {
			// Extract YYYY/MM from archive URL
			const match = archiveUrl.match(/\/(\d{4})\/(\d{2})$/);
			if (!match) continue;
			const monthKey = `${match[1]}/${match[2]}`;
			const cacheKey = `${username}/${monthKey}`;
			const isCurrentMonth = monthKey === currentMonthKey;

			let pgn: string | undefined;
			if (!isCurrentMonth) {
				pgn = await this.cache.get(cacheKey);
			}

			if (pgn === undefined) {
				const pgnUrl = `${archiveUrl}/pgn`;
				const resp = await requestUrl({ url: pgnUrl });
				pgn = resp.text;

				if (!isCurrentMonth && pgn) {
					await this.cache.put(cacheKey, pgn);
				}
			}

			if (pgn && pgn.trim()) {
				pgnParts.push(pgn.trim());
			}
		}

		return pgnParts.join("\n\n");
	}

}
