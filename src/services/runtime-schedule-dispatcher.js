import { runScheduledAutoPost } from "./auto-post/scheduler.js";
import { resolveExecutionContext } from "./execution-context.js";
import { getThreadsCredentialForAccount } from "./connected-accounts.js";

const OPERATION_BY_TYPE = {
  GENERAL_AUTO: "auto_general",
  PRODUCT_REVIEW: "product_review",
};

export function getRuntimeScheduleOperation(type) {
  return OPERATION_BY_TYPE[type] || null;
}

export async function runRuntimeSchedule({
  env,
  schedule,
  scheduledFor,
  run = runScheduledAutoPost,
  resolveContext = resolveExecutionContext,
  resolveCredential = getThreadsCredentialForAccount,
}) {
  const operation = getRuntimeScheduleOperation(schedule?.type);
  if (!operation) throw new Error("Unsupported runtime schedule type");

  const workspaceId = typeof schedule?.workspaceId === "string" && schedule.workspaceId.trim()
    ? schedule.workspaceId.trim()
    : null;
  const connectedAccountId = typeof schedule?.connectedAccountId === "string" && schedule.connectedAccountId.trim()
    ? schedule.connectedAccountId.trim()
    : null;
  // A non-default runtime schedule cannot be dispatched without its exact
  // server-owned account identity. This resolution performs ownership and
  // active-account checks before any business or Threads work starts.
  const executionContext = workspaceId
    ? await resolveContext(env, { workspaceId, connectedAccountId })
    : null;
  if (executionContext) {
    // Validate the exact account-bound credential before dispatch. The
    // credential value stays inside the resolver and is never put on context,
    // schedule state, results, or logs.
    await resolveCredential(env, {
      workspaceId: executionContext.workspaceId,
      connectedAccountId: executionContext.connectedAccountId,
    });
  }

  return run(env, {
    operation,
    scheduledTime: new Date(scheduledFor),
    source: "runtime_scheduler",
    scheduleId: schedule.id,
    workspaceId,
    executionContext,
  });
}
