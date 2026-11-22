import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createOfflineQueue, NotQueueableError, QueueClosedError, type OfflineQueue } from "./offline-queue";

let n = 0;
let q: OfflineQueue;
const make = (opts: { closed?: boolean } = {}) => {
  let i = 0;
  q = createOfflineQueue({
    dbName: `test-queue-${++n}`,
    rpcs: ["record_sale", "record_repayment"],
    isClosed: () => !!opts.closed,
    newRef: () => `ref-${++i}`,
  });
  return q;
};
afterEach(async () => q?.close());

describe("offline queue", () => {
  it("queues a whitelisted RPC with a new client_ref passed through to the server", async () => {
    const q = make();
    expect(await q.enqueue("record_sale", { p_lines: [{ item: "a", qty: 1 }] })).toEqual({ client_ref: "ref-1", queued: true });
    const [e] = await q.list();
    expect(e.rpc).toBe("record_sale");
    expect(e.args).toEqual({ p_lines: [{ item: "a", qty: 1 }], p_client_ref: "ref-1" });
    expect(e.state).toBe("pending");
  });

  it("queues the same client_ref once", async () => {
    const q = make();
    await q.enqueue("record_repayment", { p_amount: 100, p_client_ref: "dup" });
    expect(await q.enqueue("record_repayment", { p_amount: 100, p_client_ref: "dup" })).toEqual({ client_ref: "dup", queued: false });
    expect(await q.counts()).toEqual({ pending: 1, dead: 0 });
  });

  it("refuses RPCs that are not on the list, and everything while closed", async () => {
    await expect(make().enqueue("delete_customer", {})).rejects.toBeInstanceOf(NotQueueableError);
    await q.close();
    await expect(make({ closed: true }).enqueue("record_sale", {})).rejects.toBeInstanceOf(QueueClosedError);
    expect(await q.counts()).toEqual({ pending: 0, dead: 0 });
  });

  it("keeps first-in, first-out order; a dead entry steps aside and can go back in its place", async () => {
    const q = make();
    await q.enqueue("record_sale", { n: 1 });
    await q.enqueue("record_sale", { n: 2 });
    await q.enqueue("record_repayment", { n: 3 });
    const first = (await q.next())!;
    expect(first.args.n).toBe(1);

    await q.noteAttempt(first.seq, "network");
    expect((await q.next())!.seq).toBe(first.seq); // a network error keeps it first in line
    expect((await q.next())!.attempts).toBe(1);

    await q.markDead(first.seq, "bad_line");
    expect((await q.next())!.args.n).toBe(2);
    expect(await q.counts()).toEqual({ pending: 2, dead: 1 });
    expect((await q.list("dead"))[0].error).toBe("bad_line");

    await q.retry(first.seq);
    expect((await q.next())!.args.n).toBe(1);

    await q.remove(first.seq);
    expect((await q.list()).map((e) => e.args.n)).toEqual([2, 3]);
  });

  it("survives a reopen (the data is in IndexedDB, not memory)", async () => {
    const name = `test-queue-${++n}`;
    const a = createOfflineQueue({ dbName: name, rpcs: ["record_sale"] });
    const { client_ref } = await a.enqueue("record_sale", { n: 1 });
    await a.close();
    q = createOfflineQueue({ dbName: name, rpcs: ["record_sale"] });
    expect((await q.list())[0].client_ref).toBe(client_ref);
  });
});
