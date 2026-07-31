import { pipeline } from "@huggingface/transformers";

// Runs in-process via transformers.js, so document text never leaves the machine.
const MODEL = "Xenova/all-MiniLM-L6-v2";

export const EMBED_DIM = 384;

// Minimal view of the transformers.js feature-extraction pipeline we use: a
// callable returning a tensor with tolist(). We cast `pipeline` through
// `unknown` to this simpler shape because its own overload set is too complex
// for TS to represent (TS2590).
type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

// Loaded once, lazily.
let extractorPromise: Promise<FeatureExtractor> | null = null;

function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    const createExtractor = pipeline as unknown as (
      task: string,
      model: string,
    ) => Promise<FeatureExtractor>;
    extractorPromise = createExtractor("feature-extraction", MODEL);
  }
  return extractorPromise;
}

// Mean pooling + L2 normalize, so cosine similarity reduces to a plain dot product.
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}
