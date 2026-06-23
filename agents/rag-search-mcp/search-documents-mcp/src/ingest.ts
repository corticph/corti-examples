import { promises as fs } from "node:fs";
import path from "node:path";
import { addDocument, count, clearIndex } from "./store.js";

// CLI batch ingest: indexes every .txt / .md file in the docs/ folder
// (relative to the project root). Run with: npm run ingest
// Pass --rebuild to wipe the index first, dropping orphaned chunks from
// files that were deleted or renamed in docs/.
const DOCS_DIR = path.resolve(process.cwd(), "docs");
const EXTENSIONS = new Set([".txt", ".md"]);

async function main(): Promise<void> {
  if (process.argv.includes("--rebuild")) {
    await clearIndex();
    console.error("Cleared existing index (--rebuild).");
  }

  let entries: string[];
  try {
    entries = await fs.readdir(DOCS_DIR);
  } catch {
    console.error(`No docs/ folder found at ${DOCS_DIR}. Create it and add .txt or .md files.`);
    process.exit(1);
  }

  const files = entries.filter((entry) => EXTENSIONS.has(path.extname(entry).toLowerCase()));
  if (files.length === 0) {
    console.error(`No .txt or .md files in ${DOCS_DIR}.`);
    process.exit(1);
  }

  let total = 0;
  for (const file of files) {
    const text = await fs.readFile(path.join(DOCS_DIR, file), "utf8");
    const chunks = await addDocument(file, text);
    total += chunks;
    console.error(`Ingested ${file} → ${chunks} chunks`);
  }
  console.error(`Done. Added ${total} chunks from ${files.length} file(s). Index now holds ${await count()} chunks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
