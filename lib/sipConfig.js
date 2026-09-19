import { getSetting, setSetting } from "./appSettings.js";

export { SIP_PROXY_OPTIONS } from "./sipProxyOptions.js";

const KEYS = {
  extension: "sipExtension",
  password: "sipPassword",
  domain: "sipDomain",
  proxy: "sipProxyServer",
};

/** The PBX SIP credentials the sip-bridge/ VPS service registers with —
 * live-editable via /ai-qongiroq-sozlamalar (see SipConfigPanel) instead
 * of a static .env value, the same reasoning as every other setting in
 * this file's family (STT provider, system prompt, ...). The bridge
 * fetches this same endpoint at startup to generate its Asterisk config —
 * see sip-bridge/README.md. */
export async function getSipConfig() {
  const [extension, password, domain, proxy] = await Promise.all([
    getSetting(KEYS.extension, ""),
    getSetting(KEYS.password, ""),
    getSetting(KEYS.domain, ""),
    getSetting(KEYS.proxy, "none"),
  ]);
  return { extension, password, domain, proxy };
}

export async function setSipConfig({ extension, password, domain, proxy }) {
  if (extension !== undefined) await setSetting(KEYS.extension, String(extension).trim());
  // Only overwritten when a new non-empty value is actually given — the
  // settings panel never round-trips a value it didn't change back in.
  if (password) await setSetting(KEYS.password, String(password));
  if (domain !== undefined) await setSetting(KEYS.domain, String(domain).trim());
  if (proxy !== undefined) await setSetting(KEYS.proxy, String(proxy));
  return getSipConfig();
}
