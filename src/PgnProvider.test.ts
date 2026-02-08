import { describe, it, expect, beforeEach } from "vitest";
import { PgnProvider } from "./PgnProvider";

function createProvider(content: string): PgnProvider {
	const provider = new PgnProvider();
	provider.loadContent(content);
	return provider;
}

const GAME_1 = `[Event "Test Tournament"]
[Site "London"]
[Date "2024.01.01"]
[Round "1"]
[White "Player A"]
[Black "Player B"]
[Result "1-0"]
[ECO "B01"]

1.e4 d5 2.exd5 Qxd5 3.Nc3 Qa5 4.d4 Nf6 5.Nf3 1-0`;

const GAME_2 = `[Event "Test Tournament"]
[Site "London"]
[Date "2024.01.02"]
[Round "2"]
[White "Player C"]
[Black "Player D"]
[Result "0-1"]
[ECO "C50"]

1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 0-1`;

const GAME_3 = `[Event "Other Event"]
[Site "Paris"]
[Date "2024.02.15"]
[Round "1"]
[White "Smith, John"]
[Black "Jones, Mary"]
[Result "1/2-1/2"]
[ECO "D35"]

1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.cxd5 exd5 1/2-1/2`;

describe("PgnProvider", () => {
	describe("game splitting with Unix line endings (LF)", () => {
		it("parses a single game", () => {
			const provider = createProvider(GAME_1);
			expect(provider.getGameCount()).toBe(1);
		});

		it("parses multiple games separated by blank lines", () => {
			const content = GAME_1 + "\n\n" + GAME_2 + "\n\n" + GAME_3;
			const provider = createProvider(content);
			expect(provider.getGameCount()).toBe(3);
		});

		it("handles extra blank lines between games", () => {
			const content = GAME_1 + "\n\n\n\n" + GAME_2;
			const provider = createProvider(content);
			expect(provider.getGameCount()).toBe(2);
		});

		it("handles trailing newlines", () => {
			const content = GAME_1 + "\n\n" + GAME_2 + "\n\n";
			const provider = createProvider(content);
			expect(provider.getGameCount()).toBe(2);
		});
	});

	describe("game splitting with Windows line endings (CRLF)", () => {
		function toCRLF(s: string): string {
			return s.replace(/\n/g, "\r\n");
		}

		it("parses a single game with CRLF", () => {
			const provider = createProvider(toCRLF(GAME_1));
			expect(provider.getGameCount()).toBe(1);
		});

		it("parses multiple games separated by CRLF blank lines", () => {
			const content = toCRLF(GAME_1) + "\r\n\r\n" + toCRLF(GAME_2) + "\r\n\r\n" + toCRLF(GAME_3);
			const provider = createProvider(content);
			expect(provider.getGameCount()).toBe(3);
		});

		it("handles extra CRLF blank lines between games", () => {
			const content = toCRLF(GAME_1) + "\r\n\r\n\r\n\r\n" + toCRLF(GAME_2);
			const provider = createProvider(content);
			expect(provider.getGameCount()).toBe(2);
		});
	});

	describe("header parsing", () => {
		it("extracts all headers from a game", () => {
			const provider = createProvider(GAME_1);
			const games = provider.getGames(0, 1);
			expect(games[0].headers["Event"]).toBe("Test Tournament");
			expect(games[0].headers["White"]).toBe("Player A");
			expect(games[0].headers["Black"]).toBe("Player B");
			expect(games[0].headers["Result"]).toBe("1-0");
			expect(games[0].headers["ECO"]).toBe("B01");
			expect(games[0].headers["Date"]).toBe("2024.01.01");
			expect(games[0].headers["Site"]).toBe("London");
			expect(games[0].headers["Round"]).toBe("1");
		});

		it("parses headers with CRLF line endings", () => {
			const provider = createProvider(GAME_1.replace(/\n/g, "\r\n"));
			const games = provider.getGames(0, 1);
			expect(games[0].headers["White"]).toBe("Player A");
			expect(games[0].headers["Black"]).toBe("Player B");
		});
	});

	describe("getGames pagination", () => {
		let provider: PgnProvider;

		beforeEach(() => {
			const content = GAME_1 + "\n\n" + GAME_2 + "\n\n" + GAME_3;
			provider = createProvider(content);
		});

		it("returns all games when limit exceeds count", () => {
			const games = provider.getGames(0, 100);
			expect(games.length).toBe(3);
		});

		it("returns correct slice with offset and limit", () => {
			const games = provider.getGames(1, 1);
			expect(games.length).toBe(1);
			expect(games[0].headers["White"]).toBe("Player C");
			expect(games[0].index).toBe(1);
		});

		it("returns empty array when offset is past end", () => {
			const games = provider.getGames(10, 10);
			expect(games.length).toBe(0);
		});

		it("assigns correct indices", () => {
			const games = provider.getGames(0, 3);
			expect(games[0].index).toBe(0);
			expect(games[1].index).toBe(1);
			expect(games[2].index).toBe(2);
		});
	});

	describe("getGamePgn", () => {
		let provider: PgnProvider;
		const content = GAME_1 + "\n\n" + GAME_2 + "\n\n" + GAME_3;

		beforeEach(() => {
			provider = createProvider(content);
		});

		it("returns full PGN text for a game", () => {
			const pgn = provider.getGamePgn(0);
			expect(pgn).toContain('[White "Player A"]');
			expect(pgn).toContain("1.e4 d5");
			expect(pgn).toContain("1-0");
		});

		it("returns correct PGN for second game", () => {
			const pgn = provider.getGamePgn(1);
			expect(pgn).toContain('[White "Player C"]');
			expect(pgn).toContain("1.e4 e5");
		});

		it("returns correct PGN for third game", () => {
			const pgn = provider.getGamePgn(2);
			expect(pgn).toContain('[White "Smith, John"]');
			expect(pgn).toContain("1.d4 d5");
		});

		it("does not include content from adjacent games", () => {
			const pgn = provider.getGamePgn(0);
			expect(pgn).not.toContain("Player C");
			expect(pgn).not.toContain("Player D");
		});

		it("returns empty string for invalid index", () => {
			expect(provider.getGamePgn(99)).toBe("");
			expect(provider.getGamePgn(-1)).toBe("");
		});

		it("returns valid PGN for games with CRLF endings", () => {
			const crlfContent = content.replace(/\n/g, "\r\n");
			const crlfProvider = createProvider(crlfContent);
			const pgn = crlfProvider.getGamePgn(1);
			expect(pgn).toContain('[White "Player C"]');
			expect(pgn).toContain("1.e4 e5");
		});
	});

	describe("search", () => {
		let provider: PgnProvider;

		beforeEach(() => {
			const content = GAME_1 + "\n\n" + GAME_2 + "\n\n" + GAME_3;
			provider = createProvider(content);
		});

		it("finds games by player name", () => {
			const result = provider.search("Player A", 0, 50);
			expect(result.total).toBe(1);
			expect(result.games[0].headers["White"]).toBe("Player A");
		});

		it("search is case-insensitive", () => {
			const result = provider.search("player a", 0, 50);
			expect(result.total).toBe(1);
		});

		it("finds games by event name", () => {
			const result = provider.search("Other Event", 0, 50);
			expect(result.total).toBe(1);
			expect(result.games[0].headers["White"]).toBe("Smith, John");
		});

		it("finds games by site", () => {
			const result = provider.search("Paris", 0, 50);
			expect(result.total).toBe(1);
		});

		it("finds games by ECO code", () => {
			const result = provider.search("C50", 0, 50);
			expect(result.total).toBe(1);
			expect(result.games[0].headers["White"]).toBe("Player C");
		});

		it("returns multiple matches", () => {
			const result = provider.search("Test Tournament", 0, 50);
			expect(result.total).toBe(2);
		});

		it("returns empty results for no match", () => {
			const result = provider.search("nonexistent", 0, 50);
			expect(result.total).toBe(0);
			expect(result.games.length).toBe(0);
		});

		it("paginates search results", () => {
			const result = provider.search("Test Tournament", 0, 1);
			expect(result.total).toBe(2);
			expect(result.games.length).toBe(1);

			const page2 = provider.search("Test Tournament", 1, 1);
			expect(page2.total).toBe(2);
			expect(page2.games.length).toBe(1);
			expect(page2.games[0].headers["White"]).not.toBe(result.games[0].headers["White"]);
		});

		it("preserves original indices in search results", () => {
			const result = provider.search("Other Event", 0, 50);
			expect(result.games[0].index).toBe(2);
		});
	});

	describe("close", () => {
		it("clears all data", () => {
			const provider = createProvider(GAME_1 + "\n\n" + GAME_2);
			expect(provider.getGameCount()).toBe(2);
			provider.close();
			expect(provider.getGameCount()).toBe(0);
		});
	});
});
