import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  INVITE_CODE,
  canManageMember,
  canRevoke,
  hoursLeft,
  normalizeCode,
  openInvites,
  redeemStatus,
  staffErrorKey,
  staffPermissions,
  staffStrings,
  type StaffInvite,
  type StaffMember,
} from "@/lib/galmee/staff";
import { InviteSheet, invitePayload } from "./invite-sheet";
import { JoinForm } from "./join-form";
import { StaffList } from "./staff-list";

const NOW = Date.parse("2026-11-23T08:00:00Z");
const members: StaffMember[] = [
  { user_id: "s1", full_name: "Abebe", phone: "0911000000", role: "staff", active: true },
  { user_id: "o1", full_name: "Owner", phone: null, role: "owner", active: true },
  { user_id: "m1", full_name: "Chaltu", phone: "0922000000", role: "manager", active: true },
  { user_id: "x1", full_name: "Former", phone: null, role: "staff", active: false },
];
const invite = (id: string, role: StaffInvite["role"], hours: number, used = false): StaffInvite => ({
  id,
  code: `ABC${id.padStart(3, "2")}`.slice(0, 6),
  role,
  display_name: null,
  phone: null,
  expires_at: new Date(NOW + hours * 3_600_000).toISOString(),
  used_at: used ? new Date(NOW).toISOString() : null,
});

const list = (myRole: string, myUserId: string, lang = "en") =>
  renderToStaticMarkup(
    createElement(StaffList, {
      lang,
      members,
      myRole,
      myUserId,
      onInvite: () => {},
      onSetRole: () => {},
      onSetActive: () => {},
    }),
  );

describe("staff rules", () => {
  it("mirror the server: owner invites manager/staff and manages; manager invites staff only; staff nothing", () => {
    expect(staffPermissions("owner")).toEqual({ canInvite: true, inviteRoles: ["manager", "staff"], canManage: true });
    expect(staffPermissions("manager")).toEqual({ canInvite: true, inviteRoles: ["staff"], canManage: false });
    expect(staffPermissions("staff")).toEqual({ canInvite: false, inviteRoles: [], canManage: false });
    expect(staffPermissions(null).canInvite).toBe(false);
    expect(canManageMember("owner", "o1", members[0])).toBe(true);
    expect(canManageMember("owner", "o1", members[1])).toBe(false);
    expect(canManageMember("manager", "m1", members[0])).toBe(false);
    expect(canRevoke("manager", { role: "staff" })).toBe(true);
    expect(canRevoke("manager", { role: "manager" })).toBe(false);
    expect(canRevoke("owner", { role: "manager" })).toBe(true);
  });
  it("maps server errors to plain words in every language", () => {
    expect(staffErrorKey('{"message":"last_owner"}')).toBe("last_owner");
    expect(staffErrorKey("self_change")).toBe("self_change");
    expect(staffErrorKey("not_a_member")).toBe("forbidden");
    expect(staffErrorKey("too_many_invites")).toBe("too_many_invites");
    expect(staffErrorKey("boom")).toBe("generic");
    for (const lang of ["en", "am", "om"]) expect(staffStrings(lang).errors.last_owner.length).toBeGreaterThan(10);
    expect(staffStrings("xx").title).toBe("Staff");
  });
  it("normalises codes and keeps only open invites, soonest expiry first", () => {
    expect(normalizeCode(" abc-d2f ")).toBe("ABCD2F");
    expect(INVITE_CODE.test("ABCD2F")).toBe(true);
    expect(INVITE_CODE.test("ABCD0F")).toBe(false);
    const open = openInvites([invite("3", "staff", 40), invite("4", "staff", -1), invite("5", "staff", 5, true), invite("6", "manager", 2)], NOW);
    expect(open.map((i) => i.id)).toEqual(["6", "3"]);
    expect(hoursLeft(new Date(NOW + 47.2 * 3_600_000).toISOString(), NOW)).toBe(48);
    expect(hoursLeft(new Date(NOW - 1).toISOString(), NOW)).toBe(0);
  });
});

describe("StaffList", () => {
  it("gives the owner role menus and deactivate on every row but their own", () => {
    const html = list("owner", "o1");
    expect(html).toContain('data-action="invite"');
    expect(html.match(/data-action="role"/g)).toHaveLength(2);
    expect(html.match(/data-action="deactivate"/g)).toHaveLength(2);
    expect(html.match(/data-action="reactivate"/g)).toHaveLength(1);
    expect(html).toContain("Owner<span");
    expect(html).toContain("(you)");
  });
  it("hides the role menu and deactivate from a manager, who can still invite", () => {
    const html = list("manager", "m1");
    expect(html).not.toContain('data-action="role"');
    expect(html).not.toContain('data-action="deactivate"');
    expect(html).not.toContain('data-action="reactivate"');
    expect(html).toContain('data-action="invite"');
    expect(html).toContain("Only the owner can change roles");
  });
  it("shows staff the list with no buttons, and lists deactivated members last", () => {
    const html = list("staff", "s1", "am");
    expect(html).not.toContain("data-action=");
    expect(html).toContain("ታግዷል");
    expect(html.indexOf("Former")).toBeGreaterThan(html.indexOf("Abebe"));
    expect(html.indexOf("Owner")).toBeLessThan(html.indexOf("Chaltu"));
  });
});

