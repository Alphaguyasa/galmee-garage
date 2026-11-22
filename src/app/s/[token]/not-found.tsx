import { getTranslations } from "next-intl/server";
import { GalmeeMark } from "@/components/galmee/brand";

/** Unknown, switched-off or expired link. */
export default async function StatusLinkNotFound() {
  const t = await getTranslations("statusPage");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <GalmeeMark className="size-12" />
      <h1 className="text-xl font-semibold">{t("goneTitle")}</h1>
      <p className="text-muted-foreground">{t("goneBody")}</p>
    </main>
  );
}
