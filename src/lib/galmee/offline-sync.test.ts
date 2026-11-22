import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createOfflineQueue, NotQueueableError, type OfflineQueue } from "./offline-queue";
import { classify, createSyncEngine, type RpcResult, type ReplayReport } from "./offline-sync";

const ok = (data: unknown = null): RpcResult => ({ data, error: null, status: 200 });
const down = (): RpcResult => ({ data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 });
const badLine = (): RpcResult => ({ data: null, error: { message: "bad_line", code: "P0001" }, status: 400 });

let n = 0;
let q: OfflineQueue;
afterEach(async () => q?.close());

/** A fake server: `script` decides each answer; `seen` records what reached it, in order. */
function setup(script: (rpc: string, args: Record<string, unknown>, nth: number) => RpcResult | Promise<RpcResult>, online = { v: true }) {
  let i = 0;
  let r = 0;
  q = createOfflineQueue({ dbName: `sync-test-${++n}`, rpcs: ["record_sale", "record_repayment"], newRef: () => `q-${++i}` });
  const seen: string[] = [];
  const slept: number[] = [];
  const synced: ReplayReport[] = [];
  const engine = createSyncEngine({
    queue: q,
    call: async (rpc, args) => {
      seen.push(String(args.p_client_ref));
      return script(rpc, args, seen.length);
    },
    isOnline: () => online.v,
    sleep: async (ms) => void slept.push(ms),
    onSynced: (rep) => synced.push(rep),
    newRef: () => `c-${++r}`,
  });
  return { engine, seen, slept, synced, online };
}

describe("classify", () => {
  it("splits retryable failures from server rejections", () => {
    expect(classify(ok())).toBe("ok");
    expect(classify(down())).toBe("retryable");
    for (const status of [401, 408, 429, 500, 503, 504]) expect(classify({ data: null, error: { message: "x" }, status })).toBe("retryable");
    expect(classify(badLine())).toBe("rejected");
    expect(classify({ data: null, error: { message: "denied", code: "42501" }, status: 403 })).toBe("rejected");
    expect(classify({ data: null, error: { message: "gone" }, status: 404 })).toBe("rejected");
  });
});

describe("callOrQueue", () => {
  it("runs the RPC now when online with nothing waiting, client_ref passed through", async () => {
    const { engine, seen } = setup(() => ok({ receipt_no: 7 }));
    expect(await engine.callOrQueue("record_sale", { p_lines: [] })).toEqual({ status: "ok", client_ref: "c-1", data: { receipt_no: 7 } });
    expect(seen).toEqual(["c-1"]);
    expect(await q.counts()).toEqual({ pending: 0, dead: 0 });
  });

  it("queues while offline without calling the server", async () => {
    const { engine, seen } = setup(() => ok(), { v: false });
    expect(await engine.callOrQueue("record_sale", {})).toEqual({ status: "queued", client_ref: "c-1" });
    expect(seen).toEqual([]);
    expect((await q.list()).map((e) => e.client_ref)).toEqual(["c-1"]);
  });

  it("queues with the same client_ref when the network fails mid-call (thrown or status 0)", async () => {
    const { engine, seen } = setup((_r, _a, nth) => {
      if (nth === 1) throw new TypeError("Failed to fetch");
      return down();
    });
    expect(await engine.callOrQueue("record_sale", { p_client_ref: "mine" })).toEqual({ status: "queued", client_ref: "mine" });
    expect(await engine.callOrQueue("record_sale", {})).toEqual({ status: "queued", client_ref: "c-1" });
    await engine.replayNow();
    // the queued copies keep the refs the server may already have seen; "mine" goes first
    expect(seen.slice(0, 2)).toEqual(["mine", "mine"]);
    expect((await q.list()).map((e) => e.args.p_client_ref)).toEqual(["mine", "c-1"]);
  });

  it("returns a server rejection to the screen instead of queuing it", async () => {
    const { engine } = setup(() => badLine());
    const res = await engine.callOrQueue("record_sale", {});
    expect(res).toMatchObject({ status: "rejected", client_ref: "c-1", error: { message: "bad_line" } });
    expect(await q.counts()).toEqual({ pending: 0, dead: 0 });
  });

  it("goes behind older waiting entries to keep first-in, first-out", async () => {
    const online = { v: false };
    const { engine, seen } = setup(() => ok(), online);
    await engine.callOrQueue("record_sale", {}); // c-1 queued offline
    online.v = true;
    expect(await engine.callOrQueue("record_sale", {})).toEqual({ status: "queued", client_ref: "c-2" });
    await engine.replayNow();
    expect(seen).toEqual(["c-1", "c-2"]);
    expect(await q.counts()).toEqual({ pending: 0, dead: 0 });
  });

  it("fails fast for an RPC that may not be queued", async () => {
    const { engine } = setup(() => ok(), { v: false });
    await expect(engine.callOrQueue("delete_customer", {})).rejects.toBeInstanceOf(NotQueueableError);
  });
});

