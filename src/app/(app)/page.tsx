import { getTranslations } from "next-intl/server";
import { getSession } from "@/server/dal/session";

export default async function HomePage() {
  const [{ profile }, t, tApp] = await Promise.all([getSession(), getTranslations("home"), getTranslations("app")]);
  return (
    <div className="grid gap-2">
      <h1 className="text-2xl font-bold">{t("welcome", { name: profile.fullName })}</h1>
      <p className="text-muted-foreground">{tApp("tagline")}</p>
    </div>
  );
}
