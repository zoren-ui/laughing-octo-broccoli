import { api, escapeHTML as e } from "./api.js";
import { prepareImage, prepareImages } from "./images.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = {
  boot: null,
  store: null,
  products: [],
  owner: false,
  featured: [],
  carouselPage: 0,
  setupImages: [],
  previewURLs: [],
  imageVersion: Date.now(),
  authEmail: "",
  setupIntent: false,
  availability: null,
  availabilityTimer: null,
  availabilityController: null,
  imageJob: 0,
  preparingImages: false,
  toastTimer: null,
  chatProduct: null,
  chatMessages: [],
  chatBusy: false,
  chatSession: 0,
  generating: new Set()
};

function toast(message) {
  clearTimeout(state.toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");

  state.toastTimer = setTimeout(() => {
    $("#toast").classList.remove("show");
  }, 4500);
}

function openDialog(selector) {
  const dialog = $(selector);
  if (!dialog.open) dialog.showModal();
}

function status(selector, message) {
  $(selector).textContent = message;
}

async function withBusy(button, operation) {
  if (button.disabled) return;

  button.disabled = true;
  button.setAttribute("aria-busy", "true");

  try {
    return await operation();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function imageURL(id) {
  return `/api/image/${id}?v=${state.imageVersion}`;
}

async function loadBootstrap() {
  state.boot = await api("/api/bootstrap");

  $("#home-link").href = state.boot.rootURL;
  $("#signin-button").hidden = state.boot.signedIn;
  $("#logout-button").hidden = !state.boot.signedIn;

  const myStore = $("#my-store-link");
  myStore.hidden = !state.boot.myStore;

  if (state.boot.myStore) {
    myStore.href = state.boot.myStore.url;
  }

  $("#domain-suffix").textContent =
    state.boot.rootDomain === "localhost"
      ? ".localhost"
      : `.${state.boot.rootDomain}`;

  $$(".demo-domain").forEach(element => {
    element.textContent = `your-store.${state.boot.rootDomain}`;
  });
}

function startSellerFlow() {
  if (state.boot.tenant) {
    location.href = `${state.boot.rootURL}/?seller=1`;
    return;
  }

  if (state.boot.myStore) {
    location.href = state.boot.myStore.url;
    return;
  }

  state.setupIntent = true;

  if (state.boot.signedIn) {
    openDialog("#setup-dialog");
  } else {
    openDialog("#auth-dialog");
  }
}

async function loadFeatured() {
  try {
    state.featured = await api("/api/featured");
    renderFeatured();
  } catch (error) {
    status("#discovery-status", error.message);
  }
}

function renderFeatured() {
  const pages = Math.max(1, Math.ceil(state.featured.length / 4));

  state.carouselPage = Math.min(state.carouselPage, pages - 1);

  const visible = state.featured.slice(
    state.carouselPage * 4,
    state.carouselPage * 4 + 4
  );

  $("#market-grid").innerHTML = visible.map(item => `
    <article class="market-card">
      <a class="market-image" href="${e(item.url)}">
        <img
          src="${e(item.image)}"
          alt="${e(item.title)}"
          loading="lazy"
          width="500"
          height="500"
        >
      </a>
      <h3>${e(item.title)}</h3>
      <p class="subdomain-label">${e(item.store_name)}</p>
      <div class="card-bottom">
        <span>${e(item.price)}</span>
        <a class="view-button" href="${e(item.url)}">view</a>
      </div>
    </article>
  `).join("");

  status(
    "#discovery-status",
    state.featured.length
      ? ""
      : "Public stores will appear here as sellers publish their collections."
  );

  $("#carousel-prev").disabled = state.carouselPage === 0;
  $("#carousel-next").disabled = state.carouselPage >= pages - 1;

  $("#carousel-page").textContent = state.featured.length
    ? `${state.carouselPage + 1} / ${pages}`
    : "";
}

function startCountdown() {
  const target = Date.parse(state.boot.launchAt);

  if (!Number.isFinite(target)) {
    status("#launch-date", "Launch date will be announced.");
    return;
  }

  const tick = () => {
    const remaining = Math.max(0, target - Date.now());
    const seconds = Math.floor(remaining / 1000);

    $("#count-days").textContent =
      String(Math.floor(seconds / 86400)).padStart(2, "0");

    $("#count-hours").textContent =
      String(Math.floor(seconds / 3600) % 24).padStart(2, "0");

    $("#count-minutes").textContent =
      String(Math.floor(seconds / 60) % 60).padStart(2, "0");

    $("#count-seconds").textContent =
      String(seconds % 60).padStart(2, "0");

    $("#launch-date").textContent = remaining > 0
      ? `Scheduled for ${new Date(target).toLocaleString(undefined, {
          dateStyle: "long",
          timeStyle: "short"
        })}.`
      : "The scheduled launch date has arrived. Availability will be confirmed here.";
  };

  tick();
  setInterval(tick, 1000);
}

function startDemo() {
  const cards = $$(".demo-card");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  let index = 0;
  let paused = false;

  function render() {
    cards.forEach((card, current) => {
      card.classList.toggle("active", reduced.matches || current === index);
    });

    $("#demo-toggle").hidden = reduced.matches;
  }

  $("#demo-toggle").addEventListener("click", () => {
    paused = !paused;

    $("#demo-toggle").textContent = paused ? "Play ▷" : "Pause Ⅱ";
    $("#demo-toggle").setAttribute("aria-pressed", String(paused));
    $("#demo-toggle").setAttribute(
      "aria-label",
      paused ? "Resume storefront demonstration" : "Pause storefront demonstration"
    );
  });

  setInterval(() => {
    if (
      paused ||
      reduced.matches ||
      document.hidden ||
      $("dialog[open]") ||
      $("#home").hidden
    ) return;

    const bounds = $(".creation-demo").getBoundingClientRect();

    if (bounds.bottom < 0 || bounds.top > innerHeight) return;

    index = (index + 1) % cards.length;
    render();
  }, 3400);

  reduced.addEventListener("change", render);
  render();
}

async function loadStore() {
  const data = await api("/api/store");

  state.store = data.store;
  state.products = data.products;
  state.owner = data.owner;

  $("#storefront").hidden = false;
  $("#owner-toolbar").hidden = !data.owner;
  $("#owner-add").hidden = !data.owner;

  $("#store-name").textContent = data.store.name;
  $("#store-description").textContent = data.store.description;
  $("#store-domain").textContent =
    `${data.store.slug}.${state.boot.rootDomain}`;

  document.title = `${data.store.name} — Funtasi`;

  $("#publication-status").hidden = !data.owner;

  $("#publication-status").textContent = data.store.deleting
    ? "Deletion paused. Open Store settings and retry deletion."
    : data.store.is_public
      ? data.store.listed
        ? "Public · eligible for homepage discovery"
        : "Public · excluded from homepage discovery"
      : "Private · visible only to you";

  const whatsapp = `https://wa.me/${data.store.whatsapp}`;

  $("#whatsapp").href = whatsapp;
  $("#chat-whatsapp").href = whatsapp;

  // Never displayed on the marketplace/homepage.
  $("#whatsapp").hidden = false;

  renderProducts();
}

function ownerTools(product, index) {
  const group = state.products.filter(item => item.pinned === product.pinned);
  const groupIndex = group.findIndex(item => item.id === product.id);

  return `
    <div class="product-owner-tools">
      <span class="eyebrow">${product.kind === "about" ? "ABOUT YOU" : `PRODUCT ${index + 1}`}</span>

      <div class="edit-controls">
        <button
          class="mini ${product.pinned ? "selected" : ""}"
          data-action="pin"
          aria-label="${product.pinned ? "Unpin" : "Pin"} ${e(product.title)}"
          aria-pressed="${product.pinned}"
          title="Pin section"
        >⌖</button>

        <button
          class="mini"
          data-action="up"
          aria-label="Move section up"
          ${groupIndex === 0 ? "disabled" : ""}
        >↑</button>

        <button
          class="mini"
          data-action="down"
          aria-label="Move section down"
          ${groupIndex === group.length - 1 ? "disabled" : ""}
        >↓</button>

        <label class="live-toggle">
          <input
            data-action="enabled"
            type="checkbox"
            ${product.enabled ? "checked" : ""}
          >
          Enabled
        </label>
      </div>
    </div>
  `;
}

function renderProducts() {
  $("#product-list").innerHTML = state.products.map((product, index) => {
    const image = product.has_image
      ? `
          <img
            class="product-photo"
            src="${imageURL(product.id)}"
            alt="${e(product.title)}"
            width="500"
            height="500"
            loading="${index === 0 ? "eager" : "lazy"}"
          >
        `
      : "";

    if (!state.owner) {
      return `
        <section class="section store-product" data-id="${product.id}">
          ${image}
          <div class="product-title-row">
            <h2>${e(product.title)}</h2>
            <span class="price">${e(product.price)}</span>
          </div>

          <p class="product-description">${e(product.description)}</p>

          ${product.kind === "product"
            ? `
                <button
                  class="button dark"
                  data-action="chat"
                  type="button"
                >Ask about this product ↗</button>
              `
            : ""}
        </section>
      `;
    }

    return `
      <section
        class="section store-product owner-product ${product.enabled ? "" : "is-disabled"}"
        data-id="${product.id}"
      >
        ${ownerTools(product, index)}

        <div class="product-edit-content">
          ${image}

          <label class="button outline small upload-button">
            ${product.has_image ? "Change image" : "Add image"} ↗
            <input
              type="file"
              data-image
              accept="image/jpeg,image/png,image/webp"
            >
          </label>

          <form class="product-form">
            <label class="field">
              <span>Title</span>
              <input
                name="title"
                value="${e(product.title)}"
                maxlength="120"
                required
              >
            </label>

            <label class="field">
              <span>Description</span>
              <textarea
                name="description"
                maxlength="3000"
              >${e(product.description)}</textarea>
            </label>

            ${product.kind === "product"
              ? `
                  <label class="field">
                    <span>Price / price label</span>
                    <input
                      name="price"
                      value="${e(product.price)}"
                      maxlength="40"
                      placeholder="For example: $120"
                    >
                  </label>
                `
              : ""}

            <div class="product-action-row">
              <button class="button dark small" type="submit">
                Save content
              </button>

              ${product.kind === "product"
                ? `
                    <button
                      class="button outline small"
                      type="button"
                      data-action="generate"
                    >${product.generation_status === "failed"
                      ? "Retry AI draft"
                      : "Generate AI draft"}</button>
                  `
                : ""}
            </div>
          </form>

          ${product.kind === "product"
            ? `
                <p class="fine-print">
                  Review AI drafts for accuracy before publishing.
                  Image-based drafts cannot verify specifications.
                </p>
                <button
                  class="text-button"
                  data-action="chat"
                  type="button"
                >Preview product conversation ↗</button>
              `
            : ""}

          <p class="status product-status" role="status">${
            product.generation_status === "pending"
              ? "Image saved. Product draft is pending."
              : product.generation_status === "failed"
                ? "Generation was not completed. Retry or enter the content yourself."
                : ""
          }</p>

          <button
            class="text-button danger"
            data-action="delete"
            type="button"
          >Delete section</button>
        </div>
      </section>
    `;
  }).join("");
}

async function refreshStore() {
  state.imageVersion = Date.now();
  await loadStore();
}

async function generate(id, button) {
  if (state.generating.has(id)) return;

  state.generating.add(id);

  const section = document.querySelector(`[data-id="${id}"]`);
  const label = section?.querySelector(".product-status");

  if (label) {
    label.textContent = "Preparing product content… Your image is already saved.";
  }

  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }

  // Prevent accidental edits in this section during generation.
  section?.querySelectorAll(".product-form input, .product-form textarea")
    .forEach(input => input.disabled = true);

  try {
    await api(`/api/products/${id}/generate`, {
      method: "POST",
      body: {}
    });

    await refreshStore();
  } catch (error) {
    if (label?.isConnected) label.textContent = error.message;
    toast(error.message);
  } finally {
    state.generating.delete(id);

    if (button?.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }

    section?.querySelectorAll(".product-form input, .product-form textarea")
      .forEach(input => input.disabled = false);
  }
}

async function generatePending() {
  // Sequential generation avoids a burst of three model requests.
  const pending = state.products
    .filter(product =>
      product.kind === "product" &&
      product.generation_status === "pending"
    )
    .map(product => product.id);

  for (const id of pending) {
    await generate(
      id,
      document.querySelector(`[data-id="${id}"] [data-action="generate"]`)
    );
  }
}

function fillSettings() {
  const store = state.store;

  $("#settings-name").value = store.name;
  $("#settings-description").value = store.description;
  $("#settings-whatsapp").value = `+${store.whatsapp}`;
  $("#settings-public").checked = store.is_public;
  $("#settings-listed").checked = store.listed;

  status("#settings-status", "");
  openDialog("#settings-dialog");
}

function openChat(product) {
  state.chatSession += 1;
  state.chatProduct = product;
  state.chatMessages = [];
  state.chatBusy = false;

  $("#chat-title").textContent = product.title;
  $("#chat-messages").replaceChildren();
  $("#chat-input").value = "";
  $("#chat-input").disabled = false;
  $("#chat-form button").disabled = false;

  status("#chat-status", "Context is used within this conversation only.");

  addChatMessage(
    "assistant",
    `Ask about ${product.title}, or contact the seller to confirm purchase details.`,
    false
  );

  openDialog("#chat-dialog");
}

function addChatMessage(role, content, remember = true) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.textContent = content;

  $("#chat-messages").append(bubble);
  $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;

  if (remember) {
    state.chatMessages.push({ role, content });
  }
}

// ---------- Shared dialog behavior ----------

document.addEventListener("click", event => {
  const close = event.target.closest("[data-close]");
  if (close) close.closest("dialog").close();
});

$$("dialog").forEach(dialog => {
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;

    const bounds = dialog.getBoundingClientRect();

    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) dialog.close();
  });
});

