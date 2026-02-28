import { App, TFile } from "obsidian";

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "_");
}

export async function createRepertoireNote(
	app: App,
	folder: string,
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

	const folderPath = folder || "";
	if (folderPath) {
		const existing = app.vault.getAbstractFileByPath(folderPath);
		if (!existing) {
			await app.vault.createFolder(folderPath);
		}
	}

	const dir = folderPath ? folderPath + "/" : "";
	// Use piece placement part of EPD as filename base (human-readable, unique per position)
	const baseName = sanitizeFilename(epd.split(" ")[0]);
	let filePath = `${dir}${baseName}.md`;
	let counter = 2;
	while (app.vault.getAbstractFileByPath(filePath)) {
		filePath = `${dir}${baseName} ${counter}.md`;
		counter++;
	}

	return app.vault.create(filePath, content);
}
