"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { QueueSheet } from "@/components/galmee/queue-sheet";
import { SyncChip } from "@/components/galmee/sync-chip";
import type { Locale } from "@/i18n/config";
import type { QueueEntry } from "@/lib/galmee/offline-queue";
import { useQueueEntries, useSyncState, useSyncTriggers } from "@/lib/galmee/use-sync-state";
import { formatBirr } from "@/lib/money";
import { getOffline } from "@/lib/offline";

const ERROR_CODES = ["job_not_found", "job_closed", "bad_amount", "overpayment"] as const;

/** Header chip for payments waiting on this phone; tap opens the list. Replays on reconnect and refreshes the screen. */
export function OfflineSync({ role }: { role: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("offlineQueue");
  const router = useRouter();
  const [{ queue, engine }] = useState(getOffline);
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(0);
  const state = useSyncState(engine);
  const entries = useQueueEntries(queue, engine, open);
  useSyncTriggers(
    engine,
    useCallback(() => router.refresh(), [router]),
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const summarize = (e: QueueEntry) => t("queuedPayment", { amount: formatBirr(Number(e.args.p_amount ?? 0), locale) });
  const describeError = (message: string) => {
    const code = ERROR_CODES.find((c) => message.includes(c));
    return code ? t(`error_${code}`) : t("error_other");
  };

  return (
    <>
      <SyncChip
        state={state}
        lang={locale}
        onOpen={() => {
          setNow(Date.now());
          setOpen(true);
        }}
      />
      <QueueSheet
        open={open}
        onClose={() => setOpen(false)}
        lang={locale}
        entries={entries}
        role={role}
        online={online}
        now={now}
        summarize={summarize}
        describeError={describeError}
        onSendNow={() => void engine.replayNow()}
        onRetry={(seq) => void engine.retry(seq)}
        onDiscard={(e) => void engine.discard(e.seq)}
      />
    </>
  );
}
