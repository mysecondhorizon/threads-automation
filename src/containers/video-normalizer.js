import {
  Container,
} from "@cloudflare/containers";

const ALLOWED_ROTATIONS = new Map([
  [90, "transpose=clock"],
  [180, "hflip,vflip"],
  [270, "transpose=cclock"],
]);
const MAX_PROBE_OUTPUT_BYTES = 4096;

function temporaryPath(prefix) {
  const id = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `/tmp/${prefix}-${id}.mp4`;
}

async function readSmallText(stream) {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROBE_OUTPUT_BYTES) throw new Error("Normalized video validation output is invalid");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export class VideoNormalizerContainer extends Container {
  sleepAfter = "1m";
  enableInternet = false;

  async removeTemporaryFiles(paths) {
    if (!paths.length) return;
    const process = await this.ctx.container.exec(["rm", "-f", ...paths], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await process.exitCode;
  }

  async normalizeVideo(inputStream, rotationDegrees) {
    const filter = ALLOWED_ROTATIONS.get(rotationDegrees);
    if (!filter) throw new Error("Video rotation is invalid");
    if (!inputStream || typeof inputStream.getReader !== "function") {
      throw new Error("Video normalization input stream is required");
    }
    if (!this.ctx.container.running) await this.start();

    const inputPath = temporaryPath("video-normalizer-input");
    const outputPath = temporaryPath("video-normalizer-output");
    try {
      const writeInput = await this.ctx.container.exec(["tee", inputPath], {
        stdin: inputStream,
        stdout: "ignore",
        stderr: "ignore",
      });
      if (await writeInput.exitCode) throw new Error("Video normalization input write failed");

      const normalize = await this.ctx.container.exec([
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-noautorotate",
        "-display_rotation:v:0",
        "0",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        filter,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outputPath,
      ], {
        stdout: "ignore",
        stderr: "ignore",
      });
      if (await normalize.exitCode) throw new Error("Video orientation normalization failed");

      const probe = await this.ctx.container.exec([
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=format_name:stream=codec_type,codec_name",
        "-of",
        "csv=p=0",
        outputPath,
      ], { stderr: "ignore" });
      const [probeText, probeExitCode] = await Promise.all([
        readSmallText(probe.stdout),
        probe.exitCode,
      ]);
      if (probeExitCode || !probeText.includes("video,h264") ||
        (probeText.includes("audio,") && !probeText.includes("audio,aac")) ||
        !probeText.includes("mov,mp4")) {
        throw new Error("Normalized video output validation failed");
      }

      const output = await this.ctx.container.exec(["cat", outputPath], {
        stderr: "ignore",
      });
      if (!output.stdout) throw new Error("Normalized video output is unavailable");
      this.ctx.waitUntil(
        output.exitCode
          .catch(() => {})
          .then(() => this.removeTemporaryFiles([inputPath, outputPath]).catch(() => {}))
      );
      return output.stdout;
    } catch (error) {
      await this.removeTemporaryFiles([inputPath, outputPath]).catch(() => {});
      throw error;
    }
  }
}
