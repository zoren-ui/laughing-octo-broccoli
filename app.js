"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const products = [
  {
    id: "lamp",
    seller: "alder",
    sellerName: "Alder & Ash",
    subdomain: "alderandash",
    title: "The Stillwell lamp",
    hook: "A softer kind of light for the slower hours.",
    description: "Hand-thrown stoneware with a linen shade. Made in small batches, each base carries the quiet marks of the maker’s hands.",
    shopDescription: "A small collection of thoughtful things. Made slowly, for the places you call home.",
    price: "$248",
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85",
    alt: "Warm table lamp beside a book in a softly lit room"
  },
  {
    id: "vase",
    seller: "alder",
    sellerName: "Alder & Ash",
    subdomain: "alderandash",
    title: "Sunday vessel",
    hook: "For the branch you brought home on a whim.",
    description: "A sculptural vessel shaped and glazed by hand. Its generous opening is made for a few stems, or simply to sit beautifully on its own.",
    shopDescription: "A small collection of thoughtful things. Made slowly, for the places you call home.",
    price: "$86",
    image: "https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=900&q=85",
    alt: "Sculptural ceramic vase"
  },
  {
    id: "chair",
    seller: "forma",
    sellerName: "Forma Objects",
    subdomain: "formaobjects",
    title: "No. 04 lounge chair",
    hook: "A place to put the day down.",
    description: "Solid oak and natural woven cane meet in a simple, durable frame. Built to order in the Forma workshop.",
    shopDescription: "Useful objects. Honest materials. Furniture with room for everyday life.",
    price: "$920",
    image: "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=900&q=85",
    alt: "Modern chair in a light, neutral interior"
  },
  {
    id: "linen",
    seller: "field",
    sellerName: "Field Notes Studio",
    subdomain: "fieldnotesstudio",
    title: "Everyday linen throw",
    hook: "Easy comfort, wherever the afternoon goes.",
    description: "Soft washed linen woven from European flax. A quietly useful layer for the end of the bed, the sofa, or a picnic in the sun.",
    shopDescription: "Natural textures and soft edges. Small comforts for wherever the day takes you.",
    price: "$138",
    image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=85",
    alt: "Neutral-toned sofa in a calm living room"
  }
];

const state = {
  view: "marketplace",
  activeProducts: [],
  chatProduct: products[0],
  chatSession: 0,
  changed: false,
  toastTimer: null,
  objectURLs: new Map()
};

// Templates contain only static data or escaped text.
// Uploaded files are previewed locally and never transmitted.
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function scrollToSection(id) {
  const target = document.getElementById(id);
  const view = target?.closest(".view");
  if (!target || !view) return;

  const top =
    target.getBoundingClientRect().top -
    view.getBoundingClientRect().top +
    view.scrollTop;

  view.scrollTo({
    top,
    behavior: reducedMotion.matches ? "auto" : "smooth"
  });
}

function showView(id) {
  const next = document.getElementById(id);
  if (!next?.classList.contains("view")) return;

  $$("dialog[open]").forEach(dialog => dialog.close());

  $$(".view").forEach(view => {
    const active = view === next;
    view.hidden = !active;
    view.classList.toggle("active", active);
  });

  state.view = id;
  next.scrollTop = 0;
  next.focus({ preventScroll: true });
  updatePublishBar();
  syncDemo();
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
  dialog.showModal();
  syncDemo();
}

function notify(message) {
  const toast = $("#toast");
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
}

function updatePublishBar() {
  $("#publish-bar").hidden = !(state.changed && state.view === "dashboard");
}

function markChanged() {
  state.changed = true;
  updatePublishBar();
}

/* Marketplace and storefront */
function renderMarketplace() {
  $("#market-grid").innerHTML = products.map((product, index) => `
    <article class="market-card">
      <button class="market-image"
        data-store="${product.seller}"
        aria-label="Explore ${escapeHTML(product.title)} at ${escapeHTML(product.sellerName)}">
        <img src="${product.image}" alt="${escapeHTML(product.alt)}"
          loading="lazy" decoding="async" width="400" height="430">
        <span class="image-index">OBJECT / ${String(index + 1).padStart(2, "0")}</span>
      </button>
      <div class="market-card-info">
        <h3>${escapeHTML(product.title)}</h3>
        <div class="subdomain-label">${product.subdomain}.1tasi.com</div>
        <div class="sample-rating">
          <span aria-label="Illustrative five-star rating">★★★★★</span>
          <span>sample rating</span>
        </div>
        <div class="card-bottom">
          <span class="market-price">${product.price}</span>
          <button class="view-button" data-store="${product.seller}"
            aria-label="Visit ${escapeHTML(product.sellerName)}">Explore ↗</button>
        </div>
      </div>
    </article>
  `).join("");
}

