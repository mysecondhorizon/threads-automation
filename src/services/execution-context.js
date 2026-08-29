import {
  resolveConnectedAccount,
} from "./connected-accounts.js";

function sanitizeConnectedAccount(account) {
  return Object.freeze({
    id: account.id,
    workspaceId: account.workspaceId,
    platform: account.platform,
    displayName: account.displayName,
    active: account.active,
  });
}

/**
 * Resolves the trusted identity scope for future execution paths. Credential
 * resolution remains deliberately separate so creating a context is read-only.
 */
export async function resolveExecutionContext(
  env,
  {
    workspaceId,
    connectedAccountId,
  } = {}
) {
  const account = await resolveConnectedAccount(env, {
    workspaceId,
    connectedAccountId,
  });

  return Object.freeze({
    workspaceId: account.workspaceId,
    connectedAccountId: account.id,
    connectedAccount: sanitizeConnectedAccount(account),
  });
}
