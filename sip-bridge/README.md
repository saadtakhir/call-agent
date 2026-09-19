# sip-bridge

Bridges a FreePBX SIP extension to the existing ai-call-agent AI logic. It
does for a real phone call what `components/AiCallWidget.jsx` does for a
browser tab: capture audio, detect turns, call the same
`/api/ai-call/*` HTTP endpoints the widget already calls, and play back the
response. **No AI logic lives here** — this is a thin telephony client only.

```
Caller's phone → FreePBX (call.e-baholash.uz) → Asterisk (this VPS,
registered as the given extension) → AudioSocket() → this Node service
→ HTTPS → the existing Vercel app (unchanged)
```

This folder is entirely independent of the Next.js app's own build/deploy —
it has its own `package.json` and is meant to be deployed separately, on a
VPS, not on Vercel (Vercel's serverless functions can't hold the persistent
SIP/RTP connection a phone extension requires).

## Requirements on the VPS

- Ubuntu 22.04 (or similar), 1 vCPU / 2GB RAM is enough for a handful of
  concurrent calls.
- Node.js 18+ (for built-in `fetch`/`FormData`/`Blob`).
- `ffmpeg` (`apt install ffmpeg`) — used to transcode ElevenLabs' MP3
  responses into the raw PCM AudioSocket needs.
- Asterisk with `chan_pjsip` and `app_audiosocket` (Ubuntu 22.04's `asterisk`
  apt package includes both).

## 1. Install

```sh
git clone <this repo> && cd ai-call-agent/sip-bridge
npm install
cp .env.example .env   # fill in APP_BASE_URL, SIP_BRIDGE_USERNAME/PASSWORD
```

`SIP_BRIDGE_USERNAME`/`PASSWORD` must be a login created on the app's own
**Foydalanuvchilar** page with **only** the "Suhbat" (`view_call`)
permission — never a real admin account, since this process's session
cookie only needs to call the call-widget endpoints.

## 2. Get the PBX SIP credentials into Asterisk's config

The extension number, SIP password, optional domain, and proxy server are
managed on the app's **AI qo'ng'iroq sozlamalari → SIP sozlamalari** panel
(needs the `manage_settings` permission), not in this folder's `.env`.

Generate a ready-to-paste `pjsip.conf` snippet from whatever is currently
saved there:

```sh
APP_BASE_URL=https://call.saad.uz \
ADMIN_USERNAME=<an account with manage_settings> \
ADMIN_PASSWORD=<its password> \
node scripts/print-pjsip-config.mjs
```

Paste the output into `/etc/asterisk/pjsip.conf`. Re-run this whenever the
extension/password/domain/proxy is changed in the panel.

## 3. Asterisk dialplan

In `/etc/asterisk/extensions.conf`, answer inbound calls on that extension
and hand them straight to AudioSocket on this service's local port
(`AUDIOSOCKET_PORT` in `.env`, default `8090`):

```ini
[from-pbx]
exten => <extension>,1,NoOp(AI call agent)
 same => n,Answer()
 same => n,AudioSocket(${UNIQUEID},127.0.0.1:8090)
 same => n,Hangup()
```

Reload both files:

```sh
asterisk -rx "pjsip reload"
asterisk -rx "dialplan reload"
asterisk -rx "pjsip show registrations"   # should show the extension as Registered
```

## 4. Run the bridge

```sh
npm start
```

For production, run it under systemd so it survives reboots/crashes —
`/etc/systemd/system/sip-bridge.service`:

```ini
[Unit]
Description=ai-call-agent SIP bridge
After=network.target asterisk.service

[Service]
Type=simple
WorkingDirectory=/opt/ai-call-agent/sip-bridge
EnvironmentFile=/opt/ai-call-agent/sip-bridge/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
User=sip-bridge

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now sip-bridge
sudo journalctl -u sip-bridge -f
```

## Verification

1. `asterisk -rx "pjsip show registrations"` — extension should show as
   registered.
2. Call the extension from a real phone: greeting should play, a spoken
   question should get transcribed and answered, staying silent should
   trigger the 4 escalating check-ins and eventual hangup.
3. `journalctl -u asterisk -f` and `journalctl -u sip-bridge -f` during a
   test call for errors on either side.
4. The call should show up on the app's **Faol suhbatlar** dashboard while
   active, and disappear right after hangup.

## Known limitation

If every concurrency slot is already taken (`MAX_CONCURRENT_CALLS`), the
caller currently just hears nothing before the line hangs up — there's no
generic "speak this text" endpoint to play a "hozircha band" apology
outside of an active session. A reasonable follow-up would be an Asterisk
dialplan fallback (e.g. `Congestion()`) when the bridge signals it's full,
or a small dedicated `/api/ai-call/busy-audio` endpoint.