function openStore(seller) {
  const selection = products.filter(product => product.seller === seller);
  if (!selection.length) return;

  state.activeProducts = selection;
  const first = selection[0];

  $("#store-name").textContent = first.sellerName;
  $("#store-domain").textContent = `${first.subdomain}.1tasi.com`;
  $("#store-description").textContent = first.shopDescription;
  $("#store-cover").src = first.image;
  $("#store-cover").alt = first.alt;
  $("#store-count").textContent =
    `${String(selection.length).padStart(2, "0")} ${selection.length === 1 ? "OBJECT" : "OBJECTS"}`;

  $("#store-product-list").innerHTML = selection.map((product, index) => `
    <section class="page-section store-product"
      aria-labelledby="product-title-${product.id}">
      <div class="product-photo">
        <img src="${product.image}" alt="${escapeHTML(product.alt)}"
          loading="lazy" decoding="async" width="800" height="900">
        <span>OBJECT / ${String(index + 1).padStart(2, "0")}</span>
      </div>
      <div class="product-copy">
        <div class="eyebrow">${escapeHTML(product.sellerName)} / THE COLLECTION</div>
        <div class="product-title-row">
          <h2 id="product-title-${product.id}">${escapeHTML(product.title)}</h2>
          <span class="price">${product.price}</span>
        </div>
        <p>${escapeHTML(product.description)}</p>
        <div class="product-actions">
          <button class="button button-dark" data-chat="${product.id}">
            Smart Order <span aria-hidden="true">↗</span>
          </button>
          <button class="icon-button" data-chat="${product.id}"
            aria-label="Ask about ${escapeHTML(product.title)}">i</button>
        </div>
        <p class="fine-print">SAMPLE PRODUCT / CONVERSATION PREVIEW / NO CHECKOUT</p>
      </div>
    </section>
  `).join("");

  showView("storefront");
}

/* Generated demo credentials: illustrative only, never persisted. */
function makeDemoPassword() {
  const values = new Uint32Array(2);
  window.crypto.getRandomValues(values);

  const words = ["fern", "moss", "moon", "linen", "clover", "studio", "olive"];
  const first = words[values[0] % words.length];
  const second = words[values[1] % words.length];
  const suffix = values[0].toString(36).slice(-4);

  return `${first}-${second}-${suffix}`;
}

async function copyPassword() {
  const input = $("#ai-password");
  const note = $("#onboarding-note");

  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(input.value);
    note.textContent = "Copied. This demo key is not connected to an account.";
    $("#copy-password").textContent = "Copied ✓";
    setTimeout(() => {
      $("#copy-password").textContent = "Copy ↗";
    }, 2200);
  } catch {
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    note.textContent =
      "Clipboard access is unavailable. The demo key is selected; copy it manually.";
  }
}

/* Local image previews */
function releaseObjectURL(key) {
  const existing = state.objectURLs.get(key);
  if (existing) {
    URL.revokeObjectURL(existing);
    state.objectURLs.delete(key);
  }
}

function previewImage(input, key, image, onSuccess) {
  const file = input.files?.[0];
  if (!file) return;

  const accepted = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ]);

  if (!accepted.has(file.type) || file.size > 8 * 1024 * 1024) {
    input.value = "";
    const message = "Choose a JPG, PNG, WebP or GIF image under 8 MB.";
    if (input.id === "onboarding-image") {
      $("#onboarding-note").textContent = message;
    } else {
      notify(message);
    }
    return;
  }

  const url = URL.createObjectURL(file);
  const probe = new Image();

  probe.onload = () => {
    releaseObjectURL(key);
    state.objectURLs.set(key, url);
    image.src = url;
    image.hidden = false;
    onSuccess?.(file);
  };

  probe.onerror = () => {
    URL.revokeObjectURL(url);
    input.value = "";
    const message = "That image could not be opened. Please choose another file.";
    if (input.id === "onboarding-image") {
      $("#onboarding-note").textContent = message;
    } else {
      notify(message);
    }
  };

  probe.src = url;
}

