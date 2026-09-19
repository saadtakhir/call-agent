import "dotenv/config";
import { AuthClient } from "../src/authClient.js";

// A one-off helper run BY HAND when setting up or updating Asterisk — not
// part of the always-on bridge process, and deliberately uses a separate
// admin login (needs the manage_settings permission) rather than the
// bridge's own service account (which only ever needs view_call). Usage:
//   ADMIN_USERNAME=... ADMIN_PASSWORD=... node scripts/print-pjsip-config.mjs
const { APP_BASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;

if (!APP_BASE_URL || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error("Usage: APP_BASE_URL=... ADMIN_USERNAME=... ADMIN_PASSWORD=... node scripts/print-pjsip-config.mjs");
  console.error("(ADMIN_USERNAME must have the manage_settings permission — see the /ai-qongiroq-sozlamalar 'SIP sozlamalari' panel.)");
  process.exit(1);
}

const authClient = new AuthClient({ baseUrl: APP_BASE_URL, username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
await authClient.login();

const res = await authClient.apiFetch("/api/ai-call/sip-config");
if (!res.ok) {
  const data = await res.json().catch(() => ({}));
  console.error(`Failed to fetch SIP config: ${data.error || res.status}`);
  process.exit(1);
}

const { extension, password, domain, proxy } = await res.json();
if (!extension || !password) {
  console.error("SIP sozlamalari to'liq emas — avval /ai-qongiroq-sozlamalar sahifasida to'ldiring.");
  process.exit(1);
}

const server = domain || new URL(APP_BASE_URL).hostname;

console.log(`
; --- Generated from ${APP_BASE_URL}'s SIP sozlamalari panel (proxy: ${proxy}) ---
; Paste into pjsip.conf on the sip-bridge VPS. Section names must each be
; unique in pjsip.conf, so registration/auth/aor/endpoint get distinct
; suffixes even though they all represent the same extension.

[${extension}-reg]
type=registration
outbound_auth=${extension}-auth
server_uri=sip:${server}
client_uri=sip:${extension}@${server}
retry_interval=60

[${extension}-auth]
type=auth
auth_type=userpass
password=${password}
username=${extension}

[${extension}-aor]
type=aor
contact=sip:${extension}@${server}

[${extension}]
type=endpoint
context=from-pbx
disallow=all
allow=ulaw
allow=alaw
outbound_auth=${extension}-auth
aors=${extension}-aor
`);
