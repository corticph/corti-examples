import { pipeline } from "@huggingface/transformers";

// Runs in-process via transformers.js, so document text never leaves the machine.
const MODEL = "Xenova/all-MiniLM-L6-v2";

export const EMBED_DIM = 384;

// Loaded once, lazily. `pipeline` is cast to any: its overload set produces a
// union too complex for TS to represent (TS2590).
let extractorPromise: Promise<any> | null = null;

function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    extractorPromise = (pipeline as any)("feature-extraction", MODEL) as Promise<any>;
  }
  return extractorPromise;
}

// Mean pooling + L2 normalize, so cosine similarity reduces to a plain dot product.
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}
