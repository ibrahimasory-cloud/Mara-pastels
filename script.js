"use strict";

const { orderItems, products, events, whatsappSource } = maraPastel;
const orderForm = document.querySelector("#order-form");
const orderFields = document.querySelector("#order-fields");
const orderSubmit = document.querySelector("#go");
const orderError = document.querySelector("#er");
const orderAvailability = document.querySelector("#order-availability");
const orderAmount = document.querySelector("#pr");
const orderSuccess = document.querySelector("#order-success");
const orderWhatsApp = document.querySelector("#order-whatsapp");
const motionPreference = window.matchMedia("(prefers-reduced-motion: no-preference)");
let settings = maraSiteSettings();
let catalogRevision = null;
let attempt;
let amountAnimation;

function whatsappUrl(message) {
  const url = new URL(`https://wa.me/${settings.whatsappNumber}`);
  url.searchParams.set("text", `${message}\n\n${whatsappSource}`);
  return url.href;
}

function quantityControl(item) {
  const row = document.createElement("div");
  row.className = "line";
  const label = document.createElement("label");
  label.htmlFor = `quantity-${item.id}`;
  label.textContent = item.product === "mini" ? item.name.replace("Mini pastels ", "") : item.name;
  const controls = document.createElement("div");
  controls.className = "qty";
  const input = document.createElement("input");
  input.id = label.htmlFor;
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.max = "2147483647";
  input.step = "1";
  input.value = "0";
  input.setAttribute("aria-label", item.name);
  const buttons = [-1, 1].map((delta) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = delta === 1 ? "+" : "−";
    button.setAttribute("aria-label", `${delta === 1 ? "Ajouter" : "Retirer"} · ${item.name}`);
    button.addEventListener("click", () => {
      const quantity = Math.trunc(input.valueAsNumber) || 0;
      input.value = Math.min(Number(input.max), Math.max(0, quantity + delta));
      updateOrder();
    });
    return button;
  });
  input.addEventListener("input", updateOrder);
  controls.append(buttons[0], input, buttons[1]);
  row.append(label, controls);
  document.querySelector(`#${item.product}-quantities`).append(row);
  return { ...item, input, label };
}

const quantityControls = orderItems.filter(({ product }) => product !== "sauce").map(quantityControl);

function selectedQuantities() {
  const quantities = {};
  for (const { id, input, product } of quantityControls) {
    const amount = input.validity.valid ? input.valueAsNumber || 0 : 0;
    quantities[id] = settings[`${product}Available`] ? amount : 0;
  }
  quantities.sauce = settings.sauceAvailable && orderForm.elements.sauce.checked ? 1 : 0;
  return quantities;
}

function updateOrder() {
  const { chicken, meat, tuna, king, sauce } = selectedQuantities();
  const mini = chicken + meat + tuna;
  const total = mini * settings.miniPrice + king * settings.kingPrice + sauce * (settings.saucePrice ?? 0);
  const amount = Number.isSafeInteger(total) ? formatPrice(total) : "—";
  const amountChanged = orderAmount.value !== amount;
  orderAmount.value = amount;
  orderError.hidden = true;
  if (amountChanged && document.body.classList.contains("motion-scrolling") &&
      motionPreference.matches && typeof orderAmount.animate === "function") {
    amountAnimation?.cancel();
    amountAnimation = orderAmount.animate(
      [{ transform: "translateY(5px) scale(.96)" }, { transform: "none" }],
      { duration: 420, easing: "cubic-bezier(.2, .75, .25, 1)" }
    );
  }
}

motionPreference.addEventListener?.("change", (event) => {
  if (!event.matches) amountAnimation?.cancel();
});

function showOrderError(message) {
  orderError.textContent = message;
  orderError.hidden = false;
}

