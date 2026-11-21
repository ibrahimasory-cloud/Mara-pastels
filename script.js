"use strict";

const { whatsappNumber, phoneLabel, minimumQuantity, unitPrice, fillings, events, whatsappSource } = maraPastel;
const priceFormatter = new Intl.NumberFormat("fr-FR");
const orderForm = document.querySelector("#order-form");
const quantityError = document.querySelector("#er");
const orderCount = document.querySelector("#np");
const orderAmount = document.querySelector("#pr");
const motionPreference = window.matchMedia("(prefers-reduced-motion: no-preference)");
let amountAnimation;

function formatPrice(price) {
  return `${priceFormatter.format(price)} GNF`;
}

function formatQuantity(quantity) {
  return `${quantity} pastel${quantity > 1 ? "s" : ""}`;
}

function whatsappUrl(message) {
  const url = new URL(`https://wa.me/${whatsappNumber}`);
  url.searchParams.set("text", `${message}\n\n${whatsappSource}`);
  return url.href;
}

const quantityControls = fillings.map(({ id, name }) => {
  const row = document.querySelector(`[data-filling="${id}"]`);
  const input = row.querySelector("input");
  const [decrease, increase] = row.querySelectorAll("button");
  row.querySelector("label").textContent = name;

  function changeQuantity(delta) {
    const quantity = Math.trunc(input.valueAsNumber) || 0;
    input.value = Math.min(Number(input.max), Math.max(0, quantity + delta));
    updateOrder();
  }

  decrease.addEventListener("click", () => changeQuantity(-1));
  increase.addEventListener("click", () => changeQuantity(1));
  input.addEventListener("input", updateOrder);
  return { id, name, input, row, decrease, increase };
});

function orderQuantities() {
  return quantityControls.map(({ name, input }) => ({
    name,
    quantity: input.validity.valid ? input.valueAsNumber || 0 : 0
  }));
}

function totalQuantity(items) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function updateOrder() {
  const quantity = totalQuantity(orderQuantities());
  const amount = formatPrice(quantity * unitPrice);
  const amountChanged = orderAmount.value !== amount;
  orderCount.textContent = formatQuantity(quantity);
  orderAmount.value = amount;
  quantityError.hidden = true;

  if (amountChanged && document.body.classList.contains("motion-scrolling") &&
    motionPreference.matches && typeof orderAmount.animate === "function") {
    amountAnimation?.cancel();
    amountAnimation = orderAmount.animate([
      { transform: "translateY(5px) scale(.96)", opacity: .7 },
      { transform: "translateY(-2px) scale(1.04)", offset: .62 },
      { transform: "none", opacity: 1 }
    ], { duration: 420, easing: "cubic-bezier(.2, .75, .25, 1)" });
  }
}

motionPreference.addEventListener("change", (event) => {
  if (!event.matches) amountAnimation?.cancel();
});

const addressInput = orderForm.elements.deliveryAddress;
addressInput.addEventListener("input", () => addressInput.setCustomValidity(""));

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const items = orderQuantities();
  const quantity = totalQuantity(items);
  if (quantity < minimumQuantity) {
    quantityError.textContent = `Le minimum est de ${formatQuantity(minimumQuantity)}. Il vous en manque ${minimumQuantity - quantity}.`;
    quantityError.hidden = false;
    quantityControls[0].input.focus();
    return;
  }

  const formData = new FormData(orderForm);
  const address = formData.get("deliveryAddress").trim();
  if (!address) {
    addressInput.setCustomValidity("Indiquez votre quartier de livraison.");
    addressInput.reportValidity();
    return;
  }

  const customerName = formData.get("customerName").trim();
  const message = [
    "Bonjour Mara Pastel, je souhaite commander :",
    ...items.filter(({ quantity }) => quantity > 0).map(({ name, quantity }) => `– ${name} : ${quantity}`),
    "",
    `Total des pastels : ${formatQuantity(quantity)} — ${formatPrice(quantity * unitPrice)}`,
    "Frais de livraison à confirmer.",
    `Jour de livraison souhaité : ${formData.get("deliveryDay")}`,
    `Adresse de livraison : ${address}`
  ];
  if (customerName) message.push(`Nom : ${customerName}`);
  window.location.assign(whatsappUrl(message.join("\n")));
});

