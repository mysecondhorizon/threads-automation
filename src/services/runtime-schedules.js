const COORDINATOR_NAME = "application-runtime-schedule-coordinator";

export function getScheduleCoordinator(env) {
  if (!env?.SCHEDULE_COORDINATOR) {
    throw new Error("Runtime schedule coordinator is unavailable");
  }
  return env.SCHEDULE_COORDINATOR.getByName(COORDINATOR_NAME);
}

export async function listRuntimeSchedules(env) {
  return getScheduleCoordinator(env).listSchedules();
}

export async function getRuntimeScheduleCoordinatorStatus(env) {
  return getScheduleCoordinator(env).getCoordinatorStatus();
}

export async function reconcileRuntimeScheduleAlarm(env) {
  return getScheduleCoordinator(env).reconcileAlarm();
}

export async function createRuntimeSchedule(env, input) {
  return getScheduleCoordinator(env).createSchedule(input);
}

export async function updateRuntimeSchedule(env, scheduleId, input) {
  return getScheduleCoordinator(env).updateSchedule(scheduleId, input);
}