/* Workspace */
function renderDashboard() {
  $("#edit-products").innerHTML = products.map(product => `
    <article class="edit-card" data-product="${product.id}">
      <div class="edit-head">
        <strong class="edit-product-name">${escapeHTML(product.title)}</strong>
        <div class="edit-controls">
          <button class="mini" type="button" data-edit-action="pin"
            aria-label="Pin ${escapeHTML(product.title)}" aria-pressed="false">◇</button>
          <button class="mini" type="button" data-edit-action="up"
            aria-label="Move ${escapeHTML(product.title)} up">↑</button>
          <button class="mini" type="button" data-edit-action="down"
            aria-label="Move ${escapeHTML(product.title)} down">↓</button>
          <label class="live-toggle">
            <input type="checkbox" data-live checked>
            Live
          </label>
        </div>
      </div>
      <div class="edit-content">
        <label class="upload">
          <img src="${product.image}" alt="" loading="lazy" decoding="async">
          <span>Change product photo ↗</span>
          <input type="file" data-product-image
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="Choose image for ${escapeHTML(product.title)}">
        </label>
        <label class="field">
          <span>Product title</span>
          <input data-product-title value="${escapeHTML(product.title)}" maxlength="120">
        </label>
        <label class="field">
          <span>Description</span>
          <textarea maxlength="2000">${escapeHTML(product.description)}</textarea>
        </label>
        <div class="generate-row">
          <button class="button button-outline button-small"
            type="button" data-edit-action="generate">Simulate page generation ↗</button>
          <span class="generate-state" role="status">Local simulation · no AI connected</span>
        </div>
      </div>
    </article>
  `).join("");

  updateMoveControls();
}

function updateMoveControls() {
  const cards = $$("#edit-products > .edit-card");
  cards.forEach((card, index) => {
    $('[data-edit-action="up"]', card).disabled = index === 0;
    $('[data-edit-action="down"]', card).disabled = index === cards.length - 1;
  });
}

function moveCard(card, direction) {
  const sibling = direction < 0
    ? card.previousElementSibling
    : card.nextElementSibling;

  if (!sibling) return;

  if (direction < 0) {
    card.parentElement.insertBefore(card, sibling);
  } else {
    card.parentElement.insertBefore(sibling, card);
  }

  updateMoveControls();
  markChanged();
}

function generateMock(button) {
  const card = button.closest(".edit-card");
  const title = $("[data-product-title]", card).value.trim();
  const status = $(".generate-state", card);

  if (!title) {
    status.textContent = "Add a product title first, then try again.";
    $("[data-product-title]", card).focus();
    return;
  }

  button.disabled = true;
  button.textContent = "Preparing preview…";
  status.textContent = "Simulating layout and product-copy preparation…";

  setTimeout(() => {
    button.disabled = false;
    button.textContent = "Run simulation again ↗";
    status.textContent =
      `Preview step complete for “${title}”. No page or AI content was generated.`;
    markChanged();
  }, reducedMotion.matches ? 0 : 1000);
}

let generalItemCount = 0;

function addGeneralItem(initial = false) {
  const list = $("#general-items");

  if (list.children.length >= 3) {
    notify("Three story blocks is the limit for this preview.");
    return;
  }

  generalItemCount += 1;
  const key = `general-${generalItemCount}`;
  const item = document.createElement("article");
  item.className = "general-item";
  item.dataset.imageKey = key;
  item.innerHTML = `
    <label class="upload">
      <img alt="" hidden>
      <span>Add a story image ↗</span>
      <input type="file" data-general-image
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-label="Choose image for story block ${generalItemCount}">
    </label>
    <label class="field">
      <span>Story title</span>
      <input maxlength="120"
        placeholder="A little about the studio"
        value="${initial ? "A little about the studio" : ""}">
    </label>
    <label class="field">
      <span>Story text</span>
      <textarea maxlength="2000" placeholder="Tell visitors something worth knowing."></textarea>
    </label>
    <button class="text-button" type="button" data-remove-general>Remove block −</button>
  `;

  list.append(item);
  $("#add-general").disabled = list.children.length >= 3;
  if (!initial) {
    $("input:not([type='file'])", item).focus();
    markChanged();
  }
}

