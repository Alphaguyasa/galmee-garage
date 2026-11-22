/**
 * When the offline queue replays by itself: the moment the network comes
 * back (`online`), when the till is opened again (window focus, tab becomes
 * visible), and every 60 s while anything is still waiting. All triggers go
 * through `replayNow`, which shares one running replay, so a burst of events
 * never sends an entry twice. No Service Worker background sync: it is
 * unreliable on cheap Androids, foreground triggers are enough.
 * Self-contained on purpose: other Galmee apps copy src/lib/galmee unchanged.
 */
import type { SyncEngine } from "./offline-sync";

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type SyncTriggerOptions = {
  /** Defaults to `window`. */
  win?: Listenable;
  /** Defaults to `document` (for `visibilitychange`). */
  doc?: Listenable & { visibilityState?: string };
  /** Defaults to 60 s. */
  intervalMs?: number;
  /** For tests; default to the global timers. */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
};

/** Starts the triggers and replays once now; returns the function that stops them. */
export function startSyncTriggers(
  engine: Pick<SyncEngine, "replayNow" | "getState">,
  {
    win = globalThis.window,
    doc = globalThis.document,
    intervalMs = 60_000,
    setInterval: every = (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: stopEvery = (id) => globalThis.clearInterval(id as ReturnType<typeof globalThis.setInterval>),
  }: SyncTriggerOptions = {},
): () => void {
  const replay = () => void engine.replayNow();
  const onVisible = () => {
    if (!doc || doc.visibilityState === undefined || doc.visibilityState === "visible") replay();
  };
  const tick = () => {
    if (engine.getState().pending > 0) replay();
  };

  win?.addEventListener("online", replay);
  win?.addEventListener("focus", replay);
  doc?.addEventListener("visibilitychange", onVisible);
  const id = every(tick, intervalMs);
  replay();

  return () => {
    win?.removeEventListener("online", replay);
    win?.removeEventListener("focus", replay);
    doc?.removeEventListener("visibilitychange", onVisible);
    stopEvery(id);
  };
}
