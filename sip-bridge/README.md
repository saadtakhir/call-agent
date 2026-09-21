# sip-bridge

Auto-deploy: pushes to this folder redeploy automatically via GitHub
Actions (see `.github/workflows/deploy-sip-bridge.yml`).

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

- Ubuntu 22.04 (or similar), 1 vCPU / 2GB RAM is comfortable for a handful
  of concurrent calls. A 512MB droplet can work for light/test traffic
  (Asterisk + Node + ffmpeg together are lean, but leave little headroom) —
  add a 1GB swap file if you see OOM kills in `dmesg`:
  `fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`
  (add it to `/etc/fstab` to survive reboots).
- Node.js 18+ (for built-in `fetch`/`FormData`/`Blob`).
- `ffmpeg` (`apt install ffmpeg`) — used to transcode ElevenLabs' MP3
  responses into the raw PCM AudioSocket needs.
- Asterisk with `chan_pjsip` and `app_audiosocket` (Ubuntu 22.04's `asterisk`
  apt package includes both).
- `git` and Node's `npm`.

## 1. One-time setup

A dedicated non-root user owns both the checkout and the running service —
this is also the user the auto-deploy workflow (see below) SSHes in as:

```sh
adduser --disabled-password --gecos "" deploy
mkdir -p /opt/ai-call-agent && chown deploy:deploy /opt/ai-call-agent
su - deploy
git clone https://github.com/<you>/call-agent.git /opt/ai-call-agent
cd /opt/ai-call-agent/sip-bridge
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

The bridge reads Asterisk's own registration status (via the local
`asterisk -rx` CLI — see `src/asteriskStatus.js`) to show it on the app's
SIP sozlamalari panel, which needs `deploy` in the `asterisk` group
(Asterisk's control socket isn't world-readable by default):

```sh
sudo usermod -aG asterisk deploy
```

(Takes effect on this user's next login/process start — restart the
service after this if it's already running.)

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
User=deploy

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now sip-bridge
sudo journalctl -u sip-bridge -f
```

## 5. Auto-deploy from GitHub

The Next.js app redeploys on Vercel automatically on every push (Vercel's
own GitHub integration, unrelated to this). sip-bridge lives on this VPS
instead, which Vercel can't reach — `.github/workflows/deploy-sip-bridge.yml`
is the equivalent for it: on every push to `main` touching `sip-bridge/**`,
it SSHes into this VPS and runs `sip-bridge/deploy.sh` (`git reset --hard
origin/main` + `npm install` + restart the service).

One-time setup:

1. Generate a dedicated deploy keypair **on your own machine** (not the
   VPS): `ssh-keygen -t ed25519 -f sip_bridge_deploy_key -N ""`.
2. Append `sip_bridge_deploy_key.pub` to `/home/deploy/.ssh/authorized_keys`
   on the VPS.
3. Let `deploy` restart the service without a password, but ONLY that one
   command — `sudo visudo -f /etc/sudoers.d/sip-bridge-deploy` and add:
   `deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart sip-bridge`
4. In the GitHub repo → Settings → Secrets and variables → Actions, add:
   - `SIP_BRIDGE_HOST` — the VPS's IP (e.g. `67.207.94.199`)
   - `SIP_BRIDGE_USER` — `deploy`
   - `SIP_BRIDGE_SSH_KEY` — the contents of the PRIVATE key
     (`sip_bridge_deploy_key`, not the `.pub` one)

From then on, pushing a `sip-bridge/` change to `main` redeploys it within
about a minute — check progress under the repo's **Actions** tab.

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
