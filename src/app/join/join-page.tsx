import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { JoinScreen } from "@/components/staff/join-screen";
import { getUserId, hasProfile } from "@/server/dal/session";

/** Shared by /join and /join/<code>. Someone already in a business goes home: one business per account. */
export async function JoinPage({ code }: { code?: string }) {
  const userId = await getUserId();
  if (userId && (await hasProfile(userId))) redirect("/");
  const locale = await getLocale();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-4 py-6">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <JoinScreen lang={locale} code={code} signedIn={Boolean(userId)} />
    </main>
  );
}
