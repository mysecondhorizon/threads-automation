import { runScheduledAutoPost } from "./auto-post/scheduler.js";
import { SCHEDULER_MODE, isRuntimeSchedulerActive } from "./scheduler-ownership.js";

export async function handleLegacyScheduledExecution(env, controller, {
  mode = SCHEDULER_MODE,
  run = runScheduledAutoPost,
} = {}) {
  if (isRuntimeSchedulerActive(mode)) {
    console.info("Legacy scheduler event suppressed after runtime ownership cutover", {
      hasScheduledTime: Boolean(controller?.scheduledTime),
    });
    return { suppressed: true };
  }
  return run(env, { cron: controller?.cron, scheduledTime: controller?.scheduledTime });
}
