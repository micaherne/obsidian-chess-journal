/**
 * One-time script to download ECO opening data from lichess-org/chess-openings
 * and generate src/eco-data.json.
 *
 * Run with: node scripts/generate-eco-data.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { Chess } = require("chess.js");

function parseTsv(text) {
	const lines = text.trim().split("\n");
	if (lines.length === 0) return [];

	// First line is header: eco\tname\tpgn
	const headers = lines[0].split("\t");
	const ecoIdx = headers.indexOf("eco");
	const nameIdx = headers.indexOf("name");
	const pgnIdx = headers.indexOf("pgn");

	const entries = [];
	for (let i = 1; i < lines.length; i++) {
		const cols = lines[i].split("\t");
		if (cols.length < 3) continue;

		const pgn = cols[pgnIdx] ?? "";
		let epd = "";
		try {
			const chess = new Chess();
			chess.loadPgn(pgn);
			// EPD = first 4 fields of FEN (position, side, castling, en passant)
			epd = chess.fen().split(" ").slice(0, 4).join(" ");
		} catch {
			// Leave epd empty if PGN can't be parsed
		}

		entries.push({
			eco: cols[ecoIdx] ?? "",
			name: cols[nameIdx] ?? "",
			pgn,
			epd,
		});
	}
	return entries;
}

const base = "https://raw.githubusercontent.com/lichess-org/chess-openings/master";
const files = ["a", "b", "c", "d", "e"];
const all = [];

for (const letter of files) {
	const url = `${base}/${letter}.tsv`;
	console.log(`Fetching ${url}...`);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	const text = await res.text();
	const entries = parseTsv(text);
	console.log(`  Parsed ${entries.length} entries`);
	all.push(...entries);
}

console.log(`Total: ${all.length} entries`);

const outPath = join(__dirname, "..", "src", "eco-data.tsv");
const tsv = all.map(e => [e.eco, e.name, e.pgn, e.epd].join("\t")).join("\n") + "\n";
writeFileSync(outPath, tsv);
console.log(`Written to ${outPath}`);
