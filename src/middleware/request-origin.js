// Browser forms and fetch mutations must carry their exact same-origin Origin.
// No Referer fallback: absent/null origins are not sufficient mutation proof.
export function requireSameOriginPost(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
  }
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      (site !== null && site !== "same-origin")) {
    return new Response("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
  }
  return null;
}
