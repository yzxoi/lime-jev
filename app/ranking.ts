import type { Candidate } from "../main.ts";

export type Decision = {
  choice: string;
  probabilities: Record<string, number>;
  elapsed_ms: number;
  backend: string;
};

export function shortlist(candidates: Candidate[], keys: string, limit = 8) {
  // Only compare candidates that consume all currently typed letters.
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (c.consumedkeys !== keys.length || seen.has(c.word)) return false;
    seen.add(c.word);
    return true;
  }).slice(0, limit);
}

export function promote(candidates: Candidate[], word: string): Candidate[] {
  const index = candidates.findIndex((c) => c.word === word);
  if (index <= 0) return candidates;
  return [
    candidates[index],
    ...candidates.slice(0, index),
    ...candidates.slice(index + 1),
  ];
}

export class LocalRanker {
  private cache = new Map<string, Decision>();
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}
  async rank(
    context: string,
    keys: string,
    candidates: Candidate[],
    backend: string,
  ) {
    const choices = shortlist(candidates, keys);
    if (!context || choices.length < 2 || backend === "off") {
      return {
        candidates,
        ranking: {
          applied: false,
          reason: backend === "off"
            ? "disabled"
            : "insufficient-context-or-candidates",
        },
      };
    }
    const options = choices.map((c) => c.word);
    const cacheKey = JSON.stringify([backend, context, keys, options]);
    try {
      let decision = this.cache.get(cacheKey);
      const cached = !!decision;
      if (!decision) {
        const response = await fetch(`${this.url}/rank`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            context,
            pinyin: keys,
            candidates: options,
            backend,
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) throw new Error("unavailable");
        decision = await response.json();
        if (
          !decision || !options.includes(decision.choice) ||
          options.some((word) =>
            !Number.isFinite(decision!.probabilities?.[word])
          )
        ) {
          throw new Error("invalid-decision");
        }
        this.cache.set(cacheKey, decision);
        if (this.cache.size > 128) {
          this.cache.delete(this.cache.keys().next().value!);
        }
      }
      return {
        candidates: promote(candidates, decision.choice),
        ranking: { applied: true, cached, ...decision },
      };
    } catch {
      // Model outages never remove the original candidate list.
      return {
        candidates,
        ranking: { applied: false, reason: "timeout-or-unavailable" },
      };
    }
  }
  clear() {
    this.cache.clear();
  }
}