function checkSubdomain() {
  const value = $("#subdomain").value.trim();
  const status = $("#setup-status");
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 40;

  status.textContent = valid
    ? `“${value}.1tasi.com” passes this local format check. Availability has not been checked and nothing is reserved.`
    : "Use 1–40 lowercase letters, numbers or single hyphens between words.";
}

/* Scripted conversation: no model, order service or external request. */
function openChat(product = products[0]) {
  state.chatSession += 1;
  state.chatProduct = product;

  $("#chat-title").textContent = product.title;
  $("#messages").replaceChildren();
  $("#chat-input").value = "";
  closeChatPanel();

  openDialog("chat-dialog");
  addMessage(
    `A closer look at ${product.title}.\n\n${product.hook}\n\nAsk about the materials or how ordering would work. This is a scripted preview, not a live assistant.`,
    "assistant"
  );
}

function addMessage(text, type) {
  const message = document.createElement("div");
  message.className = `message${type === "user" ? " user" : ""}`;

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = type === "user" ? "YOU" : "FUNTASI / DEMO";

  message.append(label, document.createTextNode(text));
  $("#messages").append(message);

  const body = $("#chat-body");
  body.scrollTop = body.scrollHeight;
}

function scriptedReply(text) {
  const product = state.chatProduct;

  if (/\b(price|cost|much|discount|cheaper|offer)\b/i.test(text)) {
    return `The sample price is ${product.price}. Discounts and purchases aren’t available here; a real shop would need seller-confirmed pricing and checkout.`;
  }

  if (/\b(material|made|detail|fabric|wood|linen|ceramic|stoneware)\b/i.test(text)) {
    return `${product.description}\n\nThese are sample product details. Ask the maker to confirm specifications before a real purchase.`;
  }

  if (/\b(deliver|delivery|ship|shipping|track|arrival|arrive)\b/i.test(text)) {
    return "Delivery details would come from the seller. The Tracking tab shows illustrative status only; no parcel, address or delivery service is connected.";
  }

  if (/\b(order|buy|purchase|checkout|payment|pay|cart|bag)\b/i.test(text)) {
    return `In a live shop, this would be the next step toward ordering ${product.title}. Here, the bag is only a sample: no payment or order can be created.`;
  }

  if (/\b(size|dimension|wide|height|weight|measure)\b/i.test(text)) {
    return "Dimensions haven’t been supplied for this sample product. A live assistant should ask the maker rather than guess.";
  }

  if (/\b(hello|hi|hey|thanks|thank)\b/i.test(text)) {
    return "Hello, and welcome to this little corner. Try asking about materials, the sample price or how ordering would work.";
  }

  return `A good question for the maker. This preview only has scripted responses and the sample details for ${product.title}; it can’t verify anything beyond them. Try “What is it made from?” or “How does ordering work?”`;
}

function sendMessage(text) {
  const value = text.trim().slice(0, 600);
  if (!value) return;

  const session = state.chatSession;
  addMessage(value, "user");
  $("#chat-input").value = "";

  setTimeout(() => {
    if (session !== state.chatSession || !$("#chat-dialog").open) return;
    addMessage(scriptedReply(value), "assistant");
  }, reducedMotion.matches ? 0 : 450);
}

function closeChatPanel() {
  $("#chat-panel").hidden = true;
  $("#chat-panel").dataset.kind = "";
  $$("[data-panel]").forEach(button => button.setAttribute("aria-expanded", "false"));
}

function togglePanel(kind) {
  const panel = $("#chat-panel");

  if (!panel.hidden && panel.dataset.kind === kind) {
    closeChatPanel();
    return;
  }

  const product = state.chatProduct;
  const content = {
    cart: {
      title: "A little something in the bag.",
      lines: [product.title, `Quantity 1 · ${product.price}`, `Sample subtotal · ${product.price}`],
      note: "Illustrative bag only. No items are reserved and no checkout is connected."
    },
    account: {
      title: "Your little corner.",
      lines: ["Sample customer", "hello@example.com", "Saved details · not connected"],
      note: "These are fictional account details. No customer data is collected or saved."
    },
    tracking: {
      title: "On its way. In theory.",
      lines: ["Sample order #1048", "Illustrative status · preparing your parcel", "Estimated arrival · not available"],
      note: "No real order or tracking information is being retrieved."
    }
  }[kind];

  if (!content) return;

  panel.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = content.title;
  panel.append(heading);

  content.lines.forEach(line => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    panel.append(paragraph);
  });

  const note = document.createElement("small");
  note.textContent = content.note;
  panel.append(note);

  panel.dataset.kind = kind;
  panel.hidden = false;
  $$("[data-panel]").forEach(button => {
    button.setAttribute("aria-expanded", String(button.dataset.panel === kind));
  });
}

