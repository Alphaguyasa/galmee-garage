"use client";

import { useRouter } from "next/navigation";
import { JoinForm } from "@/components/galmee/join-form";
import { joinWithCode } from "@/actions/staff";

/** /join and /join/<code>: redeem a staff invite, then open the business's home screen. */
export function JoinScreen({ lang, code, signedIn }: { lang: string; code?: string; signedIn: boolean }) {
  const router = useRouter();
  return (
    <JoinForm
      lang={lang}
      initialCode={code}
      signedIn={signedIn}
      loginHref="/login"
      signupHref="/signup"
      onRedeem={async (c, name) => {
        const status = await joinWithCode(c, name);
        if (status === "ok") {
          router.replace("/");
          router.refresh();
        }
        return status;
      }}
    />
  );
}
