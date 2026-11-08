import { getLocale, getTranslations } from "next-intl/server";
import { addItemAction, receiveStockAction } from "@/actions/garage";
import { ActionForm } from "@/components/garage/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/config";
import { formatBirr } from "@/lib/money";
import { listParts } from "@/server/dal/garage";
import { getSession } from "@/server/dal/session";
import { z } from "zod";

const searchSchema = z.string().trim().max(60);

export default async function PartsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = searchSchema.safeParse(q ?? "").data ?? "";
  const locale = (await getLocale()) as Locale;
  const [t, parts, { profile }] = await Promise.all([getTranslations("partsPage"), listParts(locale, query), getSession()]);
  const canManage = profile.role !== "staff";

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <form action="/parts" className="flex items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-2">
          <Label htmlFor="q">{t("search")}</Label>
          <Input id="q" name="q" defaultValue={query} placeholder={t("searchPlaceholder")} autoComplete="off" />
        </div>
        <Button type="submit" size="lg">{t("searchAction")}</Button>
      </form>

      {parts.length === 0 ? (
        <p className="text-muted-foreground">{query ? t("noMatch") : t("empty")}</p>
      ) : (
        <ul>
          {parts.map((p) => {
            const low = p.onHand <= p.reorderLevel;
            return (
              <li key={p.id} className="grid gap-1 border-b py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{p.name}</span>
                  <span className="num shrink-0">{formatBirr(p.price, locale)}</span>
                </div>
                <p className="num flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>{p.sku ?? "—"}</span>
                  <span className={low ? "font-semibold text-destructive" : ""}>
                    {t("onHand")}: {p.onHand} {p.unit}
                    {low ? ` · ${t("low")}` : ""}
                  </span>
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
