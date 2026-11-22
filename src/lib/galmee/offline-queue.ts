/**
 * Galmee offline queue, storage part: money RPC calls waiting for the network.
 *
 * An entry is `{ rpc, args, client_ref }`: the server stays the only place money
 * logic runs; offline only changes *when* an RPC runs. Only whitelisted RPCs
 * (ones that take `p_client_ref`, so replays are idempotent server-side) can be
 * queued. The queue also dedupes on `client_ref` itself, and keeps strict
 * first-in, first-out order. Stored in IndexedDB (one database per app), so it
 * survives a refresh and a PWA restart.
 *
 * Self-contained on purpose: other Galmee apps copy src/lib/galmee unchanged.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type QueueState = "pending" | "dead";

export type QueueEntry = {
  /** Insertion order; replay goes oldest first. */
  seq: number;
  client_ref: string;
  rpc: string;
  /** The RPC arguments, `p_client_ref` included. */
  args: Record<string, unknown>;
  state: QueueState;
  attempts: number;
  created_at: number;
  /** The server's message for a rejected (dead) entry, or the last network error. */
  error?: string;
};

/** Thrown when an RPC that is not on the app's list is queued: reads and other calls fail fast instead. */
export class NotQueueableError extends Error {
  constructor(rpc: string) {
    super(`not_queueable: ${rpc}`);
    this.name = "NotQueueableError";
  }
}

/** Thrown while the business is read-only (billing lock): nothing new may be queued. */
export class QueueClosedError extends Error {
  constructor() {
    super("queue_closed");
    this.name = "QueueClosedError";
  }
}

/** As stored: IndexedDB assigns `seq` on add. */
type StoredEntry = Omit<QueueEntry, "seq"> & { seq?: number };

interface QueueDb extends DBSchema {
  entries: { key: number; value: StoredEntry; indexes: { client_ref: string; state: QueueState } };
  meta: { key: string; value: string };
}

export type OfflineQueueOptions = {
  /** One database per app, e.g. "galmee-pharmacy-queue". */
  dbName: string;
  /** RPC names that may be queued (each must accept `p_client_ref`). */
  rpcs: readonly string[];
  /** True while the business may not write (billing lock); enqueue then throws QueueClosedError. */
  isClosed?: () => boolean;
  /** For tests; defaults to crypto.randomUUID. */
  newRef?: () => string;
};

export type OfflineQueue = ReturnType<typeof createOfflineQueue>;

export function createOfflineQueue({ dbName, rpcs, isClosed, newRef }: OfflineQueueOptions) {
  const allowed = new Set(rpcs);
  const makeRef = newRef ?? (() => crypto.randomUUID());
  let dbp: Promise<IDBPDatabase<QueueDb>> | null = null;
  const db = () =>
    (dbp ??= openDB<QueueDb>(dbName, 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const store = d.createObjectStore("entries", { keyPath: "seq", autoIncrement: true });
          store.createIndex("client_ref", "client_ref", { unique: true });
          store.createIndex("state", "state");
        }
        if (oldVersion < 2) d.createObjectStore("meta");
      },
    }));

  return {
    /**
     * Queues one RPC call. The `client_ref` is generated now (or taken from
     * `args.p_client_ref`) and passed through to the server. Queuing the same
     * `client_ref` twice keeps the first entry.
     */
    async enqueue(rpc: string, args: Record<string, unknown>): Promise<{ client_ref: string; queued: boolean }> {
      if (!allowed.has(rpc)) throw new NotQueueableError(rpc);
      if (isClosed?.()) throw new QueueClosedError();
      const given = args.p_client_ref;
      const client_ref = typeof given === "string" && given ? given : makeRef();
      const tx = (await db()).transaction("entries", "readwrite");
      const existing = await tx.store.index("client_ref").getKey(client_ref);
      if (existing !== undefined) {
        await tx.done;
        return { client_ref, queued: false };
      }
      await tx.store.add({
        client_ref,
        rpc,
        args: { ...args, p_client_ref: client_ref },
        state: "pending",
        attempts: 0,
        created_at: Date.now(),
      });
      await tx.done;
      return { client_ref, queued: true };
    },

    /** Entries oldest first; pass a state to filter. */
    async list(state?: QueueState): Promise<QueueEntry[]> {
      const all = (await (await db()).getAll("entries")) as QueueEntry[];
      return state ? all.filter((e) => e.state === state) : all;
    },

    /** The oldest pending entry, the next one to replay. */
    async next(): Promise<QueueEntry | undefined> {
      const cursor = await (await db()).transaction("entries").store.openCursor();
      for (let c = cursor; c; c = await c.continue()) if (c.value.state === "pending") return c.value as QueueEntry;
      return undefined;
    },

    async counts(): Promise<{ pending: number; dead: number }> {
      const d = await db();
      const [pending, dead] = await Promise.all([
        d.countFromIndex("entries", "state", "pending"),
        d.countFromIndex("entries", "state", "dead"),
      ]);
      return { pending, dead };
    },

    /** The server accepted it: forget the entry. */
    async remove(seq: number): Promise<void> {
      await (await db()).delete("entries", seq);
    },

    /** A retryable failure (network, timeout, 5xx): stays pending, in place. */
    async noteAttempt(seq: number, error: string): Promise<void> {
      const d = await db();
      const e = await d.get("entries", seq);
      if (e) await d.put("entries", { ...e, attempts: e.attempts + 1, error });
    },

    /** The server rejected it (4xx, a database exception): it leaves the line so later entries can go. */
    async markDead(seq: number, error: string): Promise<void> {
      const d = await db();
      const e = await d.get("entries", seq);
      if (e) await d.put("entries", { ...e, attempts: e.attempts + 1, state: "dead", error });
    },

    /** Puts a dead entry back in line (same seq, so it keeps its original place). */
    async retry(seq: number): Promise<void> {
      const d = await db();
      const e = await d.get("entries", seq);
      if (e && e.state === "dead") await d.put("entries", { ...e, state: "pending", error: undefined });
    },

    /**
     * A random id for this install (this browser / PWA), made once and kept with
     * the queue. The sync beacon reports under it; it is never a user id.
     */
    async deviceId(): Promise<string> {
      const tx = (await db()).transaction("meta", "readwrite");
      let id = await tx.store.get("device_id");
      if (!id) {
        id = makeRef().replace(/[^A-Za-z0-9_-]/g, "");
        await tx.store.put(id, "device_id");
      }
      await tx.done;
      return id;
    },

    /** Closes the database connection (tests, sign-out). */
    async close(): Promise<void> {
      if (dbp) (await dbp).close();
      dbp = null;
    },
  };
}
