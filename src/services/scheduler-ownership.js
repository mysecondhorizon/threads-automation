export const SCHEDULER_MODE = "RUNTIME_ACTIVE";

export function isRuntimeSchedulerActive(mode = SCHEDULER_MODE) {
  return mode === "RUNTIME_ACTIVE";
}