$("#chat-dialog").addEventListener("close", () => {
  state.chatSession += 1;
  state.chatMessages = [];
});

// ---------- Navigation/auth ----------

$("#start-button").addEventListener("click", startSellerFlow);
$("#signin-button").addEventListener("click", startSellerFlow);
$("#reload-button").addEventListener("click", () => location.reload());

$("#logout-button").addEventListener("click", async event => {
  await withBusy(event.currentTarget, async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
      location.href = state.boot.rootURL;
    } catch (error) {
      toast(error.message);
    }
  });
});

$("#email-form").addEventListener("submit", async event => {
  event.preventDefault();

  await withBusy(event.submitter, async () => {
    status("#auth-status", "Sending your sign-in code…");

    try {
      state.authEmail = $("#auth-email").value.trim();

      await api("/api/auth/send", {
        method: "POST",
        body: { email: state.authEmail }
      });

      $("#email-form").hidden = true;
      $("#code-form").hidden = false;
      $("#auth-code").focus();

      status("#auth-status", "Check your email for the one-time code.");
    } catch (error) {
      status("#auth-status", error.message);
    }
  });
});

$("#change-email").addEventListener("click", () => {
  $("#email-form").hidden = false;
  $("#code-form").hidden = true;
  status("#auth-status", "You can request another code after one minute.");
});

