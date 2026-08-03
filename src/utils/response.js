export function ok(data = {}, status = 200) {
  return Response.json(
    {
      ok: true,
      ...data,
    },
    { status }
  );
}

export function fail(
  error,
  status = 400,
  extra = {}
) {
  return Response.json(
    {
      ok: false,
      error,
      ...extra,
    },
    { status }
  );
}

export function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export function redirect(url, status = 302) {
  return Response.redirect(url, status);
}
