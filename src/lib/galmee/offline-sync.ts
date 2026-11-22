/**
 * Galmee offline queue, network part: `callOrQueue` and the replay engine.
 *
 * - Online with nothing waiting: the RPC runs now and its result comes back.
 * - Offline, a network failure, or older entries still waiting: the call is
 *   queued with its `client_ref` (strict first-in, first-out, so a sale never
 *   overtakes an earlier one) and replayed later.
 * - Replay goes oldest first, one at a time. A retryable failure (network,
 *   timeout, 5xx, expired session) is retried after 2 s, 10 s and 60 s, then
 *   the cycle stops and the entry keeps its place: network errors never
 *   dead-letter. A rejected entry (the server said no: a 4xx or a database
 *   exception such as `bad_line`) moves to the dead letters and the next entry
 *   goes, so one bad sale does not strand the day's sales behind it.
 * - The server wins: after entries land, `onSynced` fires so screens refetch.
 *
 * `call` has the shape of `supabase.rpc(name, args)`, so the app passes
 * `(rpc, args) => supabase.rpc(rpc, args)`; tests pass a fake.
 * Self-contained on purpose: other Galmee apps copy src/lib/galmee unchanged.
 */
import type { OfflineQueue } from "./offline-queue";

export type RpcError = { message: string; code?: string | null; details?: string | null; hint?: string | null };
export type RpcResult = { data: unknown; error: RpcError | null; status?: number };
export type RpcCall = (rpc: string, args: Record<string, unknown>) => Promise<RpcResult>;

export type Outcome = "ok" | "retryable" | "rejected";

/**
 * How a finished call counts. `status` 0 is what supabase-js reports when fetch
 * itself failed; 401 is an expired session (not the entry's fault); 408/429
 * and 5xx are the server being busy or down. Any other error was a decision
 * by the server about this entry.
 */
export function classify(res: RpcResult): Outcome {
  if (!res.error) return "ok";
  const s = res.status;
  if (s === undefined || s === 0 || s === 401 || s === 408 || s === 429 || s >= 500) return "retryable";
  return "rejected";
}

export type CallResult =
  | { status: "ok"; client_ref: string; data: unknown }
  | { status: "queued"; client_ref: string }
  | { status: "rejected"; client_ref: string; error: RpcError };

export type ReplayReport = { synced: number; dead: number; held: boolean };

/** What the sync chip shows. A new object on every change (safe for useSyncExternalStore). */
export type SyncState = { pending: number; dead: number; syncing: boolean; lastSyncAt?: number };

export type SyncEngineOptions = {
  queue: OfflineQueue;
  call: RpcCall;
  /** Defaults to `navigator.onLine` (true where there is no navigator). */
  isOnline?: () => boolean;
  /** Waits between retries of one entry; defaults to 2 s, 10 s, 60 s. */
  delays?: readonly number[];
  /** For tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Fires once per replay cycle in which at least one entry landed. */
  onSynced?: (report: ReplayReport) => void;
  /** Fires whenever the queue's counts may have changed. */
  onChange?: () => void;
  /** For tests; defaults to crypto.randomUUID. */
  newRef?: () => string;
  /**
   * Reports this till's queue to the server after every replay cycle that
   * reached the network, e.g. `(b) => supabase.rpc("ph_sync_beacon", { p_device: b.device,
   * p_pending: b.pending, p_dead: b.dead, p_oldest_at: b.oldestAt })` (kit template
   * `sync_beacon_template.sql`). Failures are ignored: the next cycle reports again.
   */
  beacon?: (report: BeaconReport) => Promise<unknown>;
};

export type BeaconReport = { device: string; pending: number; dead: number; oldestAt: string | null };

const errorText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