$("#code-form").addEventListener("submit", async event => {
  event.preventDefault();

  await withBusy(event.submitter, async () => {
    status("#auth-status", "Verifying your code…");

    try {
      await api("/api/auth/verify", {
        method: "POST",
        body: {
          email: state.authEmail,
          token: $("#auth-code").value.trim()
        }
      });

      await loadBootstrap();
      $("#auth-dialog").close();

      if (state.boot.myStore) {
        location.href = state.boot.myStore.url;
      } else {
        openDialog("#setup-dialog");
      }
    } catch (error) {
      status("#auth-status", error.message);
    }
  });
});

// ---------- Availability ----------

$("#setup-slug").addEventListener("input", () => {
  clearTimeout(state.availabilityTimer);
  state.availabilityController?.abort();

  const slug = $("#setup-slug").value.trim();
  state.availability = null;

  if (
    slug.length < 3 ||
    slug.length > 40 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    status(
      "#availability-status",
      "Use 3–40 lowercase letters, numbers, or single hyphens."
    );
    return;
  }

  if (
    state.boot.reserved.includes(slug) ||
    state.boot.takenHints.includes(slug)
  ) {
    status("#availability-status", "This address is unavailable.");
    state.availability = { slug, available: false };
    return;
  }

  status("#availability-status", "Checking availability…");

  state.availabilityTimer = setTimeout(async () => {
    const controller = new AbortController();
    state.availabilityController = controller;

    try {
      const result = await api(
        `/api/availability?slug=${encodeURIComponent(slug)}`,
        { signal: controller.signal, timeout: 8000 }
      );

      if ($("#setup-slug").value.trim() !== slug) return;

      state.availability = result;

      status(
        "#availability-status",
        result.available
          ? "This address is available. It is reserved when your store is created."
          : "This address is unavailable."
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        status("#availability-status", error.message);
      }
    }
  }, 350);
});

