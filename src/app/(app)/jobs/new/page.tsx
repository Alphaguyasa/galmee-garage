import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { openJobAction } from "@/actions/garage";
import { ActionForm } from "@/components/garage/action-form";
import { SelectField } from "@/components/garage/fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listMechanics } from "@/server/dal/garage";
import { plateParam } from "@/server/validation";

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ plate?: string }> }) {
  const { plate } = await searchParams;
  const parsedPlate = plateParam.safeParse(plate ?? "");
  const [t, mechanics] = await Promise.all([getTranslations("newJob"), listMechanics()]);

  return (
    <div className="grid max-w-md gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ActionForm action={openJobAction} submitLabel={t("submit")}>
        <input type="hidden" name="clientRef" value={randomUUID()} />
        <div className="grid gap-2">
          <Label htmlFor="plate">{t("plate")}</Label>
          <Input id="plate" name="plate" required defaultValue={parsedPlate.success ? parsedPlate.data.toUpperCase() : ""} autoCapitalize="characters" autoComplete="off" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="complaint">{t("complaint")}</Label>
          <textarea id="complaint" name="complaint" required maxLength={1000} rows={3} className="w-full rounded-md border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
        </div>
        <p className="text-sm text-muted-foreground">{t("customerHint")}</p>
        <div className="grid gap-2">
          <Label htmlFor="customerName">{t("customerName")}</Label>
          <Input id="customerName" name="customerName" autoComplete="off" maxLength={120} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="customerPhone">{t("customerPhone")}</Label>
          <Input id="customerPhone" name="customerPhone" type="tel" inputMode="tel" autoComplete="off" maxLength={16} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="make">{t("make")}</Label>
            <Input id="make" name="make" autoComplete="off" maxLength={60} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="model">{t("model")}</Label>
            <Input id="model" name="model" autoComplete="off" maxLength={60} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="odometer">{t("odometer")}</Label>
          <Input id="odometer" name="odometer" inputMode="numeric" autoComplete="off" />
        </div>
        {mechanics.length > 0 ? (
          <SelectField
            name="mechanic"
            label={t("mechanic")}
            options={[{ value: "", label: t("noMechanic") }, ...mechanics.map((m) => ({ value: m.id, label: m.name }))]}
          />
        ) : (
          <>
            <input type="hidden" name="mechanic" value="" />
            <p className="text-sm text-muted-foreground">{t("noMechanics")}</p>
          </>
        )}
      </ActionForm>
    </div>
  );
}
