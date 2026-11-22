import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createOfflineQueue, type OfflineQueue } from "./offline-queue";
import { createSyncEngine, type ReplayReport } from "./offline-sync";
import { startSyncTriggers } from "./sync-triggers";

let n = 0;
let q: OfflineQueue;
afterEach(async () => q?.close());

function setup() {
  q = createOfflineQueue({ dbName: `trigger-test-${++n}`, rpcs: ["record_sale"] });
  const online = { v: false };
  const sent: string[] = [];
  let release: (() => void) | null = null;
  const engine = createSyncEngine({
    queue: q,
    isOnline: () => online.v,
    sleep: async () => {},
    call: async (_rpc, args) => {
      sent.push(String(args.p_client_ref));
      // hold the first answer until the test lets it go, so triggers overlap
      if (sent.length === 1) await new Promise<void>((r) => (release = r));
      return { data: null, error: null, status: 200 };
    },
  });
  const synced: ReplayReport[] = [];
  engine.onSynced((r) => synced.push(r));
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let tick: () => void = () => {};
  let cleared = false;
  const stop = startSyncTriggers(engine, {
    win,
    doc,
    setInterval: (fn) => ((tick = fn), 1),
    clearInterval: () => void (cleared = true),
  });
  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  };
  return { engine, online, sent, synced, win, doc, tick: () => tick(), stop, settle, cleared: () => cleared, release: () => release?.() };
}

describe("sync triggers", () => {
  it("drains the queue once when the network comes back, however many events fire together", async () => {
    const t = setup();
    await t.engine.callOrQueue("record_sale", { p_client_ref: "a" });
    await t.engine.callOrQueue("record_sale", { p_client_ref: "b" });
    expect(t.sent).toEqual([]);

    t.online.v = true;
    t.win.dispatchEvent(new Event("online"));
    t.win.dispatchEvent(new Event("focus"));
    t.doc.dispatchEvent(new Event("visibilitychange"));
    await t.settle();
    t.tick();
    t.release();
    await t.settle();

    expect(t.sent).toEqual(["a", "b"]);
    expect(t.synced).toEqual([{ synced: 2, dead: 0, held: false }]);
    expect(t.engine.getState()).toMatchObject({ pending: 0, syncing: false });
    t.stop();
  });

  it("the interval only replays while something waits; a hidden tab does not replay", async () => {
    const t = setup();
    t.online.v = true;
    await t.settle();
    t.tick();
    t.doc.visibilityState = "hidden";
    t.doc.dispatchEvent(new Event("visibilitychange"));
    await t.settle();
    expect(t.sent).toEqual([]);
    t.stop();
  });

  it("stops listening when stopped", async () => {
    const t = setup();
    t.stop();
    expect(t.cleared()).toBe(true);
    await q.enqueue("record_sale", { p_client_ref: "a" });
    t.online.v = true;
    t.win.dispatchEvent(new Event("online"));
    await t.settle();
    expect(t.sent).toEqual([]);
  });
});
