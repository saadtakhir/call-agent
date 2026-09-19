/** Encodes raw 16-bit PCM samples (as already come off Asterisk's
 * AudioSocket — no float-to-int conversion needed, unlike
 * components/AiCallWidget.jsx's browser-side encodeWav, which starts from
 * Web Audio Float32 samples) into a standalone mono WAV file OpenAI's
 * transcription endpoint can read directly. */
export function encodeWavFromInt16(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate (16-bit mono)
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(samples.length * 2, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    buffer.writeInt16LE(samples[i], offset);
  }
  return buffer;
}