export function createSyncEngine({
  queue,
  call,
  isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine),
  delays = [2000, 10000, 60000],
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  onSynced,
  onChange,
  newRef = () => crypto.randomUUID(),
  beacon,
}: SyncEngineOptions) {
  /** A thrown call (fetch rejected outright) counts as a network failure. */
  const attempt = async (rpc: string, args: Record<string, unknown>): Promise<RpcResult> => {
    try {
      return await call(rpc, args);
    } catch (e) {
      return { data: null, error: { message: errorText(e) }, status: 0 };
    }
  };

  let running: Promise<ReplayReport> | null = null;
  let state: SyncState = { pending: 0, dead: 0, syncing: false };
  const listeners = new Set<() => void>();
  const syncedListeners = new Set<(report: ReplayReport) => void>();
  const setState = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  /** Re-reads the counts from the queue and tells subscribers. */
  const refresh = async () => {
    setState(await queue.counts());
    onChange?.();
  };

  const replayOnce = async (): Promise<ReplayReport> => {
    const report: ReplayReport = { synced: 0, dead: 0, held: false };
    for (let entry = await queue.next(); entry; entry = await queue.next()) {
      let outcome: Outcome = "retryable";
      for (let i = 0; ; i++) {
        if (!isOnline()) {
          outcome = "retryable";
          break;
        }
        const res = await attempt(entry.rpc, entry.args);
        outcome = classify(res);
        if (outcome === "ok") {
          await queue.remove(entry.seq);
          report.synced++;
          break;
        }
        if (outcome === "rejected") {
          await queue.markDead(entry.seq, res.error?.message ?? "rejected");
          report.dead++;
          break;
        }
        await queue.noteAttempt(entry.seq, res.error?.message ?? "network");
        if (i >= delays.length) break;
        await sleep(delays[i]);
      }
      await refresh();
      if (outcome === "retryable") {
        report.held = true;
        break;
      }
    }
    if (beacon && isOnline()) {
      try {
        const [counts, oldest, device] = await Promise.all([queue.counts(), queue.next(), queue.deviceId()]);
        await beacon({ device, ...counts, oldestAt: oldest ? new Date(oldest.created_at).toISOString() : null });
      } catch {
        // offline again or refused: the next cycle reports again
      }
    }
    if (report.synced > 0) {
      setState({ lastSyncAt: Date.now() });
      onSynced?.(report);
      syncedListeners.forEach((l) => l(report));
    }
    return report;
  };

  /**
   * Replays the queue now. Calls made while a replay is running share it,
   * so two triggers never send the same entry twice at once.
   */
  const replayNow = (): Promise<ReplayReport> => {
    if (!running) {
      setState({ syncing: true });
      running = replayOnce().finally(() => {
        running = null;
        setState({ syncing: false });
      });
    }
    return running;
  };

  return {
    replayNow,
    refresh,
    getState: (): SyncState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Runs `listener` after every replay cycle in which entries landed (screens refetch). */
    onSynced(listener: (report: ReplayReport) => void): () => void {
      syncedListeners.add(listener);
      return () => void syncedListeners.delete(listener);
    },
    /** Puts a dead entry back in line and replays. */
    async retry(seq: number): Promise<ReplayReport> {
      await queue.retry(seq);
      await refresh();
      return replayNow();
    },
    /**
     * Drops a dead entry for good. The screen checks the role (canDiscard) and
     * records the attempt through the app's audit path before calling this.
     */
    async discard(seq: number): Promise<void> {
      const entry = (await queue.list("dead")).find((e) => e.seq === seq);
      if (!entry) return;
      await queue.remove(seq);
      await refresh();
    },

    /**
     * Runs a whitelisted money RPC now, or queues it. The `client_ref` is fixed
     * before the first try, so a call that reached the server but lost its
     * answer is not written twice when the queued copy replays.
     */
    async callOrQueue(rpc: string, args: Record<string, unknown>): Promise<CallResult> {
      const given = args.p_client_ref;
      const client_ref = typeof given === "string" && given ? given : newRef();
      const withRef = { ...args, p_client_ref: client_ref };
      const queueIt = async (): Promise<CallResult> => {
        await queue.enqueue(rpc, withRef);
        await refresh();
        return { status: "queued", client_ref };
      };

      // Older entries still waiting: keep the order, go behind them.
      if (!isOnline() || (await queue.counts()).pending > 0) {
        const res = await queueIt();
        if (isOnline()) void replayNow();
        return res;
      }
      const res = await attempt(rpc, withRef);
      const outcome = classify(res);
      if (outcome === "ok") return { status: "ok", client_ref, data: res.data };
      if (outcome === "rejected") return { status: "rejected", client_ref, error: res.error! };
      return queueIt();
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
