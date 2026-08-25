import { runScheduledAutoPost } from "./auto-post/scheduler.js";

const OPERATION_BY_TYPE = {
  GENERAL_AUTO: "auto_general",
  PRODUCT_REVIEW: "product_review",
};

export function getRuntimeScheduleOperation(type) {
  return OPERATION_BY_TYPE[type] || null;
}

export async function runRuntimeSchedule({ env, schedule, scheduledFor }) {
  const operation = getRuntimeScheduleOperation(schedule?.type);
  if (!operation) throw new Error("Unsupported runtime schedule type");

  return runScheduledAutoPost(env, {
    operation,
    scheduledTime: new Date(scheduledFor),
  });
}