// ---------- Signup image preparation ----------

function clearPreviews() {
  state.previewURLs.forEach(URL.revokeObjectURL);
  state.previewURLs = [];
  $("#setup-previews").replaceChildren();
}

$("#setup-images").addEventListener("change", async event => {
  const job = ++state.imageJob;

  state.preparingImages = true;
  state.setupImages = [];

  clearPreviews();
  status("#image-status", "Preparing images…");

  try {
    const prepared = await prepareImages(event.target.files);

    if (job !== state.imageJob) return;

    state.setupImages = prepared;

    for (const file of prepared) {
      const url = URL.createObjectURL(file);
      state.previewURLs.push(url);

      const image = document.createElement("img");
      image.src = url;
      image.alt = "Selected product preview";

      $("#setup-previews").append(image);
    }

    status(
      "#image-status",
      `${prepared.length} image${prepared.length === 1 ? "" : "s"} ready. Each fits within 500 × 500 pixels.`
    );
  } catch (error) {
    if (job === state.imageJob) {
      event.target.value = "";
      status("#image-status", error.message);
    }
  } finally {
    if (job === state.imageJob) state.preparingImages = false;
  }
});

$("#setup-form").addEventListener("submit", async event => {
  event.preventDefault();

  await withBusy(event.submitter, async () => {
    try {
      if (state.preparingImages) {
        throw new Error("Wait for image preparation to finish.");
      }

      if (!state.setupImages.length) {
        throw new Error("Choose at least one valid product image.");
      }

      const slug = $("#setup-slug").value.trim();

      const checked = await api(
        `/api/availability?slug=${encodeURIComponent(slug)}`,
        { timeout: 8000 }
      );

      if (!checked.available) {
        throw new Error("That store address is unavailable.");
      }

      const form = new FormData();
      form.set("slug", slug);
      form.set("whatsapp", $("#setup-whatsapp").value);

      state.setupImages.forEach(file => form.append("images", file));

      status("#setup-status", "Saving your store and product images…");

      const result = await api("/api/setup", {
        method: "POST",
        body: form,
        timeout: 45000
      });

      location.href = result.url;
    } catch (error) {
      status("#setup-status", error.message);
    }
  });
});

