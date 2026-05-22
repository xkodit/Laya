function parseEmailList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

const betaAllowlist = parseEmailList(process.env.BETA_ALLOWLIST_EMAILS);
const adminEmails = parseEmailList(process.env.ADMIN_EMAILS);

export function isAllowlisted(email: string): boolean {
  return betaAllowlist.has(email.trim().toLowerCase());
}

export function isAdminEmail(email: string): boolean {
  return adminEmails.has(email.trim().toLowerCase());
}
