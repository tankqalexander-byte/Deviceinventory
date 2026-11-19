import test from "node:test";
import assert from "node:assert/strict";
import { checkAccess } from "../server/access.ts";

const google = (email: string, verified = true) => ({ email, email_verified: verified, firebase: { sign_in_provider: "google.com" } });

test("approved emails and domains get in, case-insensitively", () => {
  const list = "Alex@Gmail.com, @mavis.com";
  assert.equal(checkAccess(google("alex@gmail.com"), list).ok, true);
  assert.equal(checkAccess(google("ALEX@GMAIL.COM"), list).ok, true);
  assert.equal(checkAccess(google("someone@mavis.com"), list).ok, true);
});

test("everyone else is refused", () => {
  const list = "alex@gmail.com, @mavis.com";
  const refused: [string, any, string | undefined][] = [
    ["anonymous guest", { firebase: { sign_in_provider: "anonymous" } }, list],
    ["other gmail", google("eve@gmail.com"), list],
    ["unverified email", google("alex@gmail.com", false), list],
    ["look-alike domain", google("eve@evilmavis.com"), list],
    ["domain as subdomain trick", google("eve@mavis.com.evil.io"), list],
    ["no email claim", { email_verified: true, firebase: { sign_in_provider: "phone" } }, list],
    ["empty allowlist", google("alex@gmail.com"), ""],
    ["unset allowlist", google("alex@gmail.com"), undefined],
  ];
  for (const [label, claims, l] of refused) assert.equal(checkAccess(claims, l).ok, false, label);
});