/* Creation demo: one timer, suspended offscreen or while a dialog is open. */
const demo = {
  step: 0,
  paused: false,
  visible: true,
  timer: null,
  typingTimer: null,
  character: 0
};

function setDemoStep(step) {
  demo.step = step;
  $$("[data-demo-pane]").forEach((pane, index) => {
    pane.classList.toggle("is-current", index === step);
  });
  $$(".demo-dots i").forEach((dot, index) => {
    dot.classList.toggle("active", index === step);
  });

  if (step === 0 && !reducedMotion.matches) {
    demo.character = 0;
    $("#demo-domain-text").textContent = "";
  } else {
    $("#demo-domain-text").textContent = "little-studio";
  }
}

function demoCanRun() {
  return !demo.paused &&
    !reducedMotion.matches &&
    demo.visible &&
    state.view === "marketplace" &&
    !document.hidden &&
    !$("dialog[open]");
}

function typeDemoDomain() {
  if (!demoCanRun() || demo.step !== 0) return;

  const name = "little-studio";
  if (demo.character >= name.length) return;

  demo.typingTimer = setTimeout(() => {
    if (!demoCanRun() || demo.step !== 0) return;
    demo.character += 1;
    $("#demo-domain-text").textContent = name.slice(0, demo.character);
    typeDemoDomain();
  }, 85);
}

function syncDemo() {
  clearTimeout(demo.timer);
  clearTimeout(demo.typingTimer);

  const running = demoCanRun();
  const container = $(".creation-demo");
  container.classList.toggle("demo-paused", demo.paused);
  container.classList.toggle("demo-offscreen", !running);

  const button = $("#demo-toggle");
  button.setAttribute("aria-pressed", String(demo.paused));
  button.setAttribute("aria-label", demo.paused
    ? "Resume shop creation demo"
    : "Pause shop creation demo");
  button.innerHTML = demo.paused
    ? 'Play <span aria-hidden="true">▷</span>'
    : 'Pause <span aria-hidden="true">Ⅱ</span>';

  if (reducedMotion.matches) {
    setDemoStep(3);
    button.hidden = true;
    return;
  }

  button.hidden = false;
  if (!running) return;

  typeDemoDomain();
  demo.timer = setTimeout(() => {
    setDemoStep((demo.step + 1) % 4);
    syncDemo();
  }, demo.step === 3 ? 3800 : 3000);
}

/* Delegated interaction keeps dynamic markup lightweight. */
document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.hasAttribute("data-home")) {
    if (state.view === "marketplace") {
      scrollToSection("home-hero");
    } else {
      showView("marketplace");
    }
    return;
  }

  if (button.dataset.view) return showView(button.dataset.view);
  if (button.dataset.dialog) return openDialog(button.dataset.dialog);
  if (button.dataset.scroll) return scrollToSection(button.dataset.scroll);
  if (button.dataset.store) return openStore(button.dataset.store);

  if (button.hasAttribute("data-close")) {
    button.closest("dialog")?.close();
    return;
  }

  if (button.dataset.chat) {
    const product = products.find(item => item.id === button.dataset.chat);
    if (product) openChat(product);
    return;
  }

  if (button.dataset.panel) return togglePanel(button.dataset.panel);
  if (button.dataset.message) return sendMessage(button.dataset.message);

  if (button.dataset.editAction) {
    const card = button.closest(".edit-card");
    const action = button.dataset.editAction;

    if (action === "up" || action === "down") {
      moveCard(card, action === "up" ? -1 : 1);
    } else if (action === "pin") {
      const pinned = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(pinned));
      button.textContent = pinned ? "◆" : "◇";
      markChanged();
    } else if (action === "generate") {
      generateMock(button);
    }
    return;
  }

  if (button.hasAttribute("data-remove-general")) {
    const item = button.closest(".general-item");
    releaseObjectURL(item.dataset.imageKey);
    item.remove();
    $("#add-general").disabled = false;
    $("#add-general").focus();
    markChanged();
  }
});

