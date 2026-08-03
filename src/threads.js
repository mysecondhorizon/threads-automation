const GRAPH_BASE = "https://graph.threads.net/v1.0";

export async function getThreadsProfile(accessToken) {
  const url = new URL(`${GRAPH_BASE}/me`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.id) {
    throw new ThreadsApiError("get_profile", data);
  }

  return data;
}

export async function publishTextPost(accessToken, userId, text) {
  const createBody = new URLSearchParams({
    media_type: "TEXT",
    text,
    access_token: accessToken,
  });

  const createResponse = await fetch(
    `${GRAPH_BASE}/${userId}/threads`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: createBody,
    }
  );

  const createData = await createResponse.json();

  if (!createResponse.ok || !createData.id) {
    throw new ThreadsApiError("create_container", createData);
  }

  const publishBody = new URLSearchParams({
    creation_id: createData.id,
    access_token: accessToken,
  });

  const publishResponse = await fetch(
    `${GRAPH_BASE}/${userId}/threads_publish`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: publishBody,
    }
  );

  const publishData = await publishResponse.json();

  if (!publishResponse.ok || !publishData.id) {
    throw new ThreadsApiError("publish", publishData);
  }

  return {
    containerId: createData.id,
    postId: publishData.id,
  };
}

export class ThreadsApiError extends Error {
  constructor(step, details) {
    super(`Threads API failed at ${step}`);
    this.name = "ThreadsApiError";
    this.step = step;
    this.details = details;
  }
}
