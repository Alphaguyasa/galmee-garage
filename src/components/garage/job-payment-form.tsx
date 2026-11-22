"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { SelectField } from "@/components/garage/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/config";
import { formatBirr } from "@/lib/money";
import { getOffline } from "@/lib/offline";
import { parsePayAmount } from "@/lib/pay-amount";

const METHODS = ["cash", "telebirr", "cbe_birr", "bank", "other"] as const;
const ERROR_CODES = ["overpayment", "bad_amount", "job_not_found", "job_closed", "not_allowed"] as const;

/**
 * Records a payment on a job straight from the phone. With no network it waits in
 * the phone's queue and is sent later; the same `client_ref` on every try means a
 * retry or a double tap can never record it twice.
 */
export function JobPaymentForm({ jobId, balance }: { jobId: string; balance: number }) {
  const t = useTranslations("job");
  const tErrors = useTranslations("errors");
  const tQueue = useTranslations("offlineQueue");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = parsePayAmount(String(form.get("amount") ?? ""));
    if (amount === null) return setError("bad_amount");
    if (amount > balance) return setError("overpayment");
    const method = String(form.get("method"));
    const reference = String(form.get("reference") ?? "").trim().slice(0, 80);

    setPending(true);
    setError(null);
    setNote(null);
    try {
      const result = await getOffline().engine.callOrQueue("gr_pay_job", {
        p_job: jobId,
        p_amount: amount,
        p_method: (METHODS as readonly string[]).includes(method) ? method : "cash",
        p_reference: reference || null,
        p_client_ref: clientRef,
      });
      if (result.status === "ok") {
        setClientRef(crypto.randomUUID());
        setNote(t("saved"));
        router.refresh();
      } else if (result.status === "queued") {
        setClientRef(crypto.randomUUID());
        setNote(tQueue("paymentQueued", { amount: formatBirr(amount, locale) }));
      } else {
        setError(ERROR_CODES.find((c) => result.error.message.includes(c)) ?? "generic");
      }
    } catch {
      setError("generic");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="payAmount">{t("amount")}</Label>
          <Input id="payAmount" name="amount" inputMode="decimal" required defaultValue={balance} autoComplete="off" />
        </div>
        <SelectField name="method" label={t("method")} options={METHODS.map((m) => ({ value: m, label: t(`methods.${m}`) }))} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reference">{t("reference")}</Label>
        <Input id="reference" name="reference" maxLength={80} autoComplete="off" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {tErrors(error)}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
          {note !== t("saved") ? <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
          {note}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
        {t("recordPayment")}
      </Button>
    </form>
  );
}
