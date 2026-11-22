"use client";

import { createOfflineQueue, type OfflineQueue } from "@/lib/galmee/offline-queue";
import { createSyncEngine, type RpcCall, type SyncEngine } from "@/lib/galmee/offline-sync";
import { createClient } from "@/lib/supabase/client";

/** Money RPCs that may wait on this phone for the network; each is idempotent on `p_client_ref`. */
export const QUEUEABLE_RPCS = ["gr_pay_job"] as const;

let instance: { queue: OfflineQueue; engine: SyncEngine } | null = null;

/** One queue and one replay engine per browser tab. */
export function getOffline(): { queue: OfflineQueue; engine: SyncEngine } {
  if (instance) return instance;
  const supabase = createClient();
  const call: RpcCall = async (rpc, args) => {
    // The list above is the only way in; the queue refuses any other name.
    const { data, error, status } = await supabase.rpc(rpc as (typeof QUEUEABLE_RPCS)[number], args as never);
    return { data, error, status };
  };
  const queue = createOfflineQueue({ dbName: "galmee-garage-queue", rpcs: QUEUEABLE_RPCS });
  instance = { queue, engine: createSyncEngine({ queue, call }) };
  return instance;
}
