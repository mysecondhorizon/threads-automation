import assert from "node:assert/strict";
import {
  WorkspaceScheduleError,
  createWorkspaceRuntimeSchedule,
  getWorkspaceRuntimeSchedule,
  listWorkspaceRuntimeSchedules,
  updateWorkspaceRuntimeSchedule,
} from "./runtime-schedules.js";

function createEnv() {
  const values = new Map();
  return {
    values,
    env: {
      THREADS_KV: {
        async get(key, type) {
          const value = values.get(key) ?? null;
          return type === "json" && value !== null ? JSON.parse(value) : value;
        },
        async put(key, value) {
          values.set(key, value);
        },
      },
    },
  };
}

const { env, values } = createEnv();
const input = {
  name: "Workspace schedule",
  type: "GENERAL_AUTO",
  cadence: { kind: "daily", time: "08:10" },
  enabled: true,
};
const scheduleA = await createWorkspaceRuntimeSchedule(env, input, {
  workspaceId: "workspace-a",
  connectedAccountId: "threads-a",
  now: () => "2026-09-06T00:00:00.000Z",
});
const scheduleB = await createWorkspaceRuntimeSchedule(env, {
  ...input,
  name: "Foreign schedule",
}, {
  workspaceId: "workspace-b",
  connectedAccountId: "threads-b",
  now: () => "2026-09-06T01:00:00.000Z",
});

const listedA = await listWorkspaceRuntimeSchedules(env, "workspace-a");
assert.equal(listedA.runtimeExecutionEnabled, false);
assert.deepEqual(listedA.schedules.map((schedule) => schedule.id), [scheduleA.id]);
assert.equal("workspaceId" in listedA.schedules[0], false);
assert.equal("connectedAccountId" in listedA.schedules[0], false);
assert.equal((await getWorkspaceRuntimeSchedule(env, scheduleB.id, "workspace-a")), null);
assert.equal((await updateWorkspaceRuntimeSchedule(env, scheduleB.id, { enabled: false }, {
  workspaceId: "workspace-a",
})), null);

const updatedA = await updateWorkspaceRuntimeSchedule(env, scheduleA.id, {
  enabled: false,
  cadence: { time: "09:20" },
}, {
  workspaceId: "workspace-a",
  now: () => "2026-09-06T02:00:00.000Z",
});
assert.equal(updatedA.enabled, false);
assert.equal(updatedA.cadence.time, "09:20");
const stored = JSON.parse(values.get("workspace_runtime_schedule_configurations:v1"));
assert.equal(stored.schedules.find((schedule) => schedule.id === scheduleB.id).workspaceId, "workspace-b");
assert.equal(stored.schedules.find((schedule) => schedule.id === scheduleB.id).connectedAccountId, "threads-b");

await assert.rejects(
  () => createWorkspaceRuntimeSchedule(env, { ...input, workspaceId: "workspace-b" }, {
    workspaceId: "workspace-a",
    connectedAccountId: "threads-a",
  }),
  (error) => error instanceof WorkspaceScheduleError && error.code === "workspace_schedule_invalid",
);

console.log("workspace runtime schedule fixture passed");
