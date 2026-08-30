import {
  LoginFoundationError,
  createPasswordAuthRecord,
  createUser,
  createWorkspace,
  setUserPassword,
} from "./login-foundation.js";

export class RegisteredUserProvisioningError extends Error {
  constructor(message, { code = "registered_user_provisioning_failed", partial = false, details = null } = {}) {
    super(message);
    this.name = "RegisteredUserProvisioningError";
    this.code = code;
    this.partial = partial;
    this.details = details;
  }
}

function safeUserDetails(user) {
  return {
    userId: user.id,
    loginId: user.loginId,
    displayName: user.displayName,
  };
}

function partialFailure(stage, user) {
  throw new RegisteredUserProvisioningError(
    `Provisioning stopped after User creation during ${stage}; operator cleanup may be required.`,
    {
      code: "registered_user_provisioning_partial",
      partial: true,
      details: { ...safeUserDetails(user), stage },
    },
  );
}

export async function provisionRegisteredUser(
  env,
  { loginId, displayName, password, workspaceName },
  options = {},
) {
  // Reuse the login foundation's password validation before creating any record.
  // The generated record stays in memory only; persistence is handled solely by setUserPassword().
  await createPasswordAuthRecord(password, options);

  const user = await createUser(env, { loginId, displayName, active: true }, options);

  try {
    await setUserPassword(env, user.id, password, options);
  } catch (error) {
    if (error instanceof LoginFoundationError) throw error;
    partialFailure("password setup", user);
  }

  let workspace;
  try {
    workspace = await createWorkspace(
      env,
      { ownerUserId: user.id, name: workspaceName, active: true },
      options,
    );
  } catch {
    partialFailure("Workspace creation", user);
  }

  return Object.freeze({
    ...safeUserDetails(user),
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  });
}