// ---------- Homepage carousel ----------

$("#carousel-prev").addEventListener("click", () => {
  state.carouselPage = Math.max(0, state.carouselPage - 1);
  renderFeatured();
});

$("#carousel-next").addEventListener("click", () => {
  state.carouselPage += 1;
  renderFeatured();
});

// ---------- Owner editing ----------

$("#settings-button").addEventListener("click", fillSettings);

$("#settings-form").addEventListener("submit", async event => {
  event.preventDefault();

  await withBusy(event.submitter, async () => {
    status("#settings-status", "Saving settings…");

    try {
      await api("/api/store", {
        method: "PATCH",
        body: {
          name: $("#settings-name").value,
          description: $("#settings-description").value,
          whatsapp: $("#settings-whatsapp").value,
          is_public: $("#settings-public").checked,
          listed: $("#settings-listed").checked
        }
      });

      await refreshStore();
      status("#settings-status", "Settings saved.");
    } catch (error) {
      status("#settings-status", error.message);
    }
  });
});

$("#product-list").addEventListener("submit", async event => {
  if (!event.target.matches(".product-form")) return;

  event.preventDefault();

  const section = event.target.closest("[data-id]");
  const form = new FormData(event.target);

  await withBusy(event.submitter, async () => {
    const label = section.querySelector(".product-status");

    try {
      label.textContent = "Saving content…";

      await api(`/api/products/${section.dataset.id}`, {
        method: "PATCH",
        body: {
          title: form.get("title"),
          description: form.get("description"),
          price: form.get("price") || ""
        }
      });

      // Do not rerender the page and discard edits in other sections.
      const product = state.products.find(item => item.id === section.dataset.id);

      product.title = form.get("title");
      product.description = form.get("description");
      product.price = form.get("price") || "";
      product.generation_status = "ready";

      label.textContent = "Content saved.";
    } catch (error) {
      label.textContent = error.message;
    }
  });
});

