"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canRevoke,
  hoursLeft,
  inviteLink,
  openInvites,
  staffPermissions,
  staffStrings,
  type StaffInvite,
  type StaffRole,
} from "@/lib/galmee/staff";
import { ListRow, ListSheet } from "./list-row";
import { ReceiptQr } from "./receipt-qr";
import { Sheet } from "./sheet";

const SELECT =
  "flex h-12 w-full rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export type InviteRequest = { role: Exclude<StaffRole, "owner">; name: string; phone: string };

/** What the share button hands to navigator.share (or copies): text + the deep link. */
export function invitePayload(lang: string, business: string, origin: string, code: string) {
  const url = inviteLink(origin, code);
  return { title: staffStrings(lang).inviteTitle, text: staffStrings(lang).shareText(business, url, code), url };
}

/**
 * The invite sheet: pick a role (owner: manager or staff; manager: staff
 * only), optional name and phone, get a one-time code. The code shows large,
 * with a QR of the join link and a Share button (the phone's share menu, or
 * copy where there is none). Below: open invites with Revoke. The app runs
 * staff_create_invite / staff_revoke_invite and passes the result back as
 * `created`.
 */
export function InviteSheet({
  open,
  onClose,
  lang,
  myRole,
  business,
  origin,
  invites,
  created,
  busy,
  error,
  now,
  onCreate,
  onRevoke,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  lang: string;
  myRole: string | null | undefined;
  /** Business name for the share text. */
  business: string;
  /** Origin of the app, for the /join/<code> link. */
  origin: string;
  invites: StaffInvite[];
  /** The invite just created, shown as the big code. */
  created: Pick<StaffInvite, "code" | "expires_at"> | null;
  busy?: boolean;
  error?: string | null;
  now: number;
  onCreate: (req: InviteRequest) => void;
  onRevoke: (id: string) => void;
  /** Back to the form for another code. */
  onReset: () => void;
}) {
  const s = staffStrings(lang);
  const roles = staffPermissions(myRole).inviteRoles;
  const [role, setRole] = useState<InviteRequest["role"]>("staff");
  const [copied, setCopied] = useState(false);
  const list = openInvites(invites, now);

  async function share(code: string) {
    const payload = invitePayload(lang, business, origin, code);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(payload.text);
      setCopied(true);
    } catch {
      // The user closed the share menu, or the clipboard is blocked: the code is on screen anyway.
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={s.inviteTitle} closeLabel={s.close}>
      <div className="grid gap-5">
        {error && (
          <p role="alert" className="rounded-md bg-urgent/10 p-3 text-sm text-urgent">
            {error}
          </p>
        )}
        {created ? (
          <div className="grid justify-items-center gap-3 text-center" data-invite-code={created.code}>
            <p className="text-sm font-semibold text-muted-foreground">{s.codeHeading}</p>
            <p className="font-mono text-4xl font-bold tracking-[0.25em]" dir="ltr" aria-live="polite">
              {created.code}
            </p>
            <ReceiptQr value={inviteLink(origin, created.code)} size={160} label={s.codeHeading} />
            <p className="text-sm">{s.codeHelp}</p>
            <p className="text-sm text-muted-foreground">{s.expiresIn(hoursLeft(created.expires_at, now))}</p>
            <div className="grid w-full grid-cols-2 gap-3">
              <Button onClick={() => share(created.code)} data-action="share">
                <Share2 aria-hidden />
                {copied ? s.copied : s.share}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCopied(false);
                  onReset();
                }}
              >
                {s.newCode}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onCreate({ role, name: String(f.get("name") ?? "").trim(), phone: String(f.get("phone") ?? "").trim() });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="invite-role">{s.roleLabel}</Label>
              <select
                id="invite-role"
                className={SELECT}
                value={roles.includes(role) ? role : "staff"}
                onChange={(e) => setRole(e.target.value as InviteRequest["role"])}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {s.roles[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-name">
                {s.nameLabel} <span className="font-normal text-muted-foreground">({s.optional})</span>
              </Label>
              <Input id="invite-name" name="name" maxLength={80} autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-phone">
                {s.phoneLabel} <span className="font-normal text-muted-foreground">({s.optional})</span>
              </Label>
              <Input id="invite-phone" name="phone" type="tel" inputMode="tel" maxLength={20} dir="ltr" />
            </div>
            <Button type="submit" disabled={busy || roles.length === 0}>
              {s.createCode}
            </Button>
          </form>
        )}
        <div className="grid gap-2">
          <h3 className="text-sm font-bold">{s.openHeading}</h3>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">{s.noOpen}</p>
          ) : (
            <ListSheet>
              {list.map((i) => (
                <ListRow
                  key={i.id}
                  title={
                    <span className="font-mono tracking-widest" dir="ltr">
                      {i.code}
                    </span>
                  }
                  sub={
                    <span>
                      {s.roles[i.role]}
                      {i.display_name ? ` · ${i.display_name}` : ""} · {s.expiresIn(hoursLeft(i.expires_at, now))}
                    </span>
                  }
                  right={
                    canRevoke(myRole, i) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        data-action="revoke"
                        onClick={() => onRevoke(i.id)}
                      >
                        {s.revoke}
                      </Button>
                    ) : null
                  }
                />
              ))}
            </ListSheet>
          )}
        </div>
      </div>
    </Sheet>
  );
}