describe("replay", () => {
  it("retries a network failure 2 s / 10 s / 60 s, then holds the order without dead-lettering", async () => {
    const { engine, seen, slept, synced } = setup(() => down());
    await q.enqueue("record_sale", { p_client_ref: "a" });
    await q.enqueue("record_sale", { p_client_ref: "b" });
    expect(await engine.replayNow()).toEqual({ synced: 0, dead: 0, held: true });
    expect(seen).toEqual(["a", "a", "a", "a"]); // b never overtakes a
    expect(slept).toEqual([2000, 10000, 60000]);
    const [a, b] = await q.list();
    expect(a).toMatchObject({ client_ref: "a", state: "pending", attempts: 4 });
    expect(b).toMatchObject({ client_ref: "b", state: "pending", attempts: 0 });
    expect(synced).toEqual([]);
  });

  it("lands an entry that recovers on a retry, then continues", async () => {
    const { engine, seen, slept } = setup((_r, _a, nth) => (nth === 1 ? down() : ok()));
    await q.enqueue("record_sale", { p_client_ref: "a" });
    await q.enqueue("record_sale", { p_client_ref: "b" });
    expect(await engine.replayNow()).toEqual({ synced: 2, dead: 0, held: false });
    expect(seen).toEqual(["a", "a", "b"]);
    expect(slept).toEqual([2000]);
  });

  it("dead-letters a rejected entry with the server's message and lets the next one through", async () => {
    const { engine, seen, synced } = setup((_r, args) => (args.p_client_ref === "a" ? badLine() : ok()));
    await q.enqueue("record_sale", { p_client_ref: "a" });
    await q.enqueue("record_repayment", { p_client_ref: "b" });
    expect(await engine.replayNow()).toEqual({ synced: 1, dead: 1, held: false });
    expect(seen).toEqual(["a", "b"]);
    const [a] = await q.list();
    expect(a).toMatchObject({ client_ref: "a", state: "dead", error: "bad_line" });
    expect(synced).toEqual([{ synced: 1, dead: 1, held: false }]);
  });

  it("does not call the server while offline", async () => {
    const { engine, seen } = setup(() => ok(), { v: false });
    await q.enqueue("record_sale", {});
    expect(await engine.replayNow()).toEqual({ synced: 0, dead: 0, held: true });
    expect(seen).toEqual([]);
  });

  it("shares one replay between overlapping triggers, so nothing is sent twice", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { engine, seen } = setup(async () => {
      await gate;
      return ok();
    });
    await q.enqueue("record_sale", { p_client_ref: "a" });
    const first = engine.replayNow();
    const second = engine.replayNow();
    expect(second).toBe(first);
    release();
    await first;
    expect(seen).toEqual(["a"]);
  });
});

