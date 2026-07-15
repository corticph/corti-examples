export interface SegmentEntry {
  final: string;
  raw: string;
}

type Listener = (segments: readonly SegmentEntry[]) => void;

let segments: SegmentEntry[] = [];
const listeners = new Set<Listener>();

function notify() {
  const snap = [...segments];
  listeners.forEach((l) => l(snap));
}

export const segmentStore = {
  get(): readonly SegmentEntry[] {
    return segments;
  },
  add(final: string, raw: string): void {
    segments = [...segments, { final, raw }];
    notify();
  },
  reset(): void {
    segments = [];
    notify();
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
