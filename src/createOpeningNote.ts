import { App, TFile } from "obsidian";

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "_");
}

export async function createOpeningNote(
	app: App,
	folder: string,
	eco: string,
	openingName: string
): Promise<TFile> {
	const baseName = sanitizeFilename(`${eco} ${openingName}`);

	const fmLines = [
		"---",
		`eco: "${eco}"`,
		`opening: "${openingName}"`,
		"tags:\n  - opening",
		"---",
	];

	const content = `${fmLines.join("\n")}\n\n# ${eco} – ${openingName}\n`;

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