$("#product-list").addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const section = button.closest("[data-id]");
  const product = state.products.find(item => item.id === section.dataset.id);
  const action = button.dataset.action;

  if (action === "chat") {
    openChat(product);
    return;
  }

  if (!state.owner) return;

  if (action === "generate") {
    if (
      product.generation_status === "ready" &&
      !confirm("Replace the saved title and description with a new AI draft?")
    ) return;

    await generate(product.id, button);
    return;
  }

  if (action === "delete") {
    if (!confirm("Permanently delete this section and its image?")) return;
  }

  await withBusy(button, async () => {
    try {
      if (action === "delete") {
        await api(`/api/products/${product.id}`, {
          method: "DELETE",
          body: {}
        });
      } else {
        await api(`/api/products/${product.id}`, {
          method: "PATCH",
          body: action === "pin"
            ? { pinned: !product.pinned }
            : { direction: action }
        });
      }

      await refreshStore();
    } catch (error) {
      toast(error.message);
    }
  });
});

$("#product-list").addEventListener("change", async event => {
  const input = event.target;
  const section = input.closest("[data-id]");

  if (!section || !state.owner) return;

  const id = section.dataset.id;

  if (input.dataset.action === "enabled") {
    input.disabled = true;

    try {
      await api(`/api/products/${id}`, {
        method: "PATCH",
        body: { enabled: input.checked }
      });

      const product = state.products.find(item => item.id === id);
      product.enabled = input.checked;

      section.classList.toggle("is-disabled", !input.checked);
      toast(input.checked ? "Section enabled." : "Section disabled.");
    } catch (error) {
      input.checked = !input.checked;
      toast(error.message);
    } finally {
      input.disabled = false;
    }
  }

  if (input.hasAttribute("data-image")) {
    const label = section.querySelector(".product-status");

    try {
      input.disabled = true;
      label.textContent = "Preparing image…";

      const image = await prepareImage(input.files[0]);
      const form = new FormData();
      form.set("image", image);

      label.textContent = "Uploading image…";

      await api(`/api/products/${id}/image`, {
        method: "POST",
        body: form
      });

      // Change only the image, preserving unsaved text in this section.
      state.imageVersion = Date.now();

      let preview = section.querySelector(".product-photo");

      if (!preview) {
        preview = document.createElement("img");
        preview.className = "product-photo";
        preview.alt = "Section image";

        section.querySelector(".product-edit-content").prepend(preview);
      }

      preview.src = imageURL(id);
      state.products.find(item => item.id === id).has_image = true;
      label.textContent = "Image saved.";
    } catch (error) {
      label.textContent = error.message;
    } finally {
      input.disabled = false;
      input.value = "";
    }
  }
});

