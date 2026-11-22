"use client";

import { useState } from "react";
import { AlertTriangle, Clock, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QueueEntry } from "@/lib/galmee/offline-queue";
import { canDiscard, entryAge, syncStrings } from "@/lib/galmee/sync-strings";
import { Sheet } from "./sheet";

/**
 * What the sync chip opens: entries waiting for the network (oldest first,
 * with their age) and entries the server refused, each with the server's
 * reason in plain words, Try again, and Discard for the owner or a manager.
 * The app supplies the one-line summary of an entry and the wording of its
 * own error codes; this sheet only lays them out.
 */
export function QueueSheet({
  open,
  onClose,
  lang,
  entries,
  role,
  online,
  now,
  summarize,
  describeError,
  onSendNow,
  onRetry,
  onDiscard,
}: {
  open: boolean;
  onClose: () => void;
  lang: string;
  entries: QueueEntry[];
  role: string | null | undefined;
  online: boolean;
  now: number;
  /** "Sale · 3 items · 450 ETB" — the app knows its own RPC arguments. */
  summarize: (entry: QueueEntry) => string;
  /** Turns a server message such as `bad_line` into the app's own words. */
  describeError: (message: string) => string;
  onSendNow: () => void;
  onRetry: (seq: number) => void;
  onDiscard: (entry: QueueEntry) => void;
}) {
  const s = syncStrings(lang);
  const [confirming, setConfirming] = useState<number | null>(null);
  const pending = entries.filter((e) => e.state === "pending");
  const dead = entries.filter((e) => e.state === "dead");
  const mayDiscard = canDiscard(role);

  return (
    <Sheet open={open} onClose={onClose} title={s.sheetTitle} closeLabel={s.close}>
      {!online && (
        <p className="mb-3 flex items-start gap-2 rounded-md bg-band p-3 text-sm">
          <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          {s.offlineNote}
        </p>
      )}
      {entries.length === 0 && <p className="py-4 text-muted-foreground">{s.nothingWaiting}</p>}

      {dead.length > 0 && (
        <section aria-labelledby="queue-dead" className="mb-4">
          <h3 id="queue-dead" className="mb-2 flex items-center gap-1.5 font-bold text-urgent">
            <AlertTriangle className="size-4" aria-hidden />
            {s.failedHeading}
          </h3>
          <ul className="divide-y rounded-md border">
            {dead.map((e) => (
              <li key={e.seq} data-entry="dead" className="p-3">
                <p className="font-semibold">{summarize(e)}</p>
                <p className="text-sm text-urgent">{describeError(e.error ?? "")}</p>
                <p className="text-xs text-muted-foreground">{entryAge(e.created_at, now, s)}</p>
                {confirming === e.seq ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm font-semibold">{s.discardConfirm}</p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setConfirming(null);
                          onDiscard(e);
                        }}
                      >
                        {s.discard}
                      </Button>
                      <Button variant="outline" onClick={() => setConfirming(null)}>
                        {s.close}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => onRetry(e.seq)}>
                      {s.retry}
                    </Button>
                    {mayDiscard && (
                      <Button variant="ghost" className="text-urgent" onClick={() => setConfirming(e.seq)}>
                        {s.discard}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!mayDiscard && <p className="mt-2 text-xs text-muted-foreground">{s.discardOwnerOnly}</p>}
        </section>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="queue-pending">
          <h3 id="queue-pending" className="mb-2 flex items-center gap-1.5 font-bold text-warn">
            <Clock className="size-4" aria-hidden />
            {s.waitingHeading}
          </h3>
          <ol className="divide-y rounded-md border">
            {pending.map((e) => (
              <li key={e.seq} data-entry="pending" className="flex items-baseline justify-between gap-3 p-3">
                <span className="font-semibold">{summarize(e)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{entryAge(e.created_at, now, s)}</span>
              </li>
            ))}
          </ol>
          <Button className="mt-3 w-full" onClick={onSendNow} disabled={!online}>
            {s.sendNow}
          </Button>
        </section>
      )}
    </Sheet>
  );
}