orderForm.elements.sauce.addEventListener("change", updateOrder);
for (const input of [orderForm.elements.firstName, orderForm.elements.lastName, orderForm.elements.deliveryAddress]) {
  input.addEventListener("input", () => input.setCustomValidity(""));
}

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (orderSubmit.disabled || catalogRevision === null) return;
  const quantities = selectedQuantities();
  const mini = quantities.chicken + quantities.meat + quantities.tuna;
  if (mini > 0 && mini < settings.miniMinimum) {
    showOrderError(`Les mini pastels se commandent à partir de ${settings.miniMinimum} pièces. Il vous en manque ${settings.miniMinimum - mini}.`);
    quantityControls[0].input.focus();
    return;
  }
  if (!mini && !quantities.king) {
    showOrderError("Choisissez des mini pastels ou un Pastel King. La sauce est un accompagnement.");
    return;
  }
  const { firstName, lastName, deliveryAddress, deliveryDay } = orderForm.elements;
  for (const field of [firstName, lastName, deliveryAddress]) {
    if (field.value.trim()) continue;
    field.setCustomValidity("Veuillez renseigner ce champ.");
    field.reportValidity();
    return;
  }
  if (orderAmount.value === "—") {
    showOrderError("La quantité totale dépasse celle que le formulaire peut traiter.");
    return;
  }

  const payload = {
    p_revision: catalogRevision,
    p_first_name: firstName.value.trim(),
    p_last_name: lastName.value.trim(),
    p_address: deliveryAddress.value.trim(),
    p_delivery_day: deliveryDay.value,
    p_quantities: quantities
  };
  const fingerprint = JSON.stringify(payload);
  if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, id: crypto.randomUUID() };
  orderFields.disabled = true;
  orderSubmit.disabled = true;
  orderSubmit.lastChild.textContent = " Enregistrement…";
  orderError.hidden = true;
  try {
    const saved = await maraRequest("/rest/v1/rpc/mara_submit_order", {
      method: "POST",
      body: { ...payload, p_request_id: attempt.id }
    });
    if (!saved?.reference || !Array.isArray(saved.items) || !Number.isSafeInteger(saved.subtotal_gnf)) {
      throw new Error("Réponse de commande incomplète");
    }
    const message = [
      `Bonjour Mara Pastel, voici ma demande ${saved.reference} :`,
      ...saved.items.map((item) => `– ${item.name} × ${item.quantity}${item.unit_price === null ? " (prix à confirmer)" : ""}`),
      "",
      `Sous-total des produits : ${formatPrice(saved.subtotal_gnf)}`,
      ...(saved.sauce_pending ? ["Prix de la sauce à confirmer."] : []),
      "Frais de livraison à confirmer.",
      `Jour de livraison souhaité : ${payload.p_delivery_day}`,
      `Client : ${payload.p_first_name} ${payload.p_last_name}`,
      `Adresse : ${payload.p_address}`
    ];
    orderWhatsApp.href = whatsappUrl(message.join("\n"));
    document.querySelector("#order-success-text").textContent =
      `Référence ${saved.reference}. Envoyez le message dans WhatsApp pour que Mara Pastel confirme votre commande.`;
    orderFields.hidden = true;
    orderSuccess.hidden = false;
    orderWhatsApp.focus();
    window.location.assign(orderWhatsApp.href);
  } catch (error) {
    showOrderError(error.status === 409
      ? "Le menu a changé. Rechargez la page pour afficher les nouveaux prix avant de commander."
      : "La demande n’a pas pu être enregistrée. Réessayez avant d’ouvrir WhatsApp.");
  } finally {
    orderFields.disabled = false;
    orderSubmit.disabled = false;
    orderSubmit.lastChild.textContent = " Enregistrer et ouvrir WhatsApp";
  }
});

document.querySelector("#new-order").addEventListener("click", () => {
  orderForm.reset();
  attempt = undefined;
  orderSuccess.hidden = true;
  orderFields.hidden = false;
  updateOrder();
  orderForm.elements.firstName.focus();
});

