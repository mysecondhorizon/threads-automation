import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { provisionRegisteredUser } from "./src/services/registered-user-provisioning.js";

function fail(message) {
  throw new Error(message);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) fail(`${name} is required`);
  return process.argv[index + 1];
}

function runWrangler(args) {
  const isWindows = process.platform === "win32";
  const executable = isWindows ? process.env.ComSpec || "cmd.exe" : "npx";
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", "npx.cmd", "wrangler", ...args]
    : ["wrangler", ...args];
  const result = spawnSync(executable, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(String(result.stderr || result.stdout || "Wrangler failed").trim());
  }
  return String(result.stdout || "");
}

export function isMissingRemoteKvKeyError(error, namespaceId, key) {
  const message = String(error?.message || "");
  const valueEndpoint = `/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(key)}`;
  return /\b404\b/u.test(message) && message.includes(valueEndpoint);
}

export function createRemoteKv(namespaceId, { run = runWrangler } = {}) {
  return {
    async get(key, type) {
      let raw;
      try {
        raw = run(["kv", "key", "get", key, "--namespace-id", namespaceId, "--remote"]);
      } catch (error) {
        if (isMissingRemoteKvKeyError(error, namespaceId, key)) return null;
        throw error;
      }
      if (!raw.trim()) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      run(["kv", "key", "put", key, value, "--namespace-id", namespaceId, "--remote"]);
    },
  };
}

async function readPassword() {
  if (!process.stdin.isTTY) fail("Password must be entered from an interactive terminal");
  process.stdout.write("Password: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return await new Promise((resolve, reject) => {
    let value = "";
    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Provisioning cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    }
    function cleanup() {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.stdin.on("data", onData);
  });
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    fail("Refusing to provision without --confirm");
  }

  const namespaceId = process.env.THREADS_KV_NAMESPACE_ID;
  if (!namespaceId) fail("THREADS_KV_NAMESPACE_ID is required");

  const password = await readPassword();
  const result = await provisionRegisteredUser(
    { THREADS_KV: createRemoteKv(namespaceId) },
    {
      loginId: readOption("--login-id"),
      password,
      workspaceName: readOption("--workspace-name"),
    },
  );

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Provisioning failed: ${error.message}\n`);
    if (error?.partial && error.details?.userId) {
      process.stderr.write(`Partial provisioning may require operator cleanup for User ${error.details.userId}.\n`);
    }
    process.exitCode = 1;
  });
}
