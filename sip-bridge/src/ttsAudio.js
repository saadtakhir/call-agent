import { spawn } from "node:child_process";

/** Every /api/ai-call/* audio response (greeting/turn/filler/silence-check)
 * is an MP3 (ElevenLabs' own output format), but AudioSocket needs raw
 * 16-bit PCM — shells out to `ffmpeg` (install via `apt install ffmpeg` on
 * the VPS) rather than pulling in a pure-JS MP3 decoder dependency, since
 * ffmpeg is the far more battle-tested option for this. */
export function decodeMp3ToPcm(mp3Buffer, sampleRate) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ar", String(sampleRate), "-ac", "1", "pipe:1"]);

    const chunks = [];
    let stderr = "";
    ff.stdout.on("data", (chunk) => chunks.push(chunk));
    ff.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with ${code}: ${stderr}`));
      resolve(Buffer.concat(chunks));
    });

    ff.stdin.write(mp3Buffer);
    ff.stdin.end();
  });
}
