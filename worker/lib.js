import { createClient } from "@supabase/supabase-js";
import { imageSize } from "image-size";

export const BUCKET = "store-images";

export const RESERVED = new Set([
  "www", "api", "admin", "app", "auth", "mail", "email",
  "support", "help", "static", "assets", "cdn",
  "dashboard", "account", "billing", "status",
  "dev", "test", "staging", "localhost"
]);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function assert(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export function admin(env) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

export function authClient(env) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

export function dbResult(result) {
  if (!result.error) return result.data;

  const code = result.error.code;

  if (code === "23505") {
    throw new HttpError(
      409,
      "That address is unavailable, or your account already has a store."
    );
  }

  console.error("Database operation failed", {
    code: result.error.code
  });

  throw new HttpError(
    503,
    "The database is temporarily unavailable. Please try again."
  );
}

export function text(value, max, label, required = false) {
  assert(typeof value === "string", 400, `${label} is invalid.`);

  const result = value.trim();

  assert(
    result.length <= max && (!required || result.length > 0),
    400,
    `${label} must contain ${required ? "1–" : "up to "}${max} characters.`
  );

  return result;
}

export function slugValue(value) {
  const slug = text(value, 40, "Store address", true);

  assert(
    slug.length >= 3 &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
      !RESERVED.has(slug),
    400,
    "Use 3–40 lowercase letters, numbers, or single hyphens. This address may be reserved."
  );

  return slug;
}

export function phoneValue(value) {
  const phone = String(value || "").replace(/[\s()+.-]/g, "");

  assert(
    /^[1-9][0-9]{7,14}$/.test(phone),
    400,
    "Enter a valid international WhatsApp number, including its country code."
  );

  return phone;
}

export function isLocal(request) {
  const host = new URL(request.url).hostname;

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1"
  );
}

export function tenant(request, env) {
  const host = new URL(request.url).hostname;

  if (isLocal(request)) {
    return host.endsWith(".localhost")
      ? host.slice(0, -".localhost".length)
      : null;
  }

  if (host === env.ROOT_DOMAIN || host === `www.${env.ROOT_DOMAIN}`) {
    return null;
  }

  assert(
    host.endsWith(`.${env.ROOT_DOMAIN}`),
    404,
    "This host is not configured."
  );

  const slug = host.slice(0, -(env.ROOT_DOMAIN.length + 1));

  assert(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),
    404,
    "Store not found."
  );

  return slug;
}

export function rootURL(request, env) {
  return isLocal(request)
    ? `${new URL(request.url).protocol}//localhost:${new URL(request.url).port || "8787"}`
    : `https://${env.ROOT_DOMAIN}`;
}

export function storeURL(request, env, slug) {
  return isLocal(request)
    ? `${new URL(request.url).protocol}//${slug}.localhost:${new URL(request.url).port || "8787"}`
    : `https://${slug}.${env.ROOT_DOMAIN}`;
}

function cookieName(request) {
  return isLocal(request) ? "funtasi_session" : "__Secure-funtasi_session";
}

export function sessionCookie(request, env, session) {
  const local = isLocal(request);
  const value = encodeURIComponent(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  }));

  return [
    `${cookieName(request)}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000",
    !local ? "Secure" : "",
    !local ? `Domain=${env.ROOT_DOMAIN}` : ""
  ].filter(Boolean).join("; ");
}

export function expiredCookie(request, env) {
  return [
    `${cookieName(request)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    !isLocal(request) ? "Secure" : "",
    !isLocal(request) ? `Domain=${env.ROOT_DOMAIN}` : ""
  ].filter(Boolean).join("; ");
}

export async function authenticate(request, env, context) {
  const name = `${cookieName(request)}=`;
  const entry = (request.headers.get("Cookie") || "")
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(name));

  if (!entry) return null;

  let session;

  try {
    session = JSON.parse(decodeURIComponent(entry.slice(name.length)));
  } catch {
    return null;
  }

  if (!session.access_token || !session.refresh_token) return null;

  const client = authClient(env);

  const existing = await client.auth.getUser(session.access_token);

  if (!existing.error && existing.data.user) {
    return existing.data.user;
  }

  const refreshed = await client.auth.refreshSession({
    refresh_token: session.refresh_token
  });

  if (refreshed.error || !refreshed.data.session) {
    context.cookie = expiredCookie(request, env);
    return null;
  }

  context.cookie = sessionCookie(
    request,
    env,
    refreshed.data.session
  );

  return refreshed.data.user;
}