describe("sync state", () => {
  it("tells subscribers about counts, syncing and the last sync", async () => {
    const online = { v: false };
    const { engine } = setup(() => ok(), online);
    const seenStates: string[] = [];
    const stop = engine.subscribe(() => {
      const s = engine.getState();
      seenStates.push(`${s.pending}/${s.dead}/${s.syncing ? "s" : "-"}`);
    });
    await engine.callOrQueue("record_sale", {});
    expect(engine.getState()).toMatchObject({ pending: 1, dead: 0, syncing: false });
    online.v = true;
    await engine.replayNow();
    expect(engine.getState()).toMatchObject({ pending: 0, dead: 0, syncing: false });
    expect(engine.getState().lastSyncAt).toBeTypeOf("number");
    expect(seenStates).toContain("1/0/s");
    stop();
  });

  it("retries a dead entry in its old place, and discards only dead entries", async () => {
    let refuse = true;
    const { engine, seen } = setup((_r, args) => (refuse && args.p_client_ref === "a" ? badLine() : ok()));
    await q.enqueue("record_sale", { p_client_ref: "a" });
    await q.enqueue("record_sale", { p_client_ref: "b" });
    await engine.replayNow();
    expect(engine.getState()).toMatchObject({ pending: 0, dead: 1 });
    const [dead] = await q.list("dead");
    refuse = false;
    expect(await engine.retry(dead.seq)).toEqual({ synced: 1, dead: 0, held: false });
    expect(seen).toEqual(["a", "b", "a"]);
    expect(engine.getState()).toMatchObject({ pending: 0, dead: 0 });

    await q.enqueue("record_sale", { p_client_ref: "c" });
    const [waiting] = await q.list("pending");
    await engine.discard(waiting.seq); // not dead: left alone
    expect(await q.counts()).toEqual({ pending: 1, dead: 0 });
    await q.markDead(waiting.seq, "bad_line");
    await engine.discard(waiting.seq);
    expect(await q.counts()).toEqual({ pending: 0, dead: 0 });
    expect(engine.getState()).toMatchObject({ pending: 0, dead: 0 });
  });
});

describe("sync beacon", () => {
  it("reports the till's counts after each online replay cycle, under a stable device id", async () => {
    const online = { v: true };
    q = createOfflineQueue({ dbName: `beacon-test-${++n}`, rpcs: ["record_sale"], newRef: () => "dev-1234-abcd" });
    const reports: unknown[] = [];
    let fail = true;
    const engine = createSyncEngine({
      queue: q,
      isOnline: () => online.v,
      sleep: async () => {},
      delays: [],
      call: async (_r, args) => (args.p_client_ref === "bad" ? badLine() : fail ? down() : ok()),
      beacon: async (b) => void reports.push(b),
    });
    await q.enqueue("record_sale", { p_client_ref: "bad" });
    await q.enqueue("record_sale", { p_client_ref: "a" });
    await engine.replayNow(); // bad dead-letters, a held by the network
    const [first] = reports as { device: string; pending: number; dead: number; oldestAt: string | null }[];
    expect(first).toMatchObject({ device: "dev-1234-abcd", pending: 1, dead: 1 });
    expect(first.oldestAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    fail = false;
    await engine.replayNow();
    expect(reports[1]).toEqual({ device: "dev-1234-abcd", pending: 0, dead: 1, oldestAt: null });
    online.v = false;
    await engine.replayNow();
    expect(reports).toHaveLength(2); // nothing sent while offline
    expect(await q.deviceId()).toBe("dev-1234-abcd");
  });

  it("ignores a failing beacon", async () => {
    q = createOfflineQueue({ dbName: `beacon-test-${++n}`, rpcs: ["record_sale"] });
    const engine = createSyncEngine({
      queue: q,
      isOnline: () => true,
      call: async () => ok(),
      beacon: async () => {
        throw new Error("down");
      },
    });
    await q.enqueue("record_sale", {});
    expect(await engine.replayNow()).toEqual({ synced: 1, dead: 0, held: false });
    expect((await q.deviceId()).length).toBeGreaterThanOrEqual(8);
  });
});
