import { requestUrl } from "obsidian";
import { ChessJournalSettings } from "./settings";
import { OpeningExplorerProvider, OpeningExplorerResult } from "./OpeningExplorerProvider";

export class LichessMastersProvider implements OpeningExplorerProvider {
	readonly name = "Lichess Masters";

	constructor(private readonly settings: ChessJournalSettings) {}

	async getMoves(fen: string): Promise<OpeningExplorerResult> {
		const url = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&topGames=0`;
		const headers: Record<string, string> = {};
		if (this.settings.lichessApiKey) {
			headers["Authorization"] = `Bearer ${this.settings.lichessApiKey}`;
		}
		const response = await requestUrl({ url, headers, throw: false });
		if (response.status === 200) return response.json as OpeningExplorerResult;
		throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
	}
}
