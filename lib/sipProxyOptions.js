// Split out from lib/sipConfig.js so client components (SipConfigPanel) can
// import just this list without pulling in getSipConfig/setSipConfig's
// pg/Prisma dependency chain into the browser bundle.
export const SIP_PROXY_OPTIONS = [{ value: "none", label: "Proksisiz (to'g'ridan-to'g'ri ulanish)" }];
