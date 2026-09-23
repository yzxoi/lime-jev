import { assertEquals } from "@std/assert";
import { Controller, type Engine } from "../app/controller.ts";
import { LocalRanker } from "../app/ranking.ts";

function controller(engine: Partial<Engine> = {}) {
  return new Controller(
    {
      setContext: () => Promise.resolve(),
      append: () => Promise.resolve(),
      candidates: () => Promise.resolve([]),
      ...engine,
    },
    new LocalRanker("http://127.0.0.1:1", "test", 20),
    "",
  );
}

Deno.test("commit acknowledges before preparation finishes and the next key reuses it", async () => {
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const operations: string[] = [];
  const c = controller({
    append: async (text) => {
      operations.push("append:" + text);
      started.resolve();
      await finish.promise;
    },
    candidates: () => {
      operations.push("candidates");
      return Promise.resolve([]);
    },
  });
  assertEquals(c.commit("rime", "汽车"), undefined);
  await started.promise;
  const next = c.candidates("rime", "y", "", undefined, "off");
  assertEquals(operations, ["append:汽车"]);
  finish.resolve();
  await next;
  assertEquals(operations, ["append:汽车", "candidates"]);
});

Deno.test("reset cancels queued keys and obsolete preparation without leaking old text", async () => {
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const operations: string[] = [];
  const c = controller({
    setContext: (text) => {
      operations.push("set:" + text);
      return Promise.resolve();
    },
    append: (text) => {
      operations.push("append:" + text);
      return Promise.resolve();
    },
    candidates: async (keys) => {
      operations.push(keys);
      if (keys === "a") {
        started.resolve();
        await finish.promise;
      }
      return [];
    },
  });
  const first = c.candidates("rime", "a", "", undefined, "off");
  await started.promise;
  c.commit("rime", "旧");
  const obsolete = c.candidates("rime", "b", "", undefined, "off");
  c.commit("rime", "语境");
  c.reset();
  c.commit("rime", "新");
  const fresh = c.candidates("rime", "c", "", undefined, "off");
  finish.resolve();
  assertEquals(await first, { candidates: [], stale: true });
  assertEquals(await obsolete, { candidates: [], stale: true });
  await fresh;
  assertEquals(operations, ["a", "append:新", "c"]);
});

Deno.test("failed background append retries with a full context replacement", async () => {
  const operations: string[] = [];
  const c = controller({
    append: () => {
      operations.push("failed append");
      return Promise.reject(new Error("native failure"));
    },
    setContext: (text) => {
      operations.push("set:" + text);
      return Promise.resolve();
    },
  });
  c.commit("rime", "汽车");
  await c.candidates("rime", "y", "", undefined, "off");
  assertEquals(operations, ["failed append", "set:汽车"]);
});