const defaultMessage = "Bonjour Mara Pastel, je souhaite passer commande.";
document.querySelectorAll('a[href^="https://wa.me/"]').forEach((link) => {
  link.href = whatsappUrl(defaultMessage);
});
const phoneLink = document.querySelector('a[href^="tel:"]');
phoneLink.href = `tel:+${whatsappNumber}`;
phoneLink.textContent = phoneLabel;

const minimumPrice = minimumQuantity * unitPrice;
document.querySelector('[data-price="unit"]').firstChild.textContent = priceFormatter.format(unitPrice);
document.querySelector('[data-price="minimum"]').firstChild.textContent = priceFormatter.format(minimumPrice);
document.querySelector("#minimum-pack").textContent =
  `${formatQuantity(minimumQuantity)}, quantité minimale par commande.`;
document.querySelector("#faq-minimum").textContent =
  `Le lot minimum est de ${formatQuantity(minimumQuantity)}, soit ${formatPrice(minimumPrice)}. Le pastel coûte ${formatPrice(unitPrice)} à l’unité.`;
document.querySelector("#order-terms").textContent =
  `${formatPrice(unitPrice)} le pastel. Minimum de ${formatQuantity(minimumQuantity)} par commande. Frais de livraison confirmés sur WhatsApp.`;
updateOrder();
document.querySelector("#go").disabled = false;

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

async function showPublishedSite() {
  if (!maraProject) return;
  const [published] = await maraRequest(`${maraSitePath}&select=content`);
  const content = published?.content;
  if (!content) return;

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
  const chips = document.querySelectorAll(".chips span");
  quantityControls.forEach((control, index) => {
    const title = content.texts?.[`product.${control.id}.title`];
    if (typeof title !== "string" || !title.trim()) return;
    control.name = title;
    control.row.querySelector("label").textContent = title;
    control.input.setAttribute("aria-label", `Quantité de pastels — ${title}`);
    control.decrease.setAttribute("aria-label", `Retirer un pastel — ${title}`);
    control.increase.setAttribute("aria-label", `Ajouter un pastel — ${title}`);
    chips[index].textContent = title;
  });

  if (Array.isArray(content.events)) {
    const publishedEvents = content.events
      .filter((event) => event?.nom && Array.isArray(event.photos))
      .map((event) => ({ ...event, photos: event.photos.map(maraMediaUrl).filter(Boolean) }))
      .filter((event) => event.photos.length);
    renderGallery(publishedEvents);
  }
}

showPublishedSite().catch(() => {
  // La vitrine conserve le contenu local si Supabase est indisponible.
});

function prepareScrollMotion() {
  if (!motionPreference.matches || !("IntersectionObserver" in window)) return;
  const revealThreshold = .14;

  function finishReveal(target) {
    target.classList.remove("motion-pending", "motion-enter");
    revealObserver.unobserve(target);
  }

  const revealObserver = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting, intersectionRatio } of entries) {
      if (!target.isConnected) {
        finishReveal(target);
      } else if (isIntersecting && intersectionRatio >= revealThreshold) {
        target.classList.replace("motion-pending", "motion-enter");
        revealObserver.unobserve(target);
      }
    }
  }, { threshold: revealThreshold });

  function queueReveal(target) {
    if (!motionPreference.matches) return;
    const { top, bottom, height } = target.getBoundingClientRect();
    const hasScrolled = document.body.classList.contains("motion-scrolling");
    if (!hasScrolled && height > 0 && bottom > 0 && top < window.innerHeight) return;
    target.classList.add("motion-pending");
    if (hasScrolled) revealObserver.observe(target);
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
  motionPreference.addEventListener("change", (event) => {
    if (event.matches) return;
    document.querySelectorAll(".motion-pending, .motion-enter").forEach(finishReveal);
  });

  const initialScrollPosition = window.scrollY;
  // Native anchor navigation can emit a scroll event for the position already shown at launch.
  function startScrollMotion() {
    if (window.scrollY === initialScrollPosition) return;
    window.removeEventListener("scroll", startScrollMotion);
    document.body.classList.add("motion-scrolling");
    document.querySelectorAll(".motion-pending").forEach((target) => revealObserver.observe(target));
  }
  window.addEventListener("scroll", startScrollMotion, { passive: true });
}

if (document.readyState === "complete") prepareScrollMotion();
else window.addEventListener("pageshow", prepareScrollMotion, { once: true });
