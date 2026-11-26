"use client";

import { useState } from "react";
import { Ban, Crown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canManageMember,
  staffPermissions,
  staffStrings,
  type StaffMember,
  type StaffRole,
} from "@/lib/galmee/staff";
import { ListRow, ListSheet } from "./list-row";
import { Sheet } from "./sheet";
import { StatusBadge } from "./status-badge";

const SELECT =
  "h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const ROLE_ORDER: StaffRole[] = ["owner", "manager", "staff"];

/**
 * Settings -> Staff: everyone in the business, owners first, deactivated last.
 * The owner gets a role menu and Deactivate/Reactivate on every row but their
 * own; a manager sees the list read-only plus "Invite staff"; staff see no
 * buttons. The app passes the rows and runs the RPCs; a refused call comes
 * back as `error` (already in plain words, see staffErrorKey).
 */
export function StaffList({
  lang,
  members,
  myRole,
  myUserId,
  busyUserId,
  error,
  onInvite,
  onSetRole,
  onSetActive,
}: {
  lang: string;
  members: StaffMember[];
  myRole: string | null | undefined;
  myUserId: string;
  /** Row with a call in flight: its controls are disabled. */
  busyUserId?: string | null;
  error?: string | null;
  onInvite: () => void;
  onSetRole: (userId: string, role: StaffRole) => void;
  onSetActive: (userId: string, active: boolean) => void;
}) {
  const s = staffStrings(lang);
  const perms = staffPermissions(myRole);
  const [confirming, setConfirming] = useState<StaffMember | null>(null);
  const rows = [...members].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
      a.full_name.localeCompare(b.full_name),
  );

  return (
    <section aria-labelledby="staff-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="staff-title" className="text-lg font-bold">
          {s.title}
        </h2>
        {perms.canInvite && (
          <Button size="sm" onClick={onInvite} data-action="invite">
            <UserPlus aria-hidden />
            {s.invite}
          </Button>
        )}
      </div>
      {myRole === "manager" && <p className="text-sm text-muted-foreground">{s.managerNote}</p>}
      {error && (
        <p role="alert" className="rounded-md bg-urgent/10 p-3 text-sm text-urgent">
          {error}
        </p>
      )}
      <ListSheet>
        {rows.map((m) => {
          const manage = canManageMember(myRole, myUserId, m);
          const busy = busyUserId === m.user_id;
          return (
            <ListRow
              key={m.user_id}
              title={
                <>
                  {m.full_name}
                  {m.user_id === myUserId && <span className="font-normal text-muted-foreground"> ({s.you})</span>}
                </>
              }
              sub={<span dir="ltr">{m.phone || s.noPhone}</span>}
              className={m.active ? undefined : "opacity-70"}
              right={
                <div className="flex max-w-[11rem] flex-col items-end gap-2" data-member={m.user_id}>
                  {m.active ? (
                    <StatusBadge tone={m.role === "owner" ? "ok" : "neutral"} icon={Crown}>
                      {s.roles[m.role]}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="urgent" icon={Ban}>
                      {s.inactive}
                    </StatusBadge>
                  )}
                  {manage && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {m.active && (
                        <select
                          aria-label={`${s.changeRole}: ${m.full_name}`}
                          className={SELECT}
                          value={m.role}
                          disabled={busy}
                          data-action="role"
                          onChange={(e) => onSetRole(m.user_id, e.target.value as StaffRole)}
                        >
                          {ROLE_ORDER.map((r) => (
                            <option key={r} value={r}>
                              {s.roles[r]}
                            </option>
                          ))}
                        </select>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        data-action={m.active ? "deactivate" : "reactivate"}
                        onClick={() => (m.active ? setConfirming(m) : onSetActive(m.user_id, true))}
                      >
                        {m.active ? s.deactivate : s.reactivate}
                      </Button>
                    </div>
                  )}
                </div>
              }
            />
          );
        })}
      </ListSheet>
      <Sheet open={confirming !== null} onClose={() => setConfirming(null)} title={s.deactivate} closeLabel={s.close}>
        {confirming && (
          <div className="grid gap-4">
            <p>{s.deactivateConfirm(confirming.full_name)}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setConfirming(null)}>
                {s.cancel}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onSetActive(confirming.user_id, false);
                  setConfirming(null);
                }}
              >
                {s.confirm}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}
