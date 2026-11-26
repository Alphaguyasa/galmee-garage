import { normalizeCode } from "@/lib/galmee/staff";
import { JoinPage } from "../join-page";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Only the code's own characters reach the form; anything else in the link is dropped.
  return <JoinPage code={normalizeCode(decodeURIComponent(code)).replace(/[^A-Z0-9]/g, "").slice(0, 6)} />;
}