$("#dashboard").addEventListener("input", event => {
  if (!event.target.matches("input, textarea")) return;

  if (event.target.hasAttribute("data-product-title")) {
    const card = event.target.closest(".edit-card");
    $(".edit-product-name", card).textContent =
      event.target.value.trim() || "Untitled product";
  }

  markChanged();
});

$("#dashboard").addEventListener("change", event => {
  const input = event.target;

  if (input.hasAttribute("data-live")) {
    input.closest(".edit-card").classList.toggle("is-disabled", !input.checked);
    markChanged();
  }

  if (input.hasAttribute("data-product-image")) {
    const card = input.closest(".edit-card");
    previewImage(
      input,
      `product-${card.dataset.product}`,
      $(".upload img", card),
      markChanged
    );
  }

  if (input.hasAttribute("data-general-image")) {
    const item = input.closest(".general-item");
    previewImage(
      input,
      item.dataset.imageKey,
      $(".upload img", item),
      markChanged
    );
  }
});

$("#copy-password").addEventListener("click", copyPassword);

$("#onboarding-image").addEventListener("change", event => {
  previewImage(
    event.target,
    "onboarding",
    $("#onboarding-image-preview"),
    file => {
      $("#onboarding-file-label").textContent = file.name;
      $("#onboarding-note").textContent =
        "Photo preview ready. The image has not been uploaded.";
    }
  );
});

$("#onboarding-form").addEventListener("submit", event => {
  event.preventDefault();
  const domain = $("#onboarding-domain").value.trim();
  $("#subdomain").value = domain;
  showView("dashboard");
  $("#setup-status").textContent =
    `Workspace preview for ${domain}.1tasi.com. No shop, account or domain has been created.`;
  notify("Your demo workspace is open. Nothing has been published.");
});

$("#signin-form").addEventListener("submit", event => {
  event.preventDefault();
  event.target.reset();
  showView("dashboard");
  notify("Workspace preview only. You have not been signed in.");
});

$("#chat-form").addEventListener("submit", event => {
  event.preventDefault();
  sendMessage($("#chat-input").value);
});

$("#store-hero-action").addEventListener("click", () => {
  openChat(state.activeProducts[0]);
});

$("#store-end-action").addEventListener("click", () => {
  openChat(state.activeProducts[0]);
});

$("#preview-chat").addEventListener("click", () => openChat(products[0]));
$("#whatsapp").addEventListener("click", () => openDialog("contact-dialog"));
$("#check-subdomain").addEventListener("click", checkSubdomain);
$("#add-general").addEventListener("click", () => addGeneralItem());

$("#demo-passkey").addEventListener("click", () => {
  $("#setup-status").textContent = $("#passkey").value.trim()
    ? "Passkey step preview complete. No WebAuthn request, verification or account creation occurred."
    : "Enter any demo text first. This placeholder does not verify a real passkey.";
});

$("#publish-demo").addEventListener("click", () => {
  state.changed = false;
  updatePublishBar();
  notify("Publish step simulated. No changes were saved or uploaded.");
});

$("#demo-toggle").addEventListener("click", () => {
  demo.paused = !demo.paused;
  syncDemo();
});

$$("dialog").forEach(dialog => {
  // Clicking the backdrop closes; clicking padding inside does not.
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;

    const bounds = dialog.getBoundingClientRect();
    const outside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (outside) dialog.close();
  });

  dialog.addEventListener("close", () => {
    if (dialog.id === "chat-dialog") {
      state.chatSession += 1;
      closeChatPanel();
    }
    syncDemo();
  });
});

document.addEventListener("visibilitychange", syncDemo);

reducedMotion.addEventListener("change", () => {
  setDemoStep(reducedMotion.matches ? 3 : 0);
  syncDemo();
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(entries => {
    demo.visible = entries[0].isIntersecting;
    syncDemo();
  }, {
    root: $("#marketplace"),
    threshold: 0.2
  });

  observer.observe($(".creation-demo"));
}

window.addEventListener("pagehide", () => {
  clearTimeout(demo.timer);
  clearTimeout(demo.typingTimer);
  state.objectURLs.forEach(url => URL.revokeObjectURL(url));
  state.objectURLs.clear();
});

/* Boot */
renderMarketplace();
renderDashboard();
addGeneralItem(true);
$("#ai-password").value = makeDemoPassword();
setDemoStep(reducedMotion.matches ? 3 : 0);
syncDemo();
