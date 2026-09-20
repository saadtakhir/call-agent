import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Shells out to the local `asterisk` CLI (running on the same VPS) to
 * read the outbound registration status set up per README.md's
 * pjsip.conf — the only way to surface "is Asterisk actually registered
 * with the PBX" in the app's own SIP sozlamalari panel, since that state
 * lives entirely on this VPS. Requires this process's user to be in the
 * "asterisk" group (see README.md) — Asterisk's control socket is only
 * readable by root/that group by default. */
export async function getPbxRegistrationStatus() {
  try {
    const { stdout } = await execFileAsync("asterisk", ["-rx", "pjsip show registrations"]);
    return parseRegistrationOutput(stdout);
  } catch (err) {
    return { registered: false, detail: `Xatolik: ${err.message}` };
  }
}

/** Re-parses pjsip.conf and re-initializes every PJSIP object from
 * scratch, including outbound registrations — the only reliable way found
 * to resume one after Asterisk gives up on it ("Maximum retries reached
 * ... stopping registration attempt"), since a stopped registration does
 * NOT resume on its own even once the PBX becomes reachable again.
 * Triggered by the "Qayta ulanish" button (see heartbeat.js). */
export async function reloadPjsip() {
  await execFileAsync("asterisk", ["-rx", "pjsip reload"]);
}

export function parseRegistrationOutput(output) {
  const dataLine = output
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.includes("/") && !line.startsWith("<") && !line.startsWith("="));

  if (!dataLine) return { registered: false, detail: "Sozlanmagan" };

  const match = dataLine.match(/\b(Registered|Unregistered|Rejected|Auth Rejected|Not Reachable|Removed)\b/i);
  const detail = match ? match[0] : "Noma'lum";
  return { registered: /^registered$/i.test(detail), detail };
}
