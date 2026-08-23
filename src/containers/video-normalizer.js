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
const MAX_DIAGNOSTIC_MESSAGE_CHARS = 256;

function diagnosticMessage(error) {
  return String(error?.message || error || "unknown")
    .replace(/\s+/gu, " ")
    .slice(0, MAX_DIAGNOSTIC_MESSAGE_CHARS);
}

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
  if (!stream) {
    return { text: "", closedNormally: false, readError: "stderr stream unavailable" };
  }
  const reader = stream.getReader();
  let tail = new Uint8Array();
  let readError = null;
  let closedNormally = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        closedNormally = true;
        break;
      }
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      const combined = new Uint8Array(tail.byteLength + chunk.byteLength);
      combined.set(tail);
      combined.set(chunk, tail.byteLength);
      tail = combined.slice(-MAX_DIAGNOSTIC_TAIL_BYTES);
    }
  } catch (error) {
    readError = diagnosticMessage(error);
  } finally {
    try {
      reader.releaseLock();
    } catch (error) {
      readError ||= diagnosticMessage(error);
    }
  }
  return {
    text: new TextDecoder().decode(tail),
    closedNormally,
    readError,
  };
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
  sleepAfter = "5m";
  enableInternet = false;
  activeNormalizations = 0;

  onActivityExpired() {
    const active = this.activeNormalizations > 0;
    console.log(`[video-normalize] activity expiry active=${active}`);
    if (active) {
      console.log("[video-normalize] activity expiry shutdown deferred");
      return;
    }
    console.log("[video-normalize] activity expiry stopping container");
    return this.stop();
  }

  onStop({ exitCode, reason }) {
    const safeReason = String(reason ?? "unknown").replace(/\s+/gu, " ").slice(0, 128);
    console.log(`[video-normalize] container stop exitCode=${String(exitCode)} reason=${safeReason}`);
  }

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
    this.activeNormalizations += 1;
    console.log(`[video-normalize] normalization active count=${this.activeNormalizations}`);
    let inputPath = null;
    let outputPath = null;
    try {
      if (!this.ctx.container.running) await this.start();

      inputPath = temporaryPath("video-normalizer-input");
      outputPath = temporaryPath("video-normalizer-output");
      console.log("[video-normalize] input temp file created");
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
      const ffmpegStartedAt = Date.now();
      const ffmpegStartedAtIso = new Date(ffmpegStartedAt).toISOString();
      let normalize;
      let ffmpegStderrResult = {
        text: "",
        closedNormally: false,
        readError: "not started",
      };
      let ffmpegExitCode;
      try {
        normalize = await this.ctx.container.exec([
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
        console.log(
          `[video-normalize] ffmpeg exec pid=${String(normalize.pid ?? "unknown")} ` +
          `stdoutPresent=${Boolean(normalize.stdout)} stderrPresent=${Boolean(normalize.stderr)} ` +
          `startedAt=${ffmpegStartedAtIso}`
        );
        [ffmpegStderrResult, ffmpegExitCode] = await Promise.all([
          readDiagnosticTail(normalize.stderr),
          normalize.exitCode,
        ]);
      } catch (error) {
        console.error(
          `[video-normalize] ffmpeg await failed ` +
          `pid=${String(normalize?.pid ?? "unknown")} ` +
          `durationMs=${Date.now() - ffmpegStartedAt} ` +
          `message=${diagnosticMessage(error)}`
        );
        throw error;
      }
      const ffmpegDurationMs = Date.now() - ffmpegStartedAt;
      const outputSize = await readFileSize(this.ctx.container, outputPath);
      if (ffmpegStderrResult.readError) {
        console.error(
          `[video-normalize] ffmpeg stderr read error ` +
          `pid=${String(normalize?.pid ?? "unknown")} ` +
          `message=${ffmpegStderrResult.readError}`
        );
      }
      console.log(
        `[video-normalize] ffmpeg exit pid=${String(normalize?.pid ?? "unknown")} ` +
        `exit=${ffmpegExitCode} durationMs=${ffmpegDurationMs} ` +
        `stderrClosed=${ffmpegStderrResult.closedNormally} ` +
        `outputExists=${outputSize !== null} ` +
        `outputSize=${outputSize === null ? "unknown" : outputSize} ` +
        `stderrTail=${JSON.stringify(ffmpegStderrResult.text)}`
      );
      if (ffmpegExitCode) throw new Error("Video orientation normalization failed");
      if (!Number.isSafeInteger(outputSize) || outputSize <= 0) {
        throw new Error("Normalized video output size is invalid");
      }

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
      console.log(`[video-normalize] output stream returning size=${outputSize}`);
      this.ctx.waitUntil(
        output.exitCode
          .catch(() => {})
          .then(() => this.removeTemporaryFiles([inputPath, outputPath]).catch(() => {}))
      );
      return {
        body: output.stdout,
        size: outputSize,
      };
    } catch (error) {
      await this.removeTemporaryFiles([inputPath, outputPath].filter(Boolean)).catch(() => {});
      throw error;
    } finally {
      this.activeNormalizations = Math.max(0, this.activeNormalizations - 1);
      console.log(`[video-normalize] normalization active count=${this.activeNormalizations}`);
    }
  }
}
