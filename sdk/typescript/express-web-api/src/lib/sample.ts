import * as fs from "node:fs";
import * as path from "node:path";

const SAMPLE_FILE = "trouble-breathing.mp3";

/**
 * Resolve path to trouble-breathing.mp3 (sample/ or typescript/next/public).
 */
export function resolveSampleFilePath(): string | null {
  const dirs = [
    path.join(process.cwd(), "sample"),
    path.join(process.cwd(), "..", "..", "..", "..", "typescript", "next", "public"),
  ];

  for (const dir of dirs) {
    const p = path.join(dir, SAMPLE_FILE);

    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

export const SAMPLE_FILE_NAME = SAMPLE_FILE;
