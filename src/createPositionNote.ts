import { App, TFile } from "obsidian";
import { Chess } from "chess.js";

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "_");
}

function normalizePositionFen(fen: string): string {
	// Keep only the first 4 fields: piece placement, side to move, castling, en passant.
	// Drop halfmove clock and fullmove number so the same position matches regardless
	// of when it occurred in a game.
	return fen.split(" ").slice(0, 4).join(" ");
}

export async function createPositionNote(
	app: App,
	folder: string,
	fen: string,
	pgn?: string,
): Promise<TFile> {
	const positionFen = normalizePositionFen(fen);

	let white = "Unknown";
	let black = "Unknown";
	let date = "";

	if (pgn) {
		const chess = new Chess();
		chess.loadPgn(pgn);
		const headers = chess.header();
		white = headers["White"] || "Unknown";
		black = headers["Black"] || "Unknown";
		date = headers["Date"] || "";
	}

	// Build filename: "Position from White vs Black (Date).md"
	let baseName = sanitizeFilename(`Position from ${white} vs ${black}`);
	if (date) {
		baseName += ` (${sanitizeFilename(date)})`;
	}

	// Build frontmatter
	const fmLines = [
		"---",
		`fen: "${positionFen}"`,
		"tags:\n  - position",
		"---",
	];

	const content = `${fmLines.join("\n")}\n\n\`\`\`fen\n${positionFen}\n\`\`\`\n`;

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
