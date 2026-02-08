import { Plugin } from "obsidian";

export default class ChessJournalPlugin extends Plugin {
	async onload() {
		console.log("Loading Chess Journal plugin");
	}

	onunload() {
		console.log("Unloading Chess Journal plugin");
	}
}