export function requireUser(user) {
  assert(user, 401, "Sign in to continue.");
  return user;
}

export async function ownedStore(db, user) {
  requireUser(user);

  const store = dbResult(
    await db.from("stores")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle()
  );

  assert(store, 404, "Create your store first.");

  return store;
}

export async function ownedProduct(db, user, id) {
  const store = await ownedStore(db, user);

  assert(!store.deleting, 409, "Store deletion is in progress.");

  const product = dbResult(
    await db.from("products")
      .select("*")
      .eq("id", id)
      .eq("store_id", store.id)
      .maybeSingle()
  );

  assert(product, 404, "Product not found.");

  return { store, product };
}

export async function limit(binding, key) {
  if (!binding) return;

  const result = await binding.limit({ key });

  assert(
    result.success,
    429,
    "Too many requests. Please wait a minute before trying again."
  );
}

export async function readJSON(request, maximum = 20000) {
  const declared = Number(request.headers.get("Content-Length") || 0);

  assert(declared <= maximum, 413, "Request is too large.");

  const raw = await request.text();

  assert(
    new TextEncoder().encode(raw).length <= maximum,
    413,
    "Request is too large."
  );

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON request.");
  }
}

export async function readForm(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);

  assert(declared <= 1800000, 413, "Upload is too large.");

  // Read with a hard cap, including chunked requests.
  const reader = request.body?.getReader();
  assert(reader, 400, "No upload was received.");

  const chunks = [];
  let size = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    size += value.byteLength;

    if (size > 1800000) {
      await reader.cancel();
      throw new HttpError(413, "Upload is too large.");
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Response(bytes, {
      headers: {
        "Content-Type": request.headers.get("Content-Type") || ""
      }
    }).formData();
  } catch {
    throw new HttpError(400, "The upload could not be read.");
  }
}

export async function validateImage(file) {
  assert(
    file && typeof file.arrayBuffer === "function",
    400,
    "A product image is required."
  );

  assert(
    file.size > 0 && file.size <= 524288,
    400,
    "Each processed image must be no larger than 512 KB."
  );

  const bytes = new Uint8Array(await file.arrayBuffer());

  let dimensions;

  try {
    dimensions = imageSize(bytes);
  } catch {
    throw new HttpError(400, "The image is damaged or unsupported.");
  }

  const types = {
    jpg: { ext: "jpg", mime: "image/jpeg" },
    png: { ext: "png", mime: "image/png" },
    webp: { ext: "webp", mime: "image/webp" }
  };

  const type = types[dimensions.type];

  assert(type, 400, "Use JPG, PNG, or WebP images.");

  assert(
    dimensions.width > 0 &&
      dimensions.height > 0 &&
      dimensions.width <= 500 &&
      dimensions.height <= 500,
    400,
    "Images must fit within 500 × 500 pixels."
  );

  return { bytes, ...type };
}

export async function uploadImage(db, storeId, image) {
  const path = `${storeId}/${crypto.randomUUID()}.${image.ext}`;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, image.bytes, {
      contentType: image.mime,
      cacheControl: "0",
      upsert: false
    });

  assert(!error, 503, "The image could not be saved. Please try again.");

  return path;
}

export async function removeImages(db, paths) {
  if (!paths.length) return;

  const { error } = await db.storage.from(BUCKET).remove(paths);

  assert(!error, 503, "Image cleanup failed. Please try again.");
}

export function publicStore(store) {
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    description: store.description,
    whatsapp: store.whatsapp,
    is_public: store.is_public,
    listed: store.listed,
    deleting: store.deleting
  };
}

export function publicProduct(product) {
  return {
    id: product.id,
    kind: product.kind,
    title: product.title,
    description: product.description,
    price: product.price,
    pinned: product.pinned,
    enabled: product.enabled,
    position: product.position,
    generation_status: product.generation_status,
    has_image: Boolean(product.image_path)
  };
}
