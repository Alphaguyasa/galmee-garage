"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { OfflineQueue, QueueEntry } from "./offline-queue";
import type { ReplayReport, SyncEngine, SyncState } from "./offline-sync";
import { startSyncTriggers } from "./sync-triggers";

const SERVER_STATE: SyncState = { pending: 0, dead: 0, syncing: false };

/** The sync chip's numbers, live: pending, dead, syncing, last sync time. */
export function useSyncState(engine: SyncEngine): SyncState {
  useEffect(() => {
    void engine.refresh();
  }, [engine]);
  return useSyncExternalStore(engine.subscribe, engine.getState, () => SERVER_STATE);
}

/** The queue's entries, reloaded whenever the counts change (for the queue sheet; only loads while `active`). */
export function useQueueEntries(queue: OfflineQueue, engine: SyncEngine, active: boolean): QueueEntry[] {
  const state = useSyncState(engine);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    void queue.list().then((list) => {
      if (live) setEntries(list);
    });
    return () => {
      live = false;
    };
  }, [queue, active, state]);
  return entries;
}

/**
 * Mount once near the top of the app: replays on reconnect, focus and every
 * 60 s while entries wait, and calls `onSynced` (e.g. router.refresh) after
 * entries land, so the screen shows the server's numbers.
 */
export function useSyncTriggers(engine: SyncEngine, onSynced?: (report: ReplayReport) => void) {
  useEffect(() => startSyncTriggers(engine), [engine]);
  useEffect(() => (onSynced ? engine.onSynced(onSynced) : undefined), [engine, onSynced]);
}
