import { App, TFile, TFolder } from "obsidian";
import { Chess } from "chess.js";

const FRONT_MATTER_KEYS = ["white", "black", "date", "event", "site", "result", "round", "eco"] as const;

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "_");
}

export async function createGameNote(app: App, folder: string, pgn: string): Promise<TFile> {
	const game = new Chess();
	game.loadPgn(pgn);

	const raw = game.header();
	const headers: Record<string, string> = {};
	for (const [name, value] of Object.entries(raw)) {
		if (value) headers[name.toLowerCase()] = value;
	}

	const white = headers["white"] || "Unknown";
	const black = headers["black"] || "Unknown";
	const date = headers["date"] || "";

	// Build filename: "White vs Black (Date).md"
	let baseName = sanitizeFilename(`${white} vs ${black}`);
	if (date) {
		baseName += ` (${sanitizeFilename(date)})`;
	}

	// Build front matter
	const fmLines: string[] = ["---"];
	for (const key of FRONT_MATTER_KEYS) {
		const val = headers[key];
		if (!val) continue;
		if (key === "date") {
			// Convert PGN date "2024.01.15" → "2024-01-15" for Obsidian date type
			const isoDate = val.replace(/\./g, "-");
			fmLines.push(`${key}: ${isoDate}`);
		} else {
			fmLines.push(`${key}: "${val}"`);
		}
	}
	fmLines.push("tags:\n  - game");
	fmLines.push("---");

	const content = `${fmLines.join("\n")}\n\n# ${white} vs ${black}\n\n\`\`\`pgn\n${pgn}\n\`\`\`\n`;

	// Ensure folder exists
	const folderPath = folder || "";
	if (folderPath) {
		const existing = app.vault.getAbstractFileByPath(folderPath);
		if (!existing) {
			await app.vault.createFolder(folderPath);
		}
	}

	// Find unique filename
	const dir = folderPath ? folderPath + "/" : "";
	let filePath = `${dir}${baseName}.md`;
	let counter = 2;
	while (app.vault.getAbstractFileByPath(filePath)) {
		filePath = `${dir}${baseName} ${counter}.md`;
		counter++;
	}

	return app.vault.create(filePath, content);
}
