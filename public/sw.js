// Minimal service worker — its only job is to exist and answer fetch
// events, since that's what makes Chrome/Android treat this as an
// installable PWA at all. No offline caching: every page here (the call
// widget, settings, user management) needs a live network connection to
// mean anything, so pretending to work offline would just be misleading.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
