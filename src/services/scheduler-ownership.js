export const SCHEDULER_MODE = "LEGACY_ACTIVE_RUNTIME_PREPARING";

export function isRuntimeSchedulerActive(mode = SCHEDULER_MODE) {
  return mode === "RUNTIME_ACTIVE";
}
