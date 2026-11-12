import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ReceiptPreview, type ReceiptLine } from "@/components/galmee/receipt-preview";
import { PrintButton } from "@/components/print-button";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/money";
import { getJob, getJobLines } from "@/server/dal/garage";
import { getSession } from "@/server/dal/session";
import { uuidParam } from "@/server/validation";

/**
 * The job invoice handed over with the keys: an 80 mm slip with every part and
 * labour line, the totals and what is still owed. Open it again from the job
 * card to reprint; it always shows the job as it stands now.
 */
export default async function JobInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const locale = (await getLocale()) as Locale;
  const [job, lines, { tenant }, t] = await Promise.all([getJob(id), getJobLines(id, locale), getSession(), getTranslations("job")]);
  if (!job) notFound();

  const birr = (n: number) => formatBirr(n, locale);
  const vehicle = [job.vehicle.plate, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ");
  const header: ReceiptLine[] = [
    { name: `${t("invoiceVehicle")}: ${vehicle}`, qty: "", amount: "" },
    { name: `${t("customer")}: ${job.customer.name}`, qty: "", amount: "" },
    ...(job.odometerKm ? [{ name: t("invoiceOdometer", { km: job.odometerKm.toLocaleString(locale) }), qty: "", amount: "" }] : []),
  ];
  const parts: ReceiptLine[] = lines.parts.map((p) => ({ name: p.name, qty: `×${p.qty}`, amount: birr(p.lineTotal) }));
  const labour: ReceiptLine[] = lines.labour.map((l) => ({
    name: l.mechanicName ? `${l.description} (${l.mechanicName})` : l.description,
    qty: "",
    amount: birr(l.amount),
  }));
  const section = (label: string, rows: ReceiptLine[]): ReceiptLine[] => (rows.length ? [{ name: label, qty: "", amount: "" }, ...rows] : []);
  const date = formatEthiopianDate((job.deliveredAt ?? job.readyAt ?? job.openedAt).slice(0, 10), locale);

  return (
    <div className="grid max-w-md gap-4">
      <ReceiptPreview
        className="receipt-80 mx-0 w-[80mm] print:border-0 print:p-0"
        tenantName={tenant.name}
        title={t("invoiceTitle", { no: job.jobNo })}
        dateLabel={date}
        lines={[...header, ...section(t("partsTitle"), parts), ...section(t("labourTitle"), labour)]}
        totals={[
          { label: t("partsTotal"), amount: birr(job.partsTotal) },
          { label: t("labourTotal"), amount: birr(job.labourTotal) },
          { label: t("total"), amount: birr(job.total) },
          { label: t("paid"), amount: birr(job.paidTotal) },
          { label: t("balance"), amount: birr(job.balance) },
        ]}
        footer={job.workDone ? `${t("workDone")}: ${job.workDone}` : t("invoiceFooter")}
      />
      <PrintButton label={t("printInvoice")} />
      <Link href={`/jobs/${job.id}`} className="flex h-12 items-center justify-center text-sm text-primary print:hidden">
        {t("backToJob")}
      </Link>
    </div>
  );
}
