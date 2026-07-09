import { promises as fs } from "node:fs";
import path from "node:path";
import { embed } from "./embed.js";

// File-backed document store with local semantic (embedding) retrieval.
// The index is a flat list of text chunks, each with a precomputed embedding,
// persisted to data/index.json relative to the process working directory
// (run commands from the project root).

const DATA_DIR = path.resolve(process.cwd(), "data");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

// Minimum cosine similarity for a chunk to count as relevant; below this it's
// dropped as off-topic. Calibrated for all-MiniLM-L6-v2, where genuine matches
// score ~0.24-0.48 and off-topic chunks sit below ~0.2. Retune per model/corpus.
const MIN_SCORE = 0.2;

// Scope tag for access control. "shared" docs (guidelines, policies) are
// visible to everyone; patient records carry "patient:<MRN>" and are only
// visible to callers whose `allowed` set includes that scope.
const SHARED_SCOPE = "shared";

export interface Chunk {
  id: string;
  source: string;
  text: string;
  scope: string; // "shared" | "patient:<MRN>"
  embedding: number[]; // precomputed at ingest time
}

export interface SearchHit {
  source: string;
  text: string;
  score: number;
  scope: string; // "shared" | "patient:<MRN>"; lets the caller see which patient a passage belongs to
}

// In-memory cache for the process lifetime; loaded lazily from disk on first access.
let chunks: Chunk[] | null = null;

async function load(): Promise<Chunk[]> {
  if (chunks) {
    return chunks;
  }
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf8");
    chunks = JSON.parse(raw) as Chunk[];
  } catch {
    chunks = []; // no index yet
  }
  return chunks;
}

async function persist(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(INDEX_PATH, JSON.stringify(chunks ?? [], null, 2));
}

// Split into overlapping word windows; overlap improves recall at chunk edges.
// Size stays well under the model's 256-token cap so chunks aren't truncated.
function chunkText(text: string, size = 128, overlap = 24): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const out: string[] = [];
  const step = Math.max(1, size - overlap);
  for (let index = 0; index < words.length; index += step) {
    out.push(words.slice(index, index + size).join(" "));
    if (index + size >= words.length) {
      break;
    }
  }
  return out;
}

// Cosine similarity. Embeddings are L2-normalized at creation, so this is
// effectively a dot product, but we normalize defensively in case that changes.
function cosine(vectorA: number[], vectorB: number[]): number {
  let dotProduct = 0;
  let sumSquaresA = 0;
  let sumSquaresB = 0;
  for (let index = 0; index < vectorA.length; index++) {
    dotProduct += vectorA[index] * vectorB[index];
    sumSquaresA += vectorA[index] * vectorA[index];
    sumSquaresB += vectorB[index] * vectorB[index];
  }
  return dotProduct / (Math.sqrt(sumSquaresA) * Math.sqrt(sumSquaresB) || 1);
}

// Extract a scope front-matter tag (an HTML comment like
//   <!-- scope: patient:000-MOCK-1234 -->
// invisible in rendered markdown) and return the scope plus the body without it.
function parseScope(text: string): { scope: string | null; body: string } {
  const match = text.match(/<!--\s*scope:\s*(\S+)\s*-->/i);
  if (!match) {
    return { scope: null, body: text };
  }
  return { scope: match[1], body: text.replace(match[0], "").trimStart() };
}

// Chunk, embed, and persist a document; returns the chunk count. Re-ingesting a
// source replaces its chunks (idempotent). Scope precedence: arg > tag > "shared".
export async function addDocument(source: string, text: string, scope?: string): Promise<number> {
  const all = await load();
  const { scope: parsed, body } = parseScope(text);
  const resolvedScope = scope ?? parsed ?? SHARED_SCOPE;
  const pieces = chunkText(body);
  if (pieces.length === 0) {
    return 0;
  }
  const vectors = await embed(pieces);
  // Remove any existing chunks from this source (in place, to keep the cache).
  for (let index = all.length - 1; index >= 0; index--) {
    if (all[index].source === source) {
      all.splice(index, 1);
    }
  }
  pieces.forEach((piece, index) => {
    all.push({
      id: `${source}#${index}`,
      source,
      text: piece,
      scope: resolvedScope,
      embedding: vectors[index],
    });
  });
  await persist();
  return pieces.length;
}

// Whether a chunk is visible to a caller with the given allowed scopes.
// Shared docs are always visible; patient records require an explicit grant.
function isVisible(chunk: Chunk, allowed: string[]): boolean {
  return chunk.scope === SHARED_SCOPE || allowed.includes(chunk.scope);
}

// Semantic ranking scoped to what the caller may see. Defaults to [] (shared
// docs only), so PHI is withheld unless explicitly granted: deny by default.
export async function search(
  query: string,
  topK = 4,
  allowed: string[] = [],
): Promise<SearchHit[]> {
  const all = await load();
  if (all.length === 0) {
    return [];
  }

  const visible = all.filter((chunk) => isVisible(chunk, allowed));
  if (visible.length === 0) {
    return [];
  }

  const [queryVector] = await embed([query]);

  return visible
    .map((chunk) => ({
      source: chunk.source,
      text: chunk.text,
      scope: chunk.scope,
      // Guard against legacy chunks stored before embeddings existed.
      score: Array.isArray(chunk.embedding) ? cosine(queryVector, chunk.embedding) : -Infinity,
    }))
    .filter((hit) => hit.score >= MIN_SCORE) // drop off-topic chunks so junk isn't returned
    .sort((first, second) => second.score - first.score)
    .slice(0, topK);
}

// Total chunk count; handy for ingestion feedback.
export async function count(): Promise<number> {
  return (await load()).length;
}

// Wipe the entire index. Used by `ingest --rebuild` to clear orphaned chunks
// from deleted or renamed sources before re-ingesting the docs/ folder.
export async function clearIndex(): Promise<void> {
  chunks = [];
  await persist();
}
