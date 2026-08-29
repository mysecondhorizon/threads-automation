import {
  getJson,
} from "./kv.js";

import {
  BUILT_IN_THREADS_APP_ID,
} from "./apps.js";

import {
  DEFAULT_WORKSPACE_ID,
  LEGACY_THREADS_AUTH_REF,
  getLegacyCredentialRef,
  toLegacyConnectedAccount,
} from "./workspace-foundation.js";

export const CONNECTED_ACCOUNTS_KEY =
  "operator_connected_accounts:v1";

const STORE_VERSION = 1;
const LEGACY_ACCOUNT_MARKER =
  Symbol("legacy-connected-account");
const AUTH_REF_PATTERN =
  /^connected_account_auth:[A-Za-z0-9_-]+$/u;

export class ConnectedAccountError extends Error {
  constructor(
    message,
    code = "connected_account_failed"
  ) {
    super(message);
    this.name = "ConnectedAccountError";
    this.code = code;
  }
}

function fail(
  message,
  code
) {
  throw new ConnectedAccountError(
    message,
    code
  );
}

function normalizeWorkspaceId(
  workspaceId
) {
  if (
    workspaceId === undefined ||
    workspaceId === null
  ) {
    return DEFAULT_WORKSPACE_ID;
  }

  if (
    typeof workspaceId !== "string" ||
    !workspaceId.trim()
  ) {
    fail(
      "Connected Account workspace id is invalid",
      "connected_account_workspace_invalid"
    );
  }

  return workspaceId.trim();
}

function normalizeAccountId(
  connectedAccountId,
  workspaceId
) {
  if (
    connectedAccountId === undefined ||
    connectedAccountId === null
  ) {
    if (workspaceId === DEFAULT_WORKSPACE_ID) {
      return BUILT_IN_THREADS_APP_ID;
    }

    fail(
      "Connected Account was not found",
      "connected_account_not_found"
    );
  }

  if (
    typeof connectedAccountId !== "string" ||
    !connectedAccountId.trim()
  ) {
    fail(
      "Connected Account id is invalid",
      "connected_account_not_found"
    );
  }

  return connectedAccountId.trim();
}

function isIsoTimestamp(
  value
) {
  return typeof value === "string" &&
    Number.isFinite(
      Date.parse(value)
    );
}

function normalizeStoredAccount(
  value
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const id =
    typeof value.id === "string"
      ? value.id.trim()
      : "";
  const workspaceId =
    typeof value.workspaceId === "string"
      ? value.workspaceId.trim()
      : "";
  const platform =
    typeof value.platform === "string"
      ? value.platform.trim()
      : "";
  const displayName =
    typeof value.displayName === "string"
      ? value.displayName.trim()
      : "";
  const authRef =
    value.authRef === undefined ||
    value.authRef === null
      ? null
      : typeof value.authRef === "string"
        ? value.authRef.trim()
        : "";

  if (
    !id ||
    !workspaceId ||
    !platform ||
    !displayName ||
    displayName.length > 120 ||
    typeof value.active !== "boolean" ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    (authRef !== null && !AUTH_REF_PATTERN.test(authRef))
  ) {
    return null;
  }

  return {
    id,
    workspaceId,
    platform,
    displayName,
    active: value.active,
    authRef,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

async function readConnectedAccounts(
  env
) {
  const stored =
    await getJson(
      env,
      CONNECTED_ACCOUNTS_KEY
    );

  if (
    !stored ||
    typeof stored !== "object" ||
    Array.isArray(stored) ||
    stored.version !== STORE_VERSION ||
    !Array.isArray(stored.records)
  ) {
    return [];
  }

  return stored.records
    .map(normalizeStoredAccount)
    .filter(Boolean);
}

function createLegacyConnectedAccount() {
  const account =
    toLegacyConnectedAccount({
      id: BUILT_IN_THREADS_APP_ID,
      name: "Second Horizon Threads",
      type: "THREADS",
      active: true,
    });

  if (!account) {
    fail(
      "Legacy Connected Account was not found",
      "connected_account_not_found"
    );
  }

  Object.defineProperty(
    account,
    LEGACY_ACCOUNT_MARKER,
    {
      value: true,
    }
  );

  return account;
}

function isSyntheticLegacyAccount(
  account
) {
  return Boolean(
    account?.[LEGACY_ACCOUNT_MARKER] === true &&
    getLegacyCredentialRef(account) ===
      LEGACY_THREADS_AUTH_REF
  );
}

export async function resolveConnectedAccount(
  env,
  {
    workspaceId,
    connectedAccountId,
  } = {}
) {
  const resolvedWorkspaceId =
    normalizeWorkspaceId(
      workspaceId
    );
  const resolvedAccountId =
    normalizeAccountId(
      connectedAccountId,
      resolvedWorkspaceId
    );

  if (
    resolvedWorkspaceId === DEFAULT_WORKSPACE_ID &&
    resolvedAccountId === BUILT_IN_THREADS_APP_ID
  ) {
    return createLegacyConnectedAccount();
  }

  if (resolvedAccountId === BUILT_IN_THREADS_APP_ID) {
    fail(
      "Connected Account was not found",
      "connected_account_not_found"
    );
  }

  const matches =
    (await readConnectedAccounts(env)).filter(
      (account) =>
        account.id === resolvedAccountId
    );

  if (!matches.length) {
    fail(
      "Connected Account was not found",
      "connected_account_not_found"
    );
  }

  if (matches.length !== 1) {
    fail(
      "Connected Account is ambiguous",
      "connected_account_ambiguous"
    );
  }

  const account = matches[0];

  if (account.workspaceId !== resolvedWorkspaceId) {
    fail(
      "Connected Account was not found",
      "connected_account_not_found"
    );
  }

  if (!account.active) {
    fail(
      "Connected Account is inactive",
      "connected_account_inactive"
    );
  }

  return account;
}

export function resolveCredentialRef(
  account
) {
  if (isSyntheticLegacyAccount(account)) {
    return LEGACY_THREADS_AUTH_REF;
  }

  const authRef =
    typeof account?.authRef === "string"
      ? account.authRef.trim()
      : "";

  if (!AUTH_REF_PATTERN.test(authRef)) {
    fail(
      "Connected Account credential is not configured",
      "connected_account_auth_unconfigured"
    );
  }

  return authRef;
}

export async function getThreadsCredentialForAccount(
  env,
  options = {}
) {
  const account =
    await resolveConnectedAccount(
      env,
      options
    );

  if (account.platform !== "THREADS") {
    fail(
      "Connected Account platform is not supported",
      "connected_account_platform_unsupported"
    );
  }

  const credentialRef =
    resolveCredentialRef(account);
  const credential =
    await getJson(env, credentialRef);

  if (
    !credential ||
    typeof credential !== "object" ||
    Array.isArray(credential) ||
    typeof credential.access_token !== "string" ||
    !credential.access_token.trim()
  ) {
    fail(
      "Connected Account credential is missing",
      "connected_account_credential_missing"
    );
  }

  return {
    account,
    credential,
  };
}