function applyOrderingSettings(next, revision) {
  settings = next;
  catalogRevision = Number.isSafeInteger(revision) ? revision : null;
  orderSubmit.disabled = catalogRevision === null || (!settings.miniAvailable && !settings.kingAvailable);

  for (const { id, name } of products) {
    const card = document.querySelector(`[data-product="${id}"]`);
    const label = card.querySelector("h3").textContent.trim() || name;
    const rate = card.querySelector("[data-rate]");
    const note = card.querySelector("[data-product-note]");
    const group = document.querySelector(`[data-order-product="${id}"]`);
    const available = settings[`${id}Available`] && (id !== "sauce" || settings.miniAvailable || settings.kingAvailable);
    group.hidden = !available;
    group.disabled = !available;
    if (id === "sauce") group.querySelector("input").disabled = !available;

    if (!available) {
      rate.textContent = "Indisponible";
    } else if (id === "mini") {
      rate.textContent = `${formatPrice(settings.miniPrice * settings.miniMinimum)} les ${settings.miniMinimum}`;
      note.textContent = `Commande à partir de ${settings.miniMinimum} pièces, garnitures au choix.`;
      group.querySelector("legend").textContent = label;
    } else if (id === "king") {
      rate.textContent = `${formatPrice(settings.kingPrice)} la pièce`;
      group.querySelector("legend").textContent = label;
      quantityControls.find(({ id }) => id === "king").label.textContent = "Nombre de pièces";
    } else {
      rate.textContent = settings.saucePrice === null ? "Prix confirmé sur WhatsApp" : formatPrice(settings.saucePrice);
    }
  }
  document.querySelector("#mini-rule").textContent = `Minimum de ${settings.miniMinimum} mini pastels par commande, toutes garnitures confondues.`;
  document.querySelector("#sauce-order-price").textContent = settings.saucePrice === null
    ? "(prix à confirmer sur WhatsApp)" : `(${formatPrice(settings.saucePrice)})`;
  document.querySelector("#faq-minimum").textContent =
    `Le minimum de ${settings.miniMinimum} s’applique uniquement aux mini pastels. Vous pouvez commander un seul Pastel King.`;
  document.querySelectorAll("[data-setting]").forEach((entry) => {
    const text = settings[entry.dataset.setting];
    if (typeof text === "string") entry.textContent = text;
  });
  document.querySelector("#payment-info").hidden = !settings.payment;
  for (const name of ["facebook", "tiktok"]) {
    const listItem = document.querySelector(`#social-${name}`);
    const url = maraSocialUrl(settings[name], `${name}.com`);
    listItem.hidden = !url;
    if (url) listItem.querySelector("a").href = url;
  }
  const defaultMessage = "Bonjour Mara Pastel, j’aimerais des renseignements.";
  document.querySelectorAll('a[href^="https://wa.me/"]').forEach((link) => {
    link.href = whatsappUrl(defaultMessage);
  });
  const phone = document.querySelector('a[href^="tel:"]');
  phone.href = `tel:+${settings.whatsappNumber}`;
  phone.textContent = `+${settings.whatsappNumber.replace(/^224(\d{3})(\d{2})(\d{2})(\d{2})$/, "224 $1 $2 $3 $4")}`;
  updateOrder();
  orderAvailability.hidden = settings.miniAvailable || settings.kingAvailable;
  orderAvailability.textContent = "Le menu est temporairement indisponible. Contactez-nous sur WhatsApp.";
}

applyOrderingSettings(settings, null);
if ("IntersectionObserver" in window) {
  const blockingSections = new Set();
  const floatingButton = document.querySelector(".fab");
  const buttonObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) blockingSections.add(entry.target);
      else blockingSections.delete(entry.target);
    }
    floatingButton.hidden = blockingSections.size > 0;
  });
  buttonObserver.observe(document.querySelector("#accueil"));
  buttonObserver.observe(orderForm);
}

const menuButton = document.querySelector(".burger");
const menu = document.querySelector("#menu");

function setMenuOpen(open) {
  menu.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
}

menuButton.addEventListener("click", () => setMenuOpen(menu.hidden));
menu.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenuOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !menu.hidden) {
    setMenuOpen(false);
    menuButton.focus();
  }
});

const gallery = document.querySelector("#galerie");
const albums = document.querySelector("#albums");
const dialog = document.querySelector("#dlg");
let queueAlbumReveal;
function renderGallery(events) {
  albums.replaceChildren();
  gallery.hidden = events.length === 0;
  document.querySelector("#galerie-vide").hidden = events.length > 0;
  document.querySelectorAll('a[href="#galerie"]').forEach((link) => {
    (link.closest("li") || link).hidden = gallery.hidden;
  });

  events.forEach(({ nom, date, lieu, photos }) => {
    const album = document.createElement("button");
    album.type = "button";
    album.className = "album";

    const cover = new Image();
    cover.loading = "lazy";
    cover.decoding = "async";
    cover.src = photos[0];
    cover.alt = "";
    const caption = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = nom;
    const details = document.createElement("span");
    details.textContent = [date, `${photos.length} photo${photos.length > 1 ? "s" : ""}`].filter(Boolean).join(" – ");
    caption.append(title, details);
    album.append(cover, caption);
    album.addEventListener("click", () => {
      dialog.querySelector("#dt").textContent = nom;
      dialog.querySelector("#dm").textContent = [date, lieu].filter(Boolean).join(" – ");
      dialog.querySelector("#dp").replaceChildren(...photos.map((src) => {
        const image = new Image();
        image.src = src;
        image.alt = nom;
        return image;
      }));
      dialog.showModal();
    });
    albums.append(album);
    queueAlbumReveal?.(album);
  });
}

renderGallery(events);

dialog.querySelector("#x").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

function applySiteContent(content, revision) {
  document.querySelectorAll("[data-mara-text]").forEach((element) => {
    const text = content.texts?.[element.dataset.maraText];
    if (typeof text === "string" && text.trim()) element.textContent = text;
  });
  document.querySelectorAll("[data-mara-image]").forEach((image) => {
    const source = content.images?.[image.dataset.maraImage];
    const url = maraMediaUrl(source?.path);
    if (!url) return;
    const icon = image.closest(".shot")?.querySelector("svg");
    if (icon) {
      icon.setAttribute("hidden", "");
      image.addEventListener("error", () => {
        image.hidden = true;
        icon.removeAttribute("hidden");
      }, { once: true });
    }
    image.src = url;
    image.alt = typeof source.alt === "string" ? source.alt.trim() : "";
    image.hidden = false;
  });
  applyOrderingSettings(maraSiteSettings(content.settings), revision);

  if (Array.isArray(content.events)) {
    const publishedEvents = content.events
      .filter((event) => event?.nom && Array.isArray(event.photos))
      .map((event) => ({ ...event, photos: event.photos.map(maraMediaUrl).filter(Boolean) }))
      .filter((event) => event.photos.length);
    renderGallery(publishedEvents);
  }
}

