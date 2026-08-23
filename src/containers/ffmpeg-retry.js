export const MAX_FFMPEG_ATTEMPTS = 2;

export function shouldRetryFfmpeg({ attempt, exitCode, stderrTail, stderrReadError }) {
  return attempt === 1 &&
    exitCode === 255 &&
    stderrTail === "" &&
    !stderrReadError;
}
