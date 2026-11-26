/**
 * Staff management: who may do what, the invite link and share text, the
 * server's error codes in plain words, and the am/om/en strings for the staff
 * list and the invite sheet. Mirrors the rules the server enforces
 * (staff_create_invite, staff_revoke_invite, staff_set_role, staff_set_active),
 * so the screens never offer a button the server would refuse.
 * Self-contained on purpose: other Galmee apps copy src/lib/galmee unchanged.
 */
export type StaffRole = "owner" | "manager" | "staff";
export type StaffLang = "en" | "am" | "om";

export type StaffMember = {
  user_id: string;
  full_name: string;
  phone: string | null;
  role: StaffRole;
  active: boolean;
};

export type StaffInvite = {
  id: string;
  code: string;
  role: Exclude<StaffRole, "owner">;
  display_name: string | null;
  phone: string | null;
  expires_at: string;
  used_at: string | null;
};

export type StaffPermissions = {
  /** May open the invite sheet. */
  canInvite: boolean;
  /** Roles this user may invite: owner -> manager, staff; manager -> staff. */
  inviteRoles: Exclude<StaffRole, "owner">[];
  /** May change roles and (de)activate members (owner only). */
  canManage: boolean;
};

export function staffPermissions(role: string | null | undefined): StaffPermissions {
  if (role === "owner") return { canInvite: true, inviteRoles: ["manager", "staff"], canManage: true };
  if (role === "manager") return { canInvite: true, inviteRoles: ["staff"], canManage: false };
  return { canInvite: false, inviteRoles: [], canManage: false };
}

/** A manager may revoke staff invites only; the owner any open invite. */
export function canRevoke(role: string | null | undefined, invite: Pick<StaffInvite, "role">): boolean {
  return role === "owner" || (role === "manager" && invite.role === "staff");
}

/**
 * Whether the role menu and deactivate button show on a member's row: owner
 * only, never on their own row (another owner must change them).
 */
export function canManageMember(myRole: string | null | undefined, myUserId: string, member: StaffMember): boolean {
  return myRole === "owner" && member.user_id !== myUserId;
}

/** Open = not used and not yet expired (a revoked invite expires at once). */
export function openInvites(invites: StaffInvite[], now: number): StaffInvite[] {
  return invites
    .filter((i) => !i.used_at && Date.parse(i.expires_at) > now)
    .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
}

/** Codes are 6 characters from A-Z (no I, O) and 2-9; typing is forgiving about case and spaces. */
export const INVITE_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

