/**
 * Who may use the app. Replaces the old Firestore rule "any signed-in user
 * (including anonymous)", which let anyone read everything.
 *
 * ALLOWED_EMAILS is a comma-separated list of Google account emails and/or
 * whole domains written as "@example.com". Example:
 *   ALLOWED_EMAILS="alex@gmail.com, @mavis.com"
 *
 * Anonymous sessions and unverified emails are always refused. If the list is
 * empty, nobody gets in (fail closed).
 */
export interface IdTokenClaims {
  email?: unknown;
  email_verified?: unknown;
  firebase?: { sign_in_provider?: unknown } | unknown;
}

export type AccessResult = { ok: true; email: string } | { ok: false; reason: string };

export function parseAllowlist(raw: string | undefined) {
  const emails = new Set<string>();
  const domains: string[] = [];
  for (const entry of (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (entry.startsWith("@")) domains.push(entry);
    else emails.add(entry);
  }
  return { emails, domains };
}

export function checkAccess(claims: IdTokenClaims, allowlistRaw: string | undefined): AccessResult {
  const provider = (claims.firebase as { sign_in_provider?: unknown } | undefined)?.sign_in_provider;
  if (provider === "anonymous") return { ok: false, reason: "Guest sessions are not allowed. Sign in with Google." };
  if (typeof claims.email !== "string" || !claims.email) return { ok: false, reason: "Your account has no email address." };
  if (claims.email_verified !== true) return { ok: false, reason: "Your account's email address is not verified." };

  const email = claims.email.toLowerCase();
  const { emails, domains } = parseAllowlist(allowlistRaw);
  if (emails.size === 0 && domains.length === 0) return { ok: false, reason: "No accounts have been approved yet (ALLOWED_EMAILS is empty)." };
  if (emails.has(email) || domains.some((d) => email.endsWith(d))) return { ok: true, email };
  return { ok: false, reason: `${claims.email} is not approved for this app.` };
}