async function showPublishedSite() {
  if (new URLSearchParams(location.search).get("apercu") === "1") {
    try {
      const draft = JSON.parse(sessionStorage.getItem("mara-site-preview") || "null");
      if (draft) {
        document.querySelector("#preview-notice").hidden = false;
        applySiteContent(draft, null);
        return;
      }
    } catch {
      // Use the published content if the preview is missing or unavailable.
    }
  }
  if (!maraProject) throw new Error("Supabase indisponible");
  const [published] = await maraRequest(`${maraSitePath}&select=content,revision`);
  if (!published) throw new Error("Catalogue indisponible");
  applySiteContent(published.content, published.revision);
}

const loadingBar = document.querySelector(".site-loading");
const loadingStatus = document.querySelector("#site-loading-status");
const heroImage = document.querySelector('[data-mara-image="hero"]');
const showLoading = window.setTimeout(() => {
  loadingBar.classList.add("is-loading");
  loadingStatus.textContent = "Chargement de la vitrine…";
}, 150);

showPublishedSite()
  .catch(() => {
    orderAvailability.textContent = "Le formulaire est temporairement indisponible. Vous pouvez nous écrire sur WhatsApp.";
    orderAvailability.hidden = false;
  })
  .then(() => heroImage.decode?.().catch(() => {}))
  .finally(() => {
    window.clearTimeout(showLoading);
    loadingBar.classList.remove("is-loading");
    loadingStatus.textContent = "";
  });

function prepareScrollMotion() {
  if (!motionPreference.matches) return;
  const pending = new Set();
  let previousScroll = window.scrollY;
  let frame = null;

  function finishReveal(target) {
    pending.delete(target);
    target.classList.remove("motion-pending", "motion-enter");
  }

  function revealInView() {
    frame = null;
    const viewportHeight = window.innerHeight;
    const atEnd = window.scrollY + viewportHeight >= document.documentElement.scrollHeight - 2;
    const entryLine = atEnd ? viewportHeight : viewportHeight * .78;
    const visible = [];
    for (const target of pending) {
      if (!target.isConnected) {
        pending.delete(target);
        continue;
      }
      const bounds = target.getBoundingClientRect();
      if (bounds.height > 0 && bounds.top < entryLine && bounds.bottom > 0) visible.push(target);
    }
    for (const target of visible) {
      pending.delete(target);
      target.classList.replace("motion-pending", "motion-enter");
    }
  }

  function scheduleReveal() {
    if (frame === null && pending.size && document.body.classList.contains("motion-scrolling")) {
      frame = window.requestAnimationFrame(revealInView);
    }
  }

  function queueReveal(target) {
    if (!motionPreference.matches) return;
    const { top, bottom, height } = target.getBoundingClientRect();
    const hasScrolled = document.body.classList.contains("motion-scrolling");
    if (!hasScrolled && height > 0 && bottom > 0 && top < window.innerHeight) return;
    pending.add(target);
    target.classList.add("motion-pending");
    scheduleReveal();
  }

  document.querySelectorAll(
    "main .head, main .grid > :is(article, .album), .about > *, .faq details, .cta"
  ).forEach(queueReveal);
  queueAlbumReveal = queueReveal;

  document.addEventListener("animationend", (event) => {
    if (event.target.classList.contains("motion-enter")) finishReveal(event.target);
  });
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest(".motion-pending, .motion-enter");
    if (target) finishReveal(target);
  });
  motionPreference.addEventListener?.("change", (event) => {
    if (event.matches) return;
    document.querySelectorAll(".motion-pending, .motion-enter").forEach(finishReveal);
  });

  // Native anchor navigation can emit a scroll event for the position already shown at launch.
  window.addEventListener("scroll", () => {
    if (window.scrollY === previousScroll || !motionPreference.matches) return;
    previousScroll = window.scrollY;
    document.body.classList.add("motion-scrolling");
    scheduleReveal();
  }, { passive: true });
  window.addEventListener("resize", scheduleReveal);
}

if (document.readyState === "complete") prepareScrollMotion();
else window.addEventListener("pageshow", prepareScrollMotion, { once: true });
