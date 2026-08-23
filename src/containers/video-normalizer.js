import {
  Container,
} from "@cloudflare/containers";

const ALLOWED_ROTATIONS = new Map([
  [90, "transpose=clock"],
  [180, "hflip,vflip"],
  [270, "transpose=cclock"],
]);
const MAX_PROBE_OUTPUT_BYTES = 4096;
const MAX_DIAGNOSTIC_TAIL_BYTES = 4096;

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

async function readDiagnosticTail(stream) {
  if (!stream) return "";
  const reader = stream.getReader();
  let tail = new Uint8Array();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      const combined = new Uint8Array(tail.byteLength + chunk.byteLength);
      combined.set(tail);
      combined.set(chunk, tail.byteLength);
      tail = combined.slice(-MAX_DIAGNOSTIC_TAIL_BYTES);
    }
  } catch {
    return "[stderr unavailable]";
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(tail);
}

async function readFileSize(container, path) {
  const process = await container.exec(["stat", "-c", "%s", path], {
    stderr: "ignore",
  });
  const [output, exitCode] = await Promise.all([
    readSmallText(process.stdout),
    process.exitCode,
  ]);
  const size = Number(output.trim());
  return exitCode === 0 && Number.isSafeInteger(size) && size >= 0 ? size : null;
}

const MP4_FORMAT_IDENTIFIERS = new Set(["mov", "mp4", "m4a", "3gp", "3g2", "mj2"]);

function probeValidation(probeText) {
  const lines = probeText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const fieldsFor = (line) => line
    .split(",")
    .map((field) => field.trim().toLowerCase().replace(/^"|"$/gu, ""));
  const streamFields = lines
    .filter((line) => !line.startsWith('"'))
    .map(fieldsFor);
  const hasVideoH264 = streamFields.some(
    (fields) => fields.includes("h264") && fields.includes("video")
  );
  const audioFields = streamFields.filter((fields) => fields.includes("audio"));
  const audioIsValid = audioFields.every((fields) => fields.includes("aac"));
  const hasMp4Format = lines
    .some((line) => fieldsFor(line).some((field) => MP4_FORMAT_IDENTIFIERS.has(field)));
  return { hasVideoH264, audioIsValid, hasMp4Format };
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
    console.log(
      `[video-normalize] start rotation=${String(rotationDegrees)} ` +
      `inputStream=${Boolean(inputStream)}`
    );
    if (!filter) throw new Error("Video rotation is invalid");
    if (!inputStream || typeof inputStream.getReader !== "function") {
      throw new Error("Video normalization input stream is required");
    }
    if (!this.ctx.container.running) await this.start();

    const inputPath = temporaryPath("video-normalizer-input");
    const outputPath = temporaryPath("video-normalizer-output");
    console.log("[video-normalize] input temp file created");
    try {
      const writeInput = await this.ctx.container.exec(["tee", inputPath], {
        stdin: inputStream,
        stdout: "ignore",
        stderr: "ignore",
      });
      if (await writeInput.exitCode) throw new Error("Video normalization input write failed");
      const inputSize = await readFileSize(this.ctx.container, inputPath);
      console.log(`[video-normalize] input temp size=${inputSize === null ? "unknown" : inputSize}`);

      console.log(
        `[video-normalize] ffmpeg start filter=${filter} ` +
        "legacy_rotate_metadata=0 autorotate=disabled"
      );
      const normalize = await this.ctx.container.exec([
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-noautorotate",
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
        "-metadata:s:v:0",
        "rotate=0",
        "-movflags",
        "+faststart",
        outputPath,
      ], {
        stdout: "ignore",
        stderr: "pipe",
      });
      const [ffmpegStderr, ffmpegExitCode] = await Promise.all([
        readDiagnosticTail(normalize.stderr),
        normalize.exitCode,
      ]);
      const outputSize = await readFileSize(this.ctx.container, outputPath);
      console.log(
        `[video-normalize] ffmpeg exit=${ffmpegExitCode} ` +
        `outputExists=${outputSize !== null} ` +
        `outputSize=${outputSize === null ? "unknown" : outputSize} ` +
        `stderrTail=${JSON.stringify(ffmpegStderr)}`
      );
      if (ffmpegExitCode) throw new Error("Video orientation normalization failed");

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
      const { hasVideoH264, audioIsValid, hasMp4Format } = probeValidation(probeText);
      if (probeExitCode || !hasVideoH264 || !audioIsValid || !hasMp4Format) {
        console.error(
          `[video-normalize] output validation failed exit=${probeExitCode} ` +
          `hasVideoH264=${hasVideoH264} audioIsValid=${audioIsValid} ` +
          `hasMp4Format=${hasMp4Format} probeTail=${JSON.stringify(probeText.slice(-512))}`
        );
        throw new Error("Normalized video output validation failed");
      }

      const output = await this.ctx.container.exec(["cat", outputPath], {
        stderr: "ignore",
      });
      if (!output.stdout) throw new Error("Normalized video output is unavailable");
      console.log("[video-normalize] output stream returning");
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
