import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { JobRow } from "@/components/garage/job-row";
import { Plate } from "@/components/garage/plate";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/money";
import { getCustomerDetail } from "@/server/dal/garage";
import { uuidParam } from "@/server/validation";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const locale = (await getLocale()) as Locale;
  const [detail, t] = await Promise.all([getCustomerDetail(id), getTranslations("customers")]);
  if (!detail) notFound();
  const { customer, vehicles, unpaidJobs, ledger } = detail;
  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1 className="text-2xl font-bold">{customer.name}</h1>
        {customer.phone ? (
          <a href={`tel:${customer.phone}`} className="num justify-self-start underline underline-offset-4">
            {customer.phone}
          </a>
        ) : null}
        <p className={`num text-lg font-bold ${customer.balance > 0 ? "text-destructive" : ""}`}>
          {customer.balance > 0 ? t("owes", { amount: formatBirr(customer.balance, locale) }) : t("clear")}
        </p>
      </header>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">{t("vehicles")}</h2>
        {vehicles.length === 0 ? (
          <p className="text-muted-foreground">{t("noVehicles")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Link href={`/vehicles/${v.id}`}>
                  <Plate plate={v.plate} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {unpaidJobs.length > 0 ? (
        <section className="grid gap-1">
          <h2 className="text-lg font-semibold">{t("unpaidJobs")}</h2>
          <ul>
            {unpaidJobs.map((job) => (
              <JobRow key={job.id} job={job} showOwes />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">{t("statement")}</h2>
        {ledger.length === 0 ? (
          <p className="text-muted-foreground">{t("noStatement")}</p>
        ) : (
          <ul>
            {ledger.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 border-b py-2">
                <span>
                  <span className="block font-medium">{l.type === "debt" ? t("debt") : t("repayment")}</span>
                  <span className="num text-sm text-muted-foreground">
                    {formatEthiopianDate(l.createdAt.slice(0, 10), locale)}
                    {l.dueDate ? ` · ${t("due", { date: formatEthiopianDate(l.dueDate, locale) })}` : ""}
                  </span>
                </span>
                <span className={`num ${l.type === "debt" ? "font-semibold text-destructive" : ""}`}>
                  {l.type === "debt" ? "+" : "−"}
                  {formatBirr(l.amount, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