$("#add-product-images").addEventListener("change", async event => {
  const input = event.target;

  if (!input.files.length) return;

  input.disabled = true;

  try {
    status("#add-status", "Preparing images…");
    const images = await prepareImages(input.files);
    const ids = [];

    for (let index = 0; index < images.length; index++) {
      status(
        "#add-status",
        `Saving product ${index + 1} of ${images.length}…`
      );

      const form = new FormData();
      form.set("kind", "product");
      form.set("image", images[index]);

      const product = await api("/api/products", {
        method: "POST",
        body: form
      });

      ids.push(product.id);
    }

    await refreshStore();

    for (const id of ids) {
      await generate(
        id,
        document.querySelector(`[data-id="${id}"] [data-action="generate"]`)
      );
    }

    status("#add-status", "Products added. Review the content before publishing.");
  } catch (error) {
    status("#add-status", error.message);

    // Successfully saved products remain recoverable after partial failure.
    await refreshStore().catch(() => {});
  } finally {
    input.disabled = false;
    input.value = "";
  }
});

$("#add-about").addEventListener("click", async event => {
  await withBusy(event.currentTarget, async () => {
    try {
      const form = new FormData();
      form.set("kind", "about");

      await api("/api/products", {
        method: "POST",
        body: form
      });

      await refreshStore();
      toast("About you section added.");
    } catch (error) {
      status("#add-status", error.message);
    }
  });
});

$("#delete-store").addEventListener("click", async event => {
  const confirmation = prompt(
    `This permanently deletes your storefront and images.\nType ${state.store.slug} to continue.`
  );

  if (confirmation === null) return;

  await withBusy(event.currentTarget, async () => {
    status("#settings-status", "Deleting storefront and stored images…");

    try {
      const result = await api("/api/store", {
        method: "DELETE",
        body: { confirm: confirmation },
        timeout: 60000
      });

      location.href = result.url;
    } catch (error) {
      status(
        "#settings-status",
        `${error.message} If deletion was interrupted, retry this action.`
      );
    }
  });
});

// ---------- Conversation ----------

$("#chat-form").addEventListener("submit", async event => {
  event.preventDefault();

  if (state.chatBusy) return;

  const value = $("#chat-input").value.trim();
  if (!value) return;

  const session = state.chatSession;

  state.chatBusy = true;
  $("#chat-input").disabled = true;
  $("#chat-form button").disabled = true;

  addChatMessage("user", value);
  $("#chat-input").value = "";

  status("#chat-status", "Reviewing the product details and your question…");

  try {
    const result = await api("/api/chat", {
      method: "POST",
      body: {
        productId: state.chatProduct.id,
        messages: state.chatMessages.slice(-11)
      }
    });

    if (session !== state.chatSession) return;

    addChatMessage("assistant", result.reply);
    status("#chat-status", "Conversation context updated for your next question.");
  } catch (error) {
    if (session !== state.chatSession) return;

    // Remove the failed request from future AI context, but retain its bubble.
    state.chatMessages.pop();

    $("#chat-input").value = value;
    status("#chat-status", `${error.message} Your question is ready to retry.`);
  } finally {
    if (session === state.chatSession) {
      state.chatBusy = false;
      $("#chat-input").disabled = false;
      $("#chat-form button").disabled = false;
      $("#chat-input").focus();
    }
  }
});

// ---------- Boot ----------

async function boot() {
  try {
    $("#loading").textContent = "Connecting to storefront services…";

    // Starts immediately on page load, before the seller opens signup.
    await loadBootstrap();

    if (state.boot.tenant) {
      await loadStore();
    } else {
      $("#home").hidden = false;

      startCountdown();
      startDemo();

      await loadFeatured();
    }

    $("#loading").hidden = true;

    if (
      !state.boot.tenant &&
      new URLSearchParams(location.search).has("seller")
    ) {
      history.replaceState({}, "", "/");
      startSellerFlow();
    }

    if (state.owner && !state.store.deleting) {
      // Let the storefront render before generation begins.
      setTimeout(generatePending, 150);
    }
  } catch (error) {
    $("#loading").hidden = true;
    $("#fatal").hidden = false;
    $("#fatal-message").textContent = error.message;

    if (state.boot?.tenant) {
      $("#signin-button").hidden = false;
      $("#signin-button").textContent = "Owner sign in";
    }
  }
}

window.addEventListener("pagehide", clearPreviews);

boot();