/** The deep link a new staffer opens: <origin>/join/<code>. */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/join/${encodeURIComponent(code)}`;
}

/** Hours left, rounded up, never below 0. */
export function hoursLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 3_600_000));
}

/** Server error message -> key of StaffStrings.errors. Anything unknown is "generic". */
export type StaffErrorKey = "last_owner" | "self_change" | "forbidden" | "not_found" | "too_many_invites" | "generic";
export function staffErrorKey(message: string | null | undefined): StaffErrorKey {
  const m = message ?? "";
  for (const k of ["last_owner", "self_change", "forbidden", "not_found", "too_many_invites"] as const) {
    if (m.includes(k)) return k;
  }
  if (m.includes("not_a_member")) return "forbidden";
  return "generic";
}

export type RedeemStatus = "ok" | "bad_code" | "expired" | "used" | "rate_limited" | "already_member" | "not_signed_in" | "error";

/** staff_redeem_invite returns a status for code problems and raises only for not signed in / already a member. */
export function redeemStatus(result: { status?: string | null } | null, errorMessage?: string | null): RedeemStatus {
  if (errorMessage) {
    if (errorMessage.includes("already_member")) return "already_member";
    if (errorMessage.includes("not_signed_in")) return "not_signed_in";
    return "error";
  }
  const st = result?.status;
  return st === "ok" || st === "bad_code" || st === "expired" || st === "used" || st === "rate_limited" ? st : "error";
}

export type StaffStrings = {
  title: string;
  roles: Record<StaffRole, string>;
  inactive: string;
  you: string;
  noPhone: string;
  invite: string;
  changeRole: string;
  deactivate: string;
  reactivate: string;
  deactivateConfirm: (name: string) => string;
  cancel: string;
  confirm: string;
  managerNote: string;
  inviteTitle: string;
  roleLabel: string;
  nameLabel: string;
  phoneLabel: string;
  optional: string;
  createCode: string;
  codeHeading: string;
  codeHelp: string;
  expiresIn: (h: number) => string;
  share: string;
  copied: string;
  shareText: (business: string, link: string, code: string) => string;
  openHeading: string;
  noOpen: string;
  revoke: string;
  newCode: string;
  close: string;
  errors: Record<StaffErrorKey, string>;
  joinTitle: string;
  joinHelp: string;
  codeLabel: string;
  yourName: string;
  join: string;
  joining: string;
  signInFirst: string;
  signIn: string;
  createAccount: string;
  redeem: Record<Exclude<RedeemStatus, "ok">, string>;
};

const STRINGS: Record<StaffLang, StaffStrings> = {
  en: {
    title: "Staff",
    roles: { owner: "Owner", manager: "Manager", staff: "Staff" },
    inactive: "Deactivated",
    you: "you",
    noPhone: "No phone",
    invite: "Invite staff",
    changeRole: "Role",
    deactivate: "Deactivate",
    reactivate: "Reactivate",
    deactivateConfirm: (n) => `Deactivate ${n}? They can no longer sign in to this business. Their past work stays.`,
    cancel: "Cancel",
    confirm: "Yes, deactivate",
    managerNote: "Only the owner can change roles or deactivate.",
    inviteTitle: "Invite staff",
    roleLabel: "Role",
    nameLabel: "Name",
    phoneLabel: "Phone",
    optional: "optional",
    createCode: "Get invite code",
    codeHeading: "Invite code",
    codeHelp: "They sign up in the app, then enter this code or scan it.",
    expiresIn: (h) => `Valid for ${h} h, once.`,
    share: "Share",
    copied: "Copied",
    shareText: (b, l, c) => `Join ${b} on Galmee: ${l} (code ${c})`,
    openHeading: "Open invites",
    noOpen: "No open invites.",
    revoke: "Revoke",
    newCode: "Another code",
    close: "Close",
    errors: {
      last_owner: "The business must keep at least one active owner.",
      self_change: "Another owner must change your own role or state.",
      forbidden: "You are not allowed to do this.",
      not_found: "This person is not in your business.",
      too_many_invites: "10 invites are already open. Revoke one first.",
      generic: "That did not work. Try again.",
    },
    joinTitle: "Join a business",
    joinHelp: "Enter the code the owner gave you.",
    codeLabel: "Invite code",
    yourName: "Your name",
    join: "Join",
    joining: "Joining…",
    signInFirst: "Sign in or create an account first. The code stays here.",
    signIn: "Sign in",
    createAccount: "Create account",
    redeem: {
      bad_code: "That code is not right. Check it with the owner.",
      expired: "This code has expired or was revoked. Ask for a new one.",
      used: "This code was already used. Ask for a new one.",
      rate_limited: "Too many tries. Wait an hour and try again.",
      already_member: "This account already belongs to a business.",
      not_signed_in: "Sign in first.",
      error: "That did not work. Try again.",
    },
  },
  am: {
    title: "ሠራተኞች",
    roles: { owner: "ባለቤት", manager: "ሥራ አስኪያጅ", staff: "ሠራተኛ" },
    inactive: "ታግዷል",
    you: "እርስዎ",
    noPhone: "ስልክ የለም",
    invite: "ሠራተኛ ጋብዝ",
    changeRole: "ሚና",
    deactivate: "አግድ",
    reactivate: "መልሰህ አንቃ",
    deactivateConfirm: (n) => `${n} ይታገዱ? ከዚህ በኋላ ወደዚህ ንግድ መግባት አይችሉም። የቀድሞ ሥራቸው ይቀመጣል።`,
    cancel: "ተው",
    confirm: "አዎ፣ አግድ",
    managerNote: "ሚና መቀየር ወይም ማገድ የሚችለው ባለቤቱ ብቻ ነው።",
    inviteTitle: "ሠራተኛ ጋብዝ",
    roleLabel: "ሚና",
    nameLabel: "ስም",
    phoneLabel: "ስልክ",
    optional: "አማራጭ",
    createCode: "የግብዣ ኮድ አውጣ",
    codeHeading: "የግብዣ ኮድ",
    codeHelp: "በመተግበሪያው ይመዝገቡ፣ ከዚያ ይህን ኮድ ያስገቡ ወይም ይቃኙ።",
    expiresIn: (h) => `ለ${h} ሰዓት፣ አንድ ጊዜ ብቻ ያገለግላል።`,
    share: "አጋራ",
    copied: "ተቀድቷል",
    shareText: (b, l, c) => `በገልሜ ${b}ን ይቀላቀሉ፦ ${l} (ኮድ ${c})`,
    openHeading: "ክፍት ግብዣዎች",
    noOpen: "ክፍት ግብዣ የለም።",
    revoke: "ሰርዝ",
    newCode: "ሌላ ኮድ",
    close: "ዝጋ",
    errors: {
      last_owner: "ንግዱ ቢያንስ አንድ ንቁ ባለቤት ሊኖረው ይገባል።",
      self_change: "የራስዎን ሚና ወይም ሁኔታ ሌላ ባለቤት ነው መቀየር ያለበት።",
      forbidden: "ይህን ለማድረግ ፈቃድ የለዎትም።",
      not_found: "ይህ ሰው በንግድዎ ውስጥ የለም።",
      too_many_invites: "10 ግብዣዎች ክፍት ናቸው። መጀመሪያ አንዱን ይሰርዙ።",
      generic: "አልተሳካም። እንደገና ይሞክሩ።",
    },
    joinTitle: "ንግድ ይቀላቀሉ",
    joinHelp: "ባለቤቱ የሰጠዎትን ኮድ ያስገቡ።",
    codeLabel: "የግብዣ ኮድ",
    yourName: "ስምዎ",
    join: "ተቀላቀል",
    joining: "በመቀላቀል ላይ…",
    signInFirst: "መጀመሪያ ይግቡ ወይም አካውንት ይክፈቱ። ኮዱ እዚህ ይቆያል።",
    signIn: "ግባ",
    createAccount: "አካውንት ክፈት",
    redeem: {
      bad_code: "ኮዱ ትክክል አይደለም። ከባለቤቱ ጋር ያረጋግጡ።",
      expired: "ኮዱ ጊዜው አልፏል ወይም ተሰርዟል። አዲስ ይጠይቁ።",
      used: "ኮዱ ቀድሞ ጥቅም ላይ ውሏል። አዲስ ይጠይቁ።",
      rate_limited: "ብዙ ሙከራ ተደርጓል። ከአንድ ሰዓት በኋላ እንደገና ይሞክሩ።",
      already_member: "ይህ አካውንት ቀድሞ የአንድ ንግድ አባል ነው።",
      not_signed_in: "መጀመሪያ ይግቡ።",
      error: "አልተሳካም። እንደገና ይሞክሩ።",
    },
  },
  om: {
    title: "Hojjettoota",
    roles: { owner: "Abbaa qabeenyaa", manager: "Hoggantaa", staff: "Hojjetaa" },
    inactive: "Dhaabbateera",
    you: "isin",
    noPhone: "Bilbila hin qabu",
    invite: "Hojjetaa affeeri",
    changeRole: "Gahee",
    deactivate: "Dhaabi",
    reactivate: "Deebisii banuu",
    deactivateConfirm: (n) => `${n} haa dhaabbatu? Kana booda daldala kana seenuu hin danda'u. Hojiin isaa duraa ni hafa.`,
    cancel: "Dhiisi",
    confirm: "Eeyyee, dhaabi",
    managerNote: "Gahee jijjiiruu ykn dhaabuu kan danda'u abbaa qabeenyaa qofa.",
    inviteTitle: "Hojjetaa affeeri",
    roleLabel: "Gahee",
    nameLabel: "Maqaa",
    phoneLabel: "Bilbila",
    optional: "filannoo",
    createCode: "Koodii affeerraa argadhu",
    codeHeading: "Koodii affeerraa",
    codeHelp: "Appii keessatti galmaa'anii, koodii kana galchu ykn sakatta'u.",
    expiresIn: (h) => `Sa'aatii ${h}f, al tokko qofa hojjeta.`,
    share: "Qoodi",
    copied: "Garagalfameera",
    shareText: (b, l, c) => `Galmee irratti ${b} makamaa: ${l} (koodii ${c})`,
    openHeading: "Affeerraawwan banaa",
    noOpen: "Affeerraan banaan hin jiru.",
    revoke: "Haqi",
    newCode: "Koodii biraa",
    close: "Cufi",
    errors: {
      last_owner: "Daldalli yoo xiqqaate abbaa qabeenyaa hojii irra jiru tokko qabaachuu qaba.",
      self_change: "Gahee ykn haala keessan abbaan qabeenyaa biraa jijjiiruu qaba.",
      forbidden: "Kana gochuuf hayyama hin qabdan.",
      not_found: "Namni kun daldala keessan keessa hin jiru.",
      too_many_invites: "Affeerraan 10 banaadha. Dura tokko haqaa.",
      generic: "Hin milkoofne. Irra deebi'aa yaalaa.",
    },
    joinTitle: "Daldala makamaa",
    joinHelp: "Koodii abbaan qabeenyaa isiniif kenne galchaa.",
    codeLabel: "Koodii affeerraa",
    yourName: "Maqaa keessan",
    join: "Makami",
    joining: "Makamaa jira…",
    signInFirst: "Dura seenaa ykn akkaawuntii uumaa. Koodiin asuma tura.",
    signIn: "Seeni",
    createAccount: "Akkaawuntii uumi",
    redeem: {
      bad_code: "Koodiin sun sirrii miti. Abbaa qabeenyaa waliin mirkaneeffadhaa.",
      expired: "Koodiin kun yeroon isaa darbeera ykn haqameera. Haaraa gaafadhaa.",
      used: "Koodiin kun duraan itti fayyadameera. Haaraa gaafadhaa.",
      rate_limited: "Yaaliin baay'ateera. Sa'aatii tokko booda irra deebi'aa yaalaa.",
      already_member: "Akkaawuntiin kun duraan daldala tokkoof galmaa'eera.",
      not_signed_in: "Dura seenaa.",
      error: "Hin milkoofne. Irra deebi'aa yaalaa.",
    },
  },
};

/** The string table for a language; anything unknown falls back to English. */
export function staffStrings(lang: string): StaffStrings {
  return STRINGS[lang as StaffLang] ?? STRINGS.en;
}