describe("InviteSheet", () => {
  const sheet = (myRole: string, created: { code: string; expires_at: string } | null, lang = "en") =>
    renderToStaticMarkup(
      createElement(InviteSheet, {
        open: true,
        onClose: () => {},
        lang,
        myRole,
        business: "Bole Pharmacy",
        origin: "https://galmee-pharmacy.vercel.app/",
        invites: [invite("3", "staff", 40), invite("6", "manager", 2)],
        created,
        now: NOW,
        onCreate: () => {},
        onRevoke: () => {},
        onReset: () => {},
      }),
    );

  it("renders the code large with a QR of the join link and a share button", () => {
    const html = sheet("owner", { code: "K7P2QX", expires_at: new Date(NOW + 48 * 3_600_000).toISOString() });
    expect(html).toContain('data-invite-code="K7P2QX"');
    expect(html).toContain(">K7P2QX</p>");
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="Invite code"/);
    expect(html).toContain('data-action="share"');
    expect(html).toContain("Valid for 48 h, once.");
  });
  it("builds the share payload with the deep link and code, in the user's language", () => {
    expect(invitePayload("en", "Bole Pharmacy", "https://galmee-pharmacy.vercel.app/", "K7P2QX")).toEqual({
      title: "Invite staff",
      text: "Join Bole Pharmacy on Galmee: https://galmee-pharmacy.vercel.app/join/K7P2QX (code K7P2QX)",
      url: "https://galmee-pharmacy.vercel.app/join/K7P2QX",
    });
    expect(invitePayload("am", "ቦሌ", "https://x.app", "K7P2QX").text).toBe("በገልሜ ቦሌን ይቀላቀሉ፦ https://x.app/join/K7P2QX (ኮድ K7P2QX)");
    expect(invitePayload("om", "Bole", "https://x.app", "K7P2QX").text).toContain("Galmee irratti Bole makamaa");
  });
  it("offers a manager only the staff role and only staff invites to revoke", () => {
    const html = sheet("manager", null);
    expect(html).toContain('<option value="staff"');
    expect(html).not.toContain('<option value="manager"');
    expect(html.match(/data-action="revoke"/g)).toHaveLength(1);
    const owner = sheet("owner", null);
    expect(owner).toContain('<option value="manager"');
    expect(owner.match(/data-action="revoke"/g)).toHaveLength(2);
  });
});

describe("JoinForm", () => {
  const join = (signedIn: boolean, initialCode?: string, lang = "en") =>
    renderToStaticMarkup(
      createElement(JoinForm, {
        lang,
        initialCode,
        signedIn,
        loginHref: "/login?next=%2Fjoin%2FK7P2QX",
        signupHref: "/signup?next=%2Fjoin%2FK7P2QX",
        onRedeem: async () => "ok" as const,
      }),
    );

  it("prefills the code from the link, cleaned up, and lets a signed-in user join", () => {
    const html = join(true, "k7p2-qx");
    expect(html).toContain('value="K7P2QX"');
    expect(html).toContain('id="join-name"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Join<\/button>/);
    expect(html).not.toContain("data-signed-out");
  });
  it("keeps Join disabled until the code is a valid one", () => {
    expect(join(true, "K7P")).toMatch(/<button[^>]*disabled=""[^>]*>Join/);
    expect(join(true, "K7P20X")).toContain('aria-invalid="true"');
  });
  it("sends a signed-out user to sign in or sign up and back to this code", () => {
    const html = join(false, "K7P2QX", "am");
    expect(html).toContain("data-signed-out");
    expect(html).toContain('href="/login?next=%2Fjoin%2FK7P2QX"');
    expect(html).toContain('href="/signup?next=%2Fjoin%2FK7P2QX"');
    expect(html).not.toContain('type="submit"');
    expect(html).toContain("ንግድ ይቀላቀሉ");
  });
  it("turns the server's answer into a status with words in every language", () => {
    expect(redeemStatus({ status: "ok" })).toBe("ok");
    expect(redeemStatus({ status: "used" })).toBe("used");
    expect(redeemStatus({ status: "rate_limited" })).toBe("rate_limited");
    expect(redeemStatus({ status: "weird" })).toBe("error");
    expect(redeemStatus(null, "already_member")).toBe("already_member");
    expect(redeemStatus(null, "not_signed_in")).toBe("not_signed_in");
    expect(redeemStatus(null, "network down")).toBe("error");
    for (const lang of ["en", "am", "om"]) {
      const r = staffStrings(lang).redeem;
      for (const k of ["bad_code", "expired", "used", "rate_limited", "already_member", "not_signed_in", "error"] as const) {
        expect(r[k].length).toBeGreaterThan(5);
      }
    }
  });
});
