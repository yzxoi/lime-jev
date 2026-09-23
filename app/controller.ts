import type { Candidate } from "../main.ts";
import { LocalRanker } from "./ranking.ts";
import { SerialQueue, Sessions } from "./state.ts";

export interface Engine {
  setContext(text: string): Promise<void>;
  append(text: string): Promise<void>;
  candidates(keys: string): Promise<Candidate[]>;
}
export class Controller {
  readonly sessions = new Sessions();
  private readonly queue = new SerialQueue();
  private waiting = 0;
  private preparationVersion = 0;
  constructor(
    private engine: Engine,
    private ranker: LocalRanker,
    private modelContext: string | null = null,
  ) {}
  private async synchronize(context: string) {
    if (this.modelContext === context) return;
    try {
      if (
        this.modelContext !== null && context.startsWith(this.modelContext)
      ) await this.engine.append(context.slice(this.modelContext.length));
      else await this.engine.setContext(context);
      this.modelContext = context;
    } catch (error) {
      // A failed native operation may have partly changed the sequence.
      this.modelContext = null;
      throw error;
    }
  }
  private prepare(session?: string) {
    const version = ++this.preparationVersion;
    void this.queue.run(async () => {
      // Coalesce commits waiting behind inference; reset/focus changes also
      // supersede pending preparation. Never overlap native model operations.
      if (version !== this.preparationVersion) return;
      try {
        await this.synchronize(session ? this.sessions.get(session) : "");
      } catch { /* The next request retries with a complete context reset. */ }
    });
  }
  commit(session: string, text: string) {
    this.sessions.commit(session, text);
    this.prepare(session);
  }
  reset(session?: string) {
    this.sessions.reset(session);
    this.ranker.clear();
    this.prepare();
  }
  async candidates(
    session: string,
    keys: string,
    preedit: string,
    explicit: string | undefined,
    backend: string,
  ) {
    if (this.waiting >= 4) throw new Error("busy");
    this.waiting++;
    const started = performance.now();
    const generation = this.sessions.generation;
    const context = [...(explicit ?? this.sessions.get(session) + preedit)]
      .slice(-128).join("");
    try {
      return await this.queue.run(async () => {
        if (generation !== this.sessions.generation) {
          return { candidates: [], stale: true };
        }
        await this.synchronize(context);
        if (generation !== this.sessions.generation) {
          return { candidates: [], stale: true };
        }
        const original = await this.engine.candidates(keys);
        const result = await this.ranker.rank(context, keys, original, backend);
        if (generation !== this.sessions.generation) {
          return { candidates: [], stale: true };
        }
        return {
          ...result,
          original: original.slice(0, 8).map((c) => c.word),
          context_chars: [...context].length,
          elapsed_ms: Math.round((performance.now() - started) * 100) / 100,
        };
      });
    } finally {
      this.waiting--;
    }
  }
}
