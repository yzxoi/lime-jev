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
  private modelContext: string | null = null;
  private waiting = 0;
  constructor(private engine: Engine, private ranker: LocalRanker) {}
  reset(session?: string) {
    this.sessions.reset(session);
    this.ranker.clear();
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
    try {
      return await this.queue.run(async () => {
        const started = performance.now();
        const generation = this.sessions.generation;
        const context = [...(explicit ?? this.sessions.get(session) + preedit)]
          .slice(-128).join("");
        if (this.modelContext !== context) {
          if (this.modelContext && context.startsWith(this.modelContext)) {
            await this.engine.append(context.slice(this.modelContext.length));
          } else await this.engine.setContext(context);
          this.modelContext = context;
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
