"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { InviteSheet, type InviteRequest } from "@/components/galmee/invite-sheet";
import { StaffList } from "@/components/galmee/staff-list";
import { staffStrings, type StaffErrorKey, type StaffInvite, type StaffMember, type StaffRole } from "@/lib/galmee/staff";
import { changeStaffActive, changeStaffRole, inviteStaff, revokeStaffInvite } from "@/actions/staff";

/** Settings → Staff: the kit's staff list and invite sheet, wired to this app's server actions. */
export function StaffScreen({
  lang,
  business,
  myRole,
  myUserId,
  members,
  invites,
}: {
  lang: string;
  business: string;
  myRole: StaffRole;
  myUserId: string;
  members: StaffMember[];
  invites: StaffInvite[];
}) {
  const s = staffStrings(lang);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ code: string; expires_at: string } | null>(null);
  const [origin, setOrigin] = useState("");
  const [now, setNow] = useState(0);

  const say = (code: StaffErrorKey) => s.errors[code] ?? s.errors.generic;

  function memberChange(userId: string, run: () => ReturnType<typeof changeStaffRole>) {
    setBusyUserId(userId);
    setListError(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) setListError(say(result.code));
      setBusyUserId(null);
      router.refresh();
    });
  }

  return (
    <>
      <StaffList
        lang={lang}
        members={members}
        myRole={myRole}
        myUserId={myUserId}
        busyUserId={busyUserId}
        error={listError}
        onInvite={() => {
          // The share link needs the real origin, and "open" invites the current time: both read on open.
          setOrigin(window.location.origin);
          setNow(Date.now());
          setCreated(null);
          setSheetError(null);
          setSheetOpen(true);
        }}
        onSetRole={(userId, role) => memberChange(userId, () => changeStaffRole(userId, role))}
        onSetActive={(userId, active) => memberChange(userId, () => changeStaffActive(userId, active))}
      />
      <InviteSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        lang={lang}
        myRole={myRole}
        business={business}
        origin={origin}
        invites={invites}
        created={created}
        busy={pending}
        error={sheetError}
        now={now}
        onCreate={(req: InviteRequest) => {
          setSheetError(null);
          startTransition(async () => {
            const result = await inviteStaff(req);
            if (result.ok) setCreated(result.data);
            else setSheetError(say(result.code));
            router.refresh();
          });
        }}
        onRevoke={(id) => {
          setSheetError(null);
          startTransition(async () => {
            const result = await revokeStaffInvite(id);
            if (!result.ok) setSheetError(say(result.code));
            router.refresh();
          });
        }}
        onReset={() => setCreated(null)}
      />
    </>
  );
}
