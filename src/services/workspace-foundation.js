import { BUILT_IN_THREADS_APP_ID } from "./apps.js";

// These constants provide a stable compatibility scope until workspace storage
// and user authentication are deliberately introduced in a later tranche.
export const DEFAULT_WORKSPACE_ID = "default-workspace";
export const DEFAULT_WORKSPACE_OWNER_USER_ID = "legacy-owner";
export const LEGACY_THREADS_AUTH_REF = "threads_auth";

const DEFAULT_WORKSPACE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const DEFAULT_WORKSPACE = Object.freeze({
  id: DEFAULT_WORKSPACE_ID,
  ownerUserId: DEFAULT_WORKSPACE_OWNER_USER_ID,
  name: "Default Workspace",
  active: true,
  createdAt: DEFAULT_WORKSPACE_TIMESTAMP,
  updatedAt: DEFAULT_WORKSPACE_TIMESTAMP,
});

export function getDefaultWorkspace() {
  return { ...DEFAULT_WORKSPACE };
}

/**
 * Derives the existing primary Threads app as the one legacy Connected Account.
 * It intentionally does not create a second registry or persist new storage.
 */
export function toLegacyConnectedAccount(app) {
  if (!app || app.id !== BUILT_IN_THREADS_APP_ID || app.type !== "THREADS") {
    return null;
  }

  return {
    id: app.id,
    workspaceId: DEFAULT_WORKSPACE_ID,
    platform: "THREADS",
    displayName: app.name,
    active: app.active !== false,
    createdAt: app.createdAt || DEFAULT_WORKSPACE_TIMESTAMP,
    updatedAt: app.updatedAt || app.createdAt || DEFAULT_WORKSPACE_TIMESTAMP,
  };
}

/**
 * Keeps the legacy credential key untouched while documenting its only current
 * logical connection mapping. Credential migration is intentionally deferred.
 */
export function getLegacyCredentialRef(connectedAccount) {
  if (
    connectedAccount?.workspaceId === DEFAULT_WORKSPACE_ID &&
    connectedAccount.id === BUILT_IN_THREADS_APP_ID &&
    connectedAccount.platform === "THREADS"
  ) {
    return LEGACY_THREADS_AUTH_REF;
  }
  return null;
}
