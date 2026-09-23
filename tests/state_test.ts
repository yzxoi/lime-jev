import { assertEquals } from "@std/assert";
import { SerialQueue, Sessions } from "../app/state.ts";

Deno.test("contexts expire, stay isolated, and clear on focus changes", () => {
  let now = 0;
  const sessions = new Sessions(100, () => now);
  sessions.commit("rime", "汽车");
  sessions.commit("web", "我的");
  assertEquals(sessions.get("rime"), "汽车");
  assertEquals(sessions.get("web"), "我的");
  now = 101;
  assertEquals(sessions.get("rime"), "");
  sessions.commit("rime", "第一句\n第二句");
  assertEquals(sessions.get("rime"), "第二句");
  sessions.reset();
  assertEquals(sessions.get("rime"), "");
  assertEquals(sessions.get("web"), "");
});

Deno.test("serial queue recovers after a failed model operation", async () => {
  const queue = new SerialQueue();
  const order: number[] = [];
  const a = queue.run(async () => {
    await new Promise((r) => setTimeout(r, 10));
    order.push(1);
    throw Error();
  });
  const b = queue.run(() => {
    order.push(2);
    return Promise.resolve(42);
  });
  await a.catch(() => {});
  assertEquals(await b, 42);
  assertEquals(order, [1, 2]);
});
