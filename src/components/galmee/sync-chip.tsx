import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import type { SyncState } from "@/lib/galmee/offline-sync";
import { syncStrings } from "@/lib/galmee/sync-strings";
import { cn } from "@/lib/utils";

/**
 * The one sync indicator for the header: a green check when everything is
 * sent, amber "3" with a clock while sales wait for the network, red "1" with
 * a warning when the server refused something. Icon plus figure, never colour
 * alone; the full sentence is the accessible name. Tapping opens the queue sheet.
 */
export function SyncChip({
  state,
  lang,
  onOpen,
  className,
}: {
  state: SyncState;
  lang: string;
  onOpen: () => void;
  className?: string;
}) {
  const s = syncStrings(lang);
  const view =
    state.dead > 0
      ? { tone: "text-urgent bg-urgent/10", Icon: AlertTriangle, figure: state.dead, label: s.dead(state.dead), kind: "dead" }
      : state.pending > 0
        ? {
            tone: "text-warn bg-warn/10",
            Icon: state.syncing ? RefreshCw : Clock,
            figure: state.pending,
            label: state.syncing ? `${s.syncing} ${s.pending(state.pending)}` : s.pending(state.pending),
            kind: "pending",
          }
        : { tone: "text-money-in bg-money-in/10", Icon: CheckCircle2, figure: null, label: s.synced, kind: "synced" };
  const { Icon } = view;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={view.label}
      title={view.label}
      data-sync={view.kind}
      className={cn(
        "inline-flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-md px-3 text-base font-bold tabular-nums",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        view.tone,
        className,
      )}
    >
      <Icon
        className={cn("size-5 shrink-0", state.syncing && view.kind === "pending" && "motion-safe:animate-spin")}
        aria-hidden
      />
      {view.figure !== null && <span aria-hidden>{view.figure}</span>}
    </button>
  );
}
