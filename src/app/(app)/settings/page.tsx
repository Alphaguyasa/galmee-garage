import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { addMechanicAction, setMechanicActiveAction } from "@/actions/garage";
import { ActionForm } from "@/components/garage/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listMechanics } from "@/server/dal/garage";
import { getSession } from "@/server/dal/session";

export default async function SettingsPage() {
  const { profile } = await getSession();
  if (profile.role === "staff") redirect("/");
  const [t, mechanics] = await Promise.all([getTranslations("settings"), listMechanics(false)]);

  return (
    <div className="grid max-w-md gap-5">
      <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">{t("mechanics")}</h2>
        {mechanics.length === 0 ? (
          <p className="text-muted-foreground">{t("noMechanics")}</p>
        ) : (
          <ul>
            {mechanics.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 border-b py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="num text-sm text-muted-foreground">{m.active ? m.phone : t("inactive")}</span>
                </span>
                <ActionForm action={setMechanicActiveAction} submitLabel={m.active ? t("deactivate") : t("activate")} variant="outline" className="inline">
                  <input type="hidden" name="mechanic" value={m.id} />
                  <input type="hidden" name="active" value={m.active ? "false" : "true"} />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addMechanicAction} submitLabel={t("add")} doneLabel={t("added")}>
          <div className="grid gap-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" required maxLength={120} autoComplete="off" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="off" maxLength={16} />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
