import {
  BUCKET,
  HttpError,
  RESERVED,
  admin,
  authClient,
  assert,
  authenticate,
  dbResult,
  expiredCookie,
  isLocal,
  json,
  limit,
  ownedProduct,
  ownedStore,
  phoneValue,
  publicProduct,
  publicStore,
  readForm,
  readJSON,
  removeImages,
  requireUser,
  rootURL,
  sessionCookie,
  slugValue,
  storeURL,
  tenant,
  text,
  uploadImage,
  validateImage
} from "./lib.js";

import {
  chatReply,
  generateProduct
} from "./ai.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sortProducts(a, b) {
  return Number(b.pinned) - Number(a.pinned) ||
    a.position - b.position ||
    a.created_at.localeCompare(b.created_at);
}

async function findVisibleStore(db, slug, user) {
  const store = dbResult(
    await db.from("stores")
      .select("*")
      .eq("slug", slug)
      .maybeSingle()
  );

  const owner = Boolean(store && user?.id === store.owner_id);

  assert(
    store && (owner || (store.is_public && !store.deleting)),
    404,
    "This store is unavailable."
  );

  return { store, owner };
}

async function handleAPI(request, env, context) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const currentTenant = tenant(request, env);
  const ip = request.headers.get("CF-Connecting-IP") || "local";

  await limit(env.API_RATE, ip);

  // All modifying requests, including sign-in, require an exact origin match.
  if (!["GET", "HEAD"].includes(method)) {
    assert(
      request.headers.get("Origin") === url.origin,
      403,
      "This request must originate from this website."
    );
  }

  const db = admin(env);
  const user = await authenticate(request, env, context);

  if (path === "/api/bootstrap" && method === "GET") {
    const mine = user
      ? dbResult(
          await db.from("stores")
            .select("slug")
            .eq("owner_id", user.id)
            .maybeSingle()
        )
      : null;

    // Public hints only. Private names are not exposed as a bulk directory.
    const hints = dbResult(
      await db.from("stores")
        .select("slug")
        .eq("is_public", true)
        .eq("listed", true)
        .eq("deleting", false)
        .limit(1000)
    );

    return json({
      tenant: currentTenant,
      rootURL: rootURL(request, env),
      rootDomain: env.ROOT_DOMAIN,
      signedIn: Boolean(user),
      myStore: mine
        ? {
            slug: mine.slug,
            url: storeURL(request, env, mine.slug)
          }
        : null,
      takenHints: hints.map(item => item.slug),
      reserved: [...RESERVED],
      launchAt: env.SMART_ORDER_LAUNCH_AT
    });
  }

  if (path === "/api/auth/send" && method === "POST") {
    assert(!currentTenant, 400, "Sign in from the main website.");

    await limit(env.AUTH_RATE, `send:${ip}`);

    const body = await readJSON(request);
    const email = text(body.email, 254, "Email", true).toLowerCase();

    assert(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      400,
      "Enter a valid email address."
    );

    const { error } = await authClient(env).auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });

