export function createRuntimeUrl(
  path: string,
  runtimeBaseUrl: string,
  params?: Record<string, string | undefined>
): string {
  const trimmedBaseUrl = runtimeBaseUrl.trim();
  const url =
    trimmedBaseUrl.length > 0
      ? new URL(path, trimmedBaseUrl)
      : new URL(path, "http://localhost");

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value && value.trim() !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  if (trimmedBaseUrl.length > 0) {
    return url.toString();
  }

  const search = url.searchParams.toString();
  return search.length > 0 ? `${url.pathname}?${search}` : url.pathname;
}

export function createRuntimeWebsocketUrl(
  path: string,
  runtimeBaseUrl: string
): string {
  const trimmedBaseUrl = runtimeBaseUrl.trim();

  if (trimmedBaseUrl.length === 0) {
    return "";
  }

  const url = new URL(path, trimmedBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
