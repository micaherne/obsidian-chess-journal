import { App, TFile } from "obsidian";

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "_");
}

/** Format a SAN path as a human-readable move sequence, e.g. "1. e4 c5 2. Nf3 d6" */
export function formatMovePath(path: string[]): string {
	if (path.length === 0) return "Starting Position";
	const parts: string[] = [];
	path.forEach((san, i) => {
		const ply = i + 1;
		const moveNum = Math.ceil(ply / 2);
		if (ply % 2 === 1) parts.push(`${moveNum}. ${san}`);
		else parts.push(san);
	});
	return parts.join(" ");
}

export async function createRepertoireNote(
	app: App,
	folder: string,
	currentPath: string[],
	epd: string,
	repertoireName: string,
	eco: string | null,
	openingName: string | null,
): Promise<TFile> {
	const fmLines = [
		"---",
		`epd: "${epd}"`,
	];
	if (eco) fmLines.push(`eco: "${eco}"`);
	if (openingName) fmLines.push(`opening: "${openingName}"`);
	fmLines.push(`repertoire: "${repertoireName}"`);
	fmLines.push("tags:\n  - repertoire-note");
	fmLines.push("---");

	const content = fmLines.join("\n") + "\n\n";

	// Subfolder: {folder}/{repertoireName}/
	const safeName = sanitizeFilename(repertoireName);
	const folderPath = folder ? `${folder}/${safeName}` : safeName;
	const existing = app.vault.getAbstractFileByPath(folderPath);
	if (!existing) {
		await app.vault.createFolder(folderPath);
	}

	// Filename: formatted move path (unique and human-readable)
	const baseName = sanitizeFilename(formatMovePath(currentPath));
	let filePath = `${folderPath}/${baseName}.md`;
	let counter = 2;
	while (app.vault.getAbstractFileByPath(filePath)) {
		filePath = `${folderPath}/${baseName} ${counter}.md`;
		counter++;
	}

	return app.vault.create(filePath, content);
}
