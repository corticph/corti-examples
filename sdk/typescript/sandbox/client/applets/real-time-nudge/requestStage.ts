/** Memory-only bounded cache plus one active / one latest queued request. */
export class SupersededRequest extends Error {
  constructor() {
    super("Evaluation superseded");
  }
}
interface Job<T> {
  key: string;
  generation: number;
  work: () => Promise<T>;
  cache: boolean;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
export class RequestStage<T> {
  private generation = 0;
  private entries = new Map<string, { value: T; at: number }>();
  private active?: Job<T>;
  private queued?: Job<T>;
  constructor(
    private report: (event: string, id: string) => void = () => {},
    private cacheable: (value: T) => boolean = () => true,
    private ttl = 5 * 60_000,
    private capacity = 20,
  ) {}
  invalidate() {
    this.generation++;
    this.entries.clear();
    if (this.queued) {
      this.report("discarded", this.queued.key);
      this.queued.reject(new SupersededRequest());
      this.queued = undefined;
    }
  }
  run(key: string, work: () => Promise<T>, cache = true): Promise<T> {
    // Returning to a cached or already-active input also supersedes queued work.
    if (this.queued && this.queued.key !== key) {
      this.report("discarded", this.queued.key);
      this.queued.reject(new SupersededRequest());
      this.queued = undefined;
    }
    const hit = this.entries.get(key);
    if (cache && hit && Date.now() - hit.at < this.ttl) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      this.report("cache-hit", key);
      return Promise.resolve(hit.value);
    }
    if (hit) {
      this.entries.delete(key);
    }
    for (const job of [this.active, this.queued]) {
      if (job?.key === key && job.generation === this.generation) {
        this.report("shared", key);
        return job.promise;
      }
    }
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const job = { key, generation: this.generation, work, cache, promise, resolve, reject };
    if (this.active) {
      if (this.queued) {
        this.report("discarded", this.queued.key);
        this.queued.reject(new SupersededRequest());
      }
      this.queued = job;
      this.report("queued", key);
    } else {
      this.start(job);
    }
    return promise;
  }
  private start(job: Job<T>) {
    this.active = job;
    this.report("started", job.key);
    const finish = () => {
      this.active = undefined;
      const next = this.queued;
      this.queued = undefined;
      if (next) {
        this.start(next);
      }
    };
    void Promise.resolve()
      .then(() => {
        if (job.generation !== this.generation) {
          throw new SupersededRequest();
        }
        return job.work();
      })
      .then(
        (value) => {
          if (job.generation !== this.generation) {
            this.report("discarded", job.key);
            finish();
            job.reject(new SupersededRequest());
            return;
          }
          if (job.cache && this.cacheable(value)) {
            this.entries.set(job.key, { value, at: Date.now() });
            while (this.entries.size > this.capacity) {
              const oldest = this.entries.keys().next().value;
              if (oldest === undefined) {
                break;
              }
              this.entries.delete(oldest);
            }
          }
          finish();
          job.resolve(value);
        },
        (error) => {
          finish();
          job.reject(error);
        },
      );
  }
}
