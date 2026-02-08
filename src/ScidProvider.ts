import { Chess } from "chess.js";
import { GameProvider, GameHeaders, GameEntry, GameSearchResult } from "./GameProvider";
import { ScidDatabase, ScidGameHeaders, ScidMove } from "./scid/index";

export class ScidProvider implements GameProvider {
	private db = new ScidDatabase();

	async open(path: string): Promise<void> {
		this.db.open(path);
	}

	close(): void {
		this.db.close();
	}

	getGameCount(): number {
		return this.db.getGameCount();
	}

	getGames(offset: number, limit: number): GameEntry[] {
		const count = this.db.getGameCount();
		const end = Math.min(offset + limit, count);
		const entries: GameEntry[] = [];

		for (let i = offset; i < end; i++) {
			entries.push({
				index: i,
				headers: scidHeadersToGameHeaders(this.db.getHeaders(i)),
			});
		}

		return entries;
	}

	getGamePgn(index: number): string {
		const game = this.db.getGame(index);

		const headerLines = buildPgnHeaders(game.headers);
		const movetext = buildMovetext(game.moves);

		return headerLines + "\n" + movetext + " " + game.headers.result;
	}

	search(query: string, offset: number, limit: number): GameSearchResult {
		const result = this.db.search(query, offset, limit);

		const games: GameEntry[] = result.results.map(i => ({
			index: i,
			headers: scidHeadersToGameHeaders(this.db.getHeaders(i)),
		}));

		return { games, total: result.total };
	}
}

function scidHeadersToGameHeaders(h: ScidGameHeaders): GameHeaders {
	const headers: GameHeaders = {
		Event: h.event,
		Site: h.site,
		Date: h.date,
		Round: h.round,
		White: h.white,
		Black: h.black,
		Result: h.result,
	};
	if (h.whiteElo > 0) headers["WhiteElo"] = String(h.whiteElo);
	if (h.blackElo > 0) headers["BlackElo"] = String(h.blackElo);
	if (h.eco) headers["ECO"] = h.eco;
	return headers;
}

function buildPgnHeaders(h: ScidGameHeaders): string {
	const tags: [string, string][] = [
		["Event", h.event],
		["Site", h.site],
		["Date", h.date],
		["Round", h.round],
		["White", h.white],
		["Black", h.black],
		["Result", h.result],
	];
	if (h.whiteElo > 0) tags.push(["WhiteElo", String(h.whiteElo)]);
	if (h.blackElo > 0) tags.push(["BlackElo", String(h.blackElo)]);
	if (h.eco) tags.push(["ECO", h.eco]);

	return tags.map(([k, v]) => `[${k} "${v}"]`).join("\n");
}

/**
 * Convert ScidMove[] ({from, to, promotion}) to SAN movetext using chess.js.
 */
function buildMovetext(moves: ScidMove[]): string {
	const chess = new Chess();
	const sanMoves: string[] = [];

	for (const m of moves) {
		try {
			const result = chess.move(m);
			sanMoves.push(result.san);
		} catch {
			// If a move fails, stop here
			break;
		}
	}

	// Format with move numbers
	const parts: string[] = [];
	for (let i = 0; i < sanMoves.length; i++) {
		if (i % 2 === 0) {
			parts.push(`${Math.floor(i / 2) + 1}.`);
		}
		parts.push(sanMoves[i]);
	}

	return parts.join(" ");
}
