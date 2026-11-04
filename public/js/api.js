export class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, {
  method = "GET",
  body,
  timeout = 35000,
  signal
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  const form = body instanceof FormData;

  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: body && !form
        ? { "Content-Type": "application/json" }
        : {},
      body: body
        ? form ? body : JSON.stringify(body)
        : undefined
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new APIError(
        payload.error || "The request could not be completed.",
        response.status
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof APIError) throw error;

    if (error.name === "AbortError") {
      throw new APIError(
        "The request timed out. Check your connection and try again.",
        408
      );
    }

    throw new APIError(
      "Unable to connect. Check your internet connection and try again.",
      0
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
