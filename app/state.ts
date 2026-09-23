export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    return result;
  }
}

/** Committed text only. Never reconstruct an editor document from model tokens. */
export class Sessions {
  private entries = new Map<string, { text: string; touched: number }>();
  generation = 0;
  constructor(
    private readonly ttlMs = 60_000,
    private readonly now = Date.now,
  ) {}
  get(id: string) {
    const entry = this.entries.get(id);
    if (!entry || this.now() - entry.touched > this.ttlMs) return "";
    entry.touched = this.now();
    return entry.text;
  }
  commit(id: string, text: string) {
    const prefix = this.get(id);
    // Newlines end a writing context. Punctuation remains useful context.
    const combined = (prefix + text).split(/[\r\n]/).at(-1) ?? "";
    this.entries.set(id, {
      text: [...combined].slice(-128).join(""),
      touched: this.now(),
    });
    if (this.entries.size > 32) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }
  reset(id?: string) {
    if (id) this.entries.delete(id);
    else this.entries.clear();
    this.generation++;
  }
}
