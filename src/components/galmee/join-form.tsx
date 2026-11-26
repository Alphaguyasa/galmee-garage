"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INVITE_CODE, normalizeCode, staffStrings, type RedeemStatus } from "@/lib/galmee/staff";

/**
 * The redeem screen behind /join/<code> (and the app's first run): the code
 * field is prefilled from the link, the new staffer adds their name and taps
 * Join. Signed out, it keeps the code and offers sign in / create account
 * links that come back here (`next=/join/<code>`). The app runs
 * staff_redeem_invite in `onRedeem` and turns the answer into a status with
 * redeemStatus(); on "ok" it sends the user home itself.
 */
export function JoinForm({
  lang,
  initialCode,
  signedIn,
  loginHref,
  signupHref,
  onRedeem,
}: {
  lang: string;
  initialCode?: string;
  signedIn: boolean;
  /** Where "Sign in" goes; the app adds its own `next` parameter. */
  loginHref: string;
  signupHref: string;
  onRedeem: (code: string, name: string) => Promise<RedeemStatus>;
}) {
  const s = staffStrings(lang);
  const [code, setCode] = useState(normalizeCode(initialCode ?? "").slice(0, 6));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<RedeemStatus | null>(null);
  const valid = INVITE_CODE.test(code);

  return (
    <section aria-labelledby="join-title" className="grid gap-4">
      <div className="grid gap-1">
        <h1 id="join-title" className="text-xl font-bold">
          {s.joinTitle}
        </h1>
        <p className="text-muted-foreground">{s.joinHelp}</p>
      </div>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy || !signedIn) return;
          const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
          setBusy(true);
          setStatus(null);
          try {
            setStatus(await onRedeem(code, name));
          } catch {
            setStatus("error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="join-code">{s.codeLabel}</Label>
          <Input
            id="join-code"
            name="code"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 6))}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            dir="ltr"
            aria-invalid={code.length === 6 && !valid}
            className="font-mono text-2xl tracking-[0.3em] uppercase"
          />
        </div>
        {signedIn ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="join-name">{s.yourName}</Label>
              <Input id="join-name" name="name" maxLength={80} autoComplete="name" />
            </div>
            <Button type="submit" disabled={!valid || busy}>
              {busy ? s.joining : s.join}
            </Button>
          </>
        ) : (
          <div className="grid gap-3" data-signed-out>
            <p className="text-sm">{s.signInFirst}</p>
            <div className="grid grid-cols-2 gap-3">
              <a href={loginHref} className="inline-flex h-12 items-center justify-center rounded-md border bg-card font-bold">
                {s.signIn}
              </a>
              <a
                href={signupHref}
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground"
              >
                {s.createAccount}
              </a>
            </div>
          </div>
        )}
        {status && status !== "ok" && (
          <p role="alert" data-status={status} className="rounded-md bg-urgent/10 p-3 text-sm text-urgent">
            {s.redeem[status]}
          </p>
        )}
      </form>
    </section>
  );
}
