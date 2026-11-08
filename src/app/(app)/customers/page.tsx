import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/config";
import { formatBirr } from "@/lib/money";
import { listCustomers } from "@/server/dal/garage";

const searchSchema = z.string().trim().max(60);

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = searchSchema.safeParse(q ?? "").data ?? "";
  const locale = (await getLocale()) as Locale;
  const [t, customers] = await Promise.all([getTranslations("customers"), listCustomers(query)]);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <form action="/customers" className="flex items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-2">
          <Label htmlFor="q">{t("search")}</Label>
          <Input id="q" name="q" defaultValue={query} autoComplete="off" />
        </div>
        <Button type="submit" size="lg">{t("searchAction")}</Button>
      </form>
      {customers.length === 0 ? (
        <p className="text-muted-foreground">{query ? t("noMatch") : t("empty")}</p>
      ) : (
        <ul>
          {customers.map((c) => (
            <li key={c.id}>
              <Link href={`/customers/${c.id}`} className="flex items-baseline justify-between gap-3 border-b py-3 hover:bg-accent/40">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="num text-sm text-muted-foreground">{c.phone}</span>
                </span>
                {c.balance > 0 ? <span className="num shrink-0 font-semibold text-destructive">{t("owes", { amount: formatBirr(c.balance, locale) })}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