if (error) {
  console.error("Supabase email code failed", {
    name: error.name,
    status: error.status,
    code: error.code,
    message: error.message
  });

  throw new HttpError(
    error.status === 429 ? 429 : 503,
    error.status === 429
      ? "The email request limit was reached. Please try again later."
      : "We could not send your sign-in code. Please try again later."
  );
}


    return json({ ok: true });
  }

  if (path === "/api/auth/verify" && method === "POST") {
    assert(!currentTenant, 400, "Sign in from the main website.");

    await limit(env.AUTH_RATE, `verify:${ip}`);

    const body = await readJSON(request);
    const email = text(body.email, 254, "Email", true).toLowerCase();
    const token = text(body.token, 12, "Code", true);

    assert(/^[0-9]{6,10}$/.test(token), 400, "Enter the emailed code.");

    const { data, error } = await authClient(env).auth.verifyOtp({
      email,
      token,
      type: "email"
    });

    assert(
      !error && data.session,
      401,
      "That code is invalid or has expired. Request a new code."
    );

    context.cookie = sessionCookie(request, env, data.session);

    return json({ ok: true });
  }

  if (path === "/api/auth/logout" && method === "POST") {
    // Removing the HttpOnly cookie signs this browser out.
    context.cookie = expiredCookie(request, env);
    return json({ ok: true });
  }

  if (path === "/api/availability" && method === "GET") {
    const slug = slugValue(url.searchParams.get("slug") || "");

    const existing = dbResult(
      await db.from("stores")
        .select("id")
        .eq("slug", slug)
        .maybeSingle()
    );

    return json({ available: !existing, slug });
  }

  if (path === "/api/featured" && method === "GET") {
    const rows = dbResult(await db.rpc("featured_stores"));

    return json(rows.map(row => ({
      ...row,
      url: storeURL(request, env, row.slug),
      image: `/api/image/${row.product_id}`
    })));
  }

  if (path === "/api/store" && method === "GET") {
    assert(currentTenant, 400, "Open a storefront subdomain.");

    const { store, owner } = await findVisibleStore(
      db,
      currentTenant,
      user
    );

    let query = db.from("products")
      .select("*")
      .eq("store_id", store.id);

    if (!owner) query = query.eq("enabled", true);

    const products = dbResult(await query).sort(sortProducts);

    return json({
      owner,
      store: publicStore(store),
      products: products.map(publicProduct)
    });
  }

  if (path === "/api/setup" && method === "POST") {
    requireUser(user);
    assert(!currentTenant, 400, "Create your store from the main website.");

    const existing = dbResult(
      await db.from("stores")
        .select("slug")
        .eq("owner_id", user.id)
        .maybeSingle()
    );

    // Safe recovery if the original response was lost after creation.
    if (existing) {
      return json({
        url: storeURL(request, env, existing.slug)
      });
    }

    const form = await readForm(request);
    const slug = slugValue(form.get("slug"));
    const whatsapp = phoneValue(form.get("whatsapp"));
    const files = form.getAll("images");

    assert(
      files.length >= 1 && files.length <= 3,
      400,
      "Upload one to three product images."
    );

    const images = await Promise.all(files.map(validateImage));

    const taken = dbResult(
      await db.from("stores")
        .select("id")
        .eq("slug", slug)
        .maybeSingle()
    );

    assert(!taken, 409, "That store address has just been taken.");

    const storeId = crypto.randomUUID();
    const paths = [];

    try {
      const initialProducts = [];

      for (let index = 0; index < images.length; index++) {
        const imagePath = await uploadImage(db, storeId, images[index]);
        paths.push(imagePath);

        initialProducts.push({
          id: crypto.randomUUID(),
          image_path: imagePath,
          position: index
        });
      }

      dbResult(
        await db.rpc("create_seller_store", {
          p_store_id: storeId,
          p_owner_id: user.id,
          p_slug: slug,
          p_whatsapp: whatsapp,
          p_products: initialProducts
        })
      );
    } catch (error) {
      try {
        await removeImages(db, paths);
      } catch {
        console.error("Setup cleanup requires attention", { storeId });
      }

      throw error;
    }

    return json({
      url: storeURL(request, env, slug)
    }, 201);
  }

  if (path === "/api/store" && method === "PATCH") {
    const store = await ownedStore(db, user);

    assert(!store.deleting, 409, "Store deletion is in progress.");

    const body = await readJSON(request);

    assert(
      typeof body.is_public === "boolean" &&
        typeof body.listed === "boolean",
      400,
      "Invalid publication settings."
    );

    const update = {
      name: text(body.name, 100, "Store name", true),
      description: text(body.description, 1000, "Store description"),
      whatsapp: phoneValue(body.whatsapp),
      is_public: body.is_public,
      listed: body.listed
    };

    if (update.is_public) {
      const items = dbResult(
        await db.from("products")
          .select("id")
          .eq("store_id", store.id)
          .eq("kind", "product")
          .eq("enabled", true)
          .limit(1)
      );

      assert(
        items.length,
        400,
        "Enable at least one product before publishing."
      );
    }

    const saved = dbResult(
      await db.from("stores")
        .update(update)
        .eq("id", store.id)
        .select("*")
        .single()
    );

    return json(publicStore(saved));
  }

  if (path === "/api/products" && method === "POST") {
    const store = await ownedStore(db, user);
    assert(!store.deleting, 409, "Store deletion is in progress.");

    const form = await readForm(request);
    const kind = form.get("kind") === "about" ? "about" : "product";

    const all = dbResult(
      await db.from("products")
        .select("id,kind,position")
        .eq("store_id", store.id)
    );

    assert(all.length < 100, 400, "This store has reached its 100-section limit.");

    if (kind === "about") {
      assert(
        all.filter(item => item.kind === "about").length < 3,
        400,
        "You can add up to three About you sections."
      );
    }

    const file = form.get("image");
    let path = null;

    if (file && typeof file.arrayBuffer === "function" && file.size) {
      path = await uploadImage(db, store.id, await validateImage(file));
    } else {
      assert(kind === "about", 400, "A product image is required.");
    }

    try {
      const product = dbResult(
        await db.from("products")
          .insert({
            store_id: store.id,
            kind,
            image_path: path,
            title: kind === "about" ? "About you" : "Untitled product",
            generation_status: kind === "about" ? "ready" : "pending",
            position: Math.max(-1, ...all.map(item => item.position)) + 1
          })
          .select("*")
          .single()
      );

      return json(publicProduct(product), 201);
    } catch (error) {
      if (path) {
        try {
          await removeImages(db, [path]);
        } catch {
          console.error("Product upload cleanup failed", {
            storeId: store.id
          });
        }
      }

      throw error;
    }
  }

  const productMatch = path.match(/^\/api\/products\/([^/]+)$/);

  if (productMatch && method === "PATCH") {
    const id = productMatch[1];
    assert(UUID.test(id), 400, "Invalid product.");

    const { product } = await ownedProduct(db, user, id);
    const body = await readJSON(request);
    const update = {};

    if ("title" in body) {
      update.title = text(body.title, 120, "Title", true);
    }

    if ("description" in body) {
      update.description = text(body.description, 3000, "Description");
    }

    if ("price" in body) {
      update.price = text(body.price, 40, "Price");
    }

    for (const key of ["enabled", "pinned"]) {
      if (key in body) {
        assert(typeof body[key] === "boolean", 400, `Invalid ${key} value.`);
        update[key] = body[key];
      }
    }

    if ("direction" in body) {
      assert(
        ["up", "down"].includes(body.direction),
        400,
        "Invalid direction."
      );

      const items = dbResult(
        await db.from("products")
          .select("*")
          .eq("store_id", product.store_id)
      ).sort(sortProducts);

      // Reorder within the same pinned/unpinned group.
      const group = items.filter(item => item.pinned === product.pinned);
      const index = group.findIndex(item => item.id === id);
      const targetIndex = index + (body.direction === "up" ? -1 : 1);

      if (targetIndex >= 0 && targetIndex < group.length) {
        [group[index], group[targetIndex]] = [
          group[targetIndex],
          group[index]
        ];

        // Single SQL statement through upsert; complete rows preserve fields.
        const reordered = group.map((item, position) => ({
          ...item,
          position
        }));

        dbResult(
          await db.from("products").upsert(reordered, {
            onConflict: "id"
          })
        );
      }

      return json({ ok: true });
    }

    if ("title" in update || "description" in update) {
      update.generation_status = "ready";
    }

    assert(Object.keys(update).length, 400, "No changes were supplied.");

    const saved = dbResult(
      await db.from("products")
        .update(update)
        .eq("id", id)
        .select("*")
        .single()
    );

    return json(publicProduct(saved));
  }

  if (productMatch && method === "DELETE") {
    const id = productMatch[1];
    assert(UUID.test(id), 400, "Invalid product.");

    const { product } = await ownedProduct(db, user, id);

    if (product.image_path) {
      await removeImages(db, [product.image_path]);
    }

    dbResult(
      await db.from("products")
        .delete()
        .eq("id", id)
    );

    return json({ ok: true });
  }

  const imageUpload = path.match(/^\/api\/products\/([^/]+)\/image$/);

  if (imageUpload && method === "POST") {
    const id = imageUpload[1];
    assert(UUID.test(id), 400, "Invalid product.");

    const { store, product } = await ownedProduct(db, user, id);
    const form = await readForm(request);
    const image = await validateImage(form.get("image"));
    const newPath = await uploadImage(db, store.id, image);

    try {
      dbResult(
        await db.from("products")
          .update({ image_path: newPath })
          .eq("id", id)
      );
    } catch (error) {
      await removeImages(db, [newPath]);
      throw error;
    }

    if (product.image_path) {
      // Old unreferenced files can be cleaned during whole-store deletion
      // if the storage provider temporarily fails here.
      try {
        await removeImages(db, [product.image_path]);
      } catch {
        console.error("Old image cleanup deferred", {
          storeId: store.id
        });
      }
    }

    return json({ ok: true });
  }

  const generateMatch = path.match(/^\/api\/products\/([^/]+)\/generate$/);

  if (generateMatch && method === "POST") {
    const id = generateMatch[1];
    assert(UUID.test(id), 400, "Invalid product.");

    const { product } = await ownedProduct(db, user, id);

    assert(product.kind === "product", 400, "This section is not a product.");

    await limit(env.AI_RATE, `generation:${user.id}`);

    try {
      const generated = await generateProduct(env, db, product);
      return json(publicProduct(generated));
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 409)) {
        await db.from("products")
          .update({ generation_status: "failed" })
          .eq("id", product.id)
          .eq("updated_at", product.updated_at);
      }

      throw error;
    }
  }

  const imageMatch = path.match(/^\/api\/image\/([^/]+)$/);

  if (imageMatch && method === "GET") {
    const id = imageMatch[1];
    assert(UUID.test(id), 404, "Image not found.");

    const product = dbResult(
      await db.from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle()
    );

    assert(product?.image_path, 404, "Image not found.");

    const store = dbResult(
      await db.from("stores")
        .select("*")
        .eq("id", product.store_id)
        .maybeSingle()
    );

    const owner = store && user?.id === store.owner_id;

    assert(
      store &&
        (owner ||
          (store.is_public && !store.deleting && product.enabled)),
      404,
      "Image not found."
    );

    const downloaded = await db.storage
      .from(BUCKET)
      .download(product.image_path);

    assert(!downloaded.error, 404, "Image not found.");

    return new Response(downloaded.data, {
      headers: {
        "Content-Type": downloaded.data.type || "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  if (path === "/api/chat" && method === "POST") {
    assert(currentTenant, 400, "Open a seller storefront first.");

    await limit(env.AI_RATE, `chat:${ip}`);

    const body = await readJSON(request, 16000);
    const { store } = await findVisibleStore(db, currentTenant, user);

    assert(UUID.test(body.productId || ""), 400, "Invalid product.");

    const product = dbResult(
      await db.from("products")
        .select("*")
        .eq("id", body.productId)
        .eq("store_id", store.id)
        .eq("kind", "product")
        .maybeSingle()
    );

    assert(
      product &&
        (product.enabled || user?.id === store.owner_id),
      404,
      "Product not found."
    );

    assert(
      Array.isArray(body.messages) &&
        body.messages.length >= 1 &&
        body.messages.length <= 12,
      400,
      "Invalid conversation."
    );

    let total = 0;

    const messages = body.messages.map(message => {
      assert(
        ["user", "assistant"].includes(message.role),
        400,
        "Invalid message role."
      );

      const content = text(message.content, 1200, "Message", true);
      total += content.length;

      return { role: message.role, content };
    });

    assert(total <= 12000, 400, "This conversation is too long.");
    assert(
      messages.at(-1).role === "user",
      400,
      "A visitor message is required."
    );

    const reply = await chatReply(env, store, product, messages);

    // No chat messages are written to Supabase.
    return json({ reply });
  }

  if (path === "/api/store" && method === "DELETE") {
    const store = await ownedStore(db, user);
    const body = await readJSON(request);

    assert(
      body.confirm === store.slug,
      400,
      "Type your store address to confirm deletion."
    );

    // Make the store inaccessible before removing its files.
    dbResult(
      await db.from("stores")
        .update({
          deleting: true,
          is_public: false,
          listed: false
        })
        .eq("id", store.id)
    );

    // Flat per-store paths permit complete cleanup, including old/orphan files.
    while (true) {
      const listed = await db.storage
        .from(BUCKET)
        .list(store.id, { limit: 100 });

      assert(
        !listed.error,
        503,
        "Deletion paused while listing images. Please retry deletion."
      );

      if (!listed.data.length) break;

      await removeImages(
        db,
        listed.data.map(file => `${store.id}/${file.name}`)
      );
    }

    dbResult(
      await db.from("stores")
        .delete()
        .eq("id", store.id)
    );

    return json({
      ok: true,
      url: rootURL(request, env)
    });
  }

  throw new HttpError(404, "Endpoint not found.");
}

function securityHeaders(response, context, request) {
  const headers = new Headers(response.headers);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' blob: data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join("; ")
  );

  if (!isLocal(request)) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  if (context.cookie) headers.append("Set-Cookie", context.cookie);

  return new Response(response.body, {
    status: response.status,
    headers
  });
}

export default {
  async fetch(request, env) {
    const context = {};

    try {
      const url = new URL(request.url);

      tenant(request, env);

      if (!isLocal(request) && url.protocol !== "https:") {
        url.protocol = "https:";
        return Response.redirect(url.toString(), 308);
      }

      let response;

      if (url.pathname.startsWith("/api/")) {
        response = await handleAPI(request, env, context);
      } else {
        if (
          url.pathname === "/" ||
          url.pathname === "/index.html"
        ) {
          response = await env.ASSETS.fetch(request);

          const headers = new Headers(response.headers);
          headers.set("Cache-Control", "no-store");

          response = new Response(response.body, {
            status: response.status,
            headers
          });
        } else {
          response = await env.ASSETS.fetch(request);
        }
      }

      return securityHeaders(response, context, request);
    } catch (error) {
      const requestId = crypto.randomUUID();

console.error("Unhandled request failure", {
  requestId,
  name: error?.name,
  message: error?.message
});
      

      return securityHeaders(
        json({
          error: error instanceof HttpError
            ? error.message
            : "An unexpected error occurred. Please try again.",
          requestId
        }, error instanceof HttpError ? error.status : 500),
        context,
        request
      );
    }
  }
};
