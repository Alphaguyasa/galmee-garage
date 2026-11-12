import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TriangleAlert } from "lucide-react";
import { addItemAction, receiveStockAction } from "@/actions/garage";
import { StatusBadge } from "@/components/galmee/status-badge";
import { ActionForm } from "@/components/garage/action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/config";
import { formatBirr } from "@/lib/money";
import { listParts } from "@/server/dal/garage";
import { getSession } from "@/server/dal/session";
import { cn } from "@/lib/utils";
import { z } from "zod";

const searchSchema = z.string().trim().max(60);

export default async function PartsPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const { q, low: lowParam } = await searchParams;
  const lowOnly = lowParam === "1";
  const query = searchSchema.safeParse(q ?? "").data ?? "";
  const locale = (await getLocale()) as Locale;
  const [t, allParts, { profile }] = await Promise.all([getTranslations("partsPage"), listParts(locale, query), getSession()]);
  const canManage = profile.role !== "staff";
  const isLow = (p: { onHand: number; reorderLevel: number }) => p.onHand <= p.reorderLevel;
  const lowCount = allParts.filter(isLow).length;
  // The reorder list puts the biggest shortfall first.
  const parts = lowOnly
    ? allParts.filter(isLow).sort((a, b) => a.onHand - a.reorderLevel - (b.onHand - b.reorderLevel))
    : allParts;
  const filterHref = (lowView: boolean) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (lowView) params.set("low", "1");
    const qs = params.toString();
    return qs ? `/parts?${qs}` : "/parts";
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
      <form action="/parts" className="flex items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-2">
          <Label htmlFor="q">{t("search")}</Label>
          <Input id="q" name="q" defaultValue={query} placeholder={t("searchPlaceholder")} autoComplete="off" />
        </div>
        <Button type="submit" size="lg">{t("searchAction")}</Button>
      </form>

      <nav className="flex flex-wrap gap-2" aria-label={t("filter")}>
        <Link
          href={filterHref(false)}
          aria-current={!lowOnly ? "page" : undefined}
          className={cn(buttonVariants({ variant: lowOnly ? "outline" : "default" }), lowOnly && "bg-card")}
        >
          {t("all", { count: allParts.length })}
        </Link>
        <Link
          href={filterHref(true)}
          aria-current={lowOnly ? "page" : undefined}
          className={cn(buttonVariants({ variant: lowOnly ? "default" : "outline" }), !lowOnly && "bg-card")}
        >
          {t("lowFilter", { count: lowCount })}
        </Link>
      </nav>

      {parts.length === 0 ? (
        <p className="text-muted-foreground">{lowOnly ? t("noneLow") : query ? t("noMatch") : t("empty")}</p>
      ) : (
        <ul>
          {parts.map((p) => {
            const low = isLow(p);
            return (
              <li key={p.id} className="grid gap-1 border-b py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{p.name}</span>
                  <span className="num shrink-0">{formatBirr(p.price, locale)}</span>
                </div>
                <p className="num flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>{p.sku ?? "—"}</span>
                  <span className={low ? "font-semibold text-foreground" : ""}>
                    {t("onHand")}: {p.onHand} {p.unit}
                    {low ? ` · ${t("reorderAt", { level: p.reorderLevel })}` : ""}
                  </span>
                  {low ? (
                    <StatusBadge tone="warn" icon={TriangleAlert}>
                      {t("low")}
                    </StatusBadge>
                  ) : null}
                </p>
                {canManage ? (
                  <details>
                    <summary className="cursor-pointer py-1 text-sm font-medium">{t("receive")}</summary>
                    <ActionForm action={receiveStockAction} submitLabel={t("receive")} doneLabel={t("received")} className="grid gap-2 pt-2">
                      <input type="hidden" name="item" value={p.id} />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label htmlFor={`qty-${p.id}`}>{t("receiveQty")}</Label>
                          <Input id={`qty-${p.id}`} name="qty" inputMode="decimal" required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`cost-${p.id}`}>{t("cost")}</Label>
                          <Input id={`cost-${p.id}`} name="cost" inputMode="decimal" defaultValue={p.cost} required />
                        </div>
                      </div>
                    </ActionForm>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canManage ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t("addTitle")}</h2>
          <ActionForm action={addItemAction} submitLabel={t("addAction")} doneLabel={t("added")}>
            <div className="grid gap-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input id="name" name="name" required maxLength={120} autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="sku">{t("sku")}</Label>
                <Input id="sku" name="sku" maxLength={40} autoComplete="off" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">{t("unit")}</Label>
                <Input id="unit" name="unit" defaultValue={t("unitDefault")} required maxLength={12} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="price">{t("price")}</Label>
                <Input id="price" name="price" inputMode="decimal" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cost">{t("cost")}</Label>
                <Input id="cost" name="cost" inputMode="decimal" required defaultValue="0" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reorder">{t("reorder")}</Label>
                <Input id="reorder" name="reorder" inputMode="decimal" required defaultValue="0" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="openingQty">{t("opening")}</Label>
                <Input id="openingQty" name="openingQty" inputMode="decimal" />
              </div>
            </div>
          </ActionForm>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{t("addManagerOnly")}</p>
      )}
    </div>
  );
}
