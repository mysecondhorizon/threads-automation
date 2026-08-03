export function getCookieValue(request, name) {
  const cookieHeader = request.headers.get("cookie") || "";

  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(
    cookie.slice(name.length + 1)
  );
}

export function createCookie(
  name,
  value,
  {
    maxAge,
    path = "/",
    httpOnly = true,
    secure = true,
    sameSite = "Strict",
  } = {}
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
  ];

  if (Number.isInteger(maxAge)) {
    parts.push(`Max-Age=${maxAge}`);
  }

  if (httpOnly) {
    parts.push("HttpOnly");
  }

  if (secure) {
    parts.push("Secure");
  }

  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }

  return parts.join("; ");
}
