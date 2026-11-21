"use strict";

const maraFields = [
  {
    title: "Accueil et photo principale",
    texts: [
      ["hero.title", "Titre", "La saveur qui rassemble", 100],
      ["hero.body", "Présentation", "Des mini pastels faits maison, un Pastel King grand format et notre sauce maison. Commandez sur WhatsApp et faites-vous livrer à Conakry.", 500]
    ],
    image: "hero"
  },
  ...maraPastel.products.map(({ id, name, description, photo }) => ({
    title: `Fiche « ${name} »`,
    texts: [
      [`product.${id}.title`, "Nom du produit", name, 60],
      [`product.${id}.body`, "Description", description, 300]
    ],
    image: photo
  })),
  {
    title: "Questions fréquentes",
    texts: [
      ["faq.fillings", "Garnitures", "Les mini pastels sont proposés au poulet, à la viande ou au thon. Vous pouvez mélanger les garnitures dans une même commande.", 500],
      ["faq.events", "Événements", "Pour une fête, une réunion ou une réception, contactez-nous sur WhatsApp avec la date et le nombre de personnes.", 500],
      ["faq.delivery", "Zone de livraison", "Indiquez votre quartier dans le formulaire. Nous confirmons la livraison et ses frais sur WhatsApp.", 500]
    ]
  },
  {
    title: "Notre histoire",
    texts: [
      ["story.title", "Titre", "Notre histoire", 100],
      ["story.intro", "Premier paragraphe", "Mara Pastel prépare des pastels faits maison à Kipé. Notre carte réunit des mini pastels, le Pastel King et notre sauce maison.", 800],
      ["story.body", "Second paragraphe", "Notre ambition est de partager une saveur qui rassemble, du repas entre amis aux grands événements. Nous sommes installés à Kipé, à Conakry.", 800]
    ],
    image: "story"
  }
];

const maraMediaBucket = "mara-media";
function isPublicMaraKey(key) {
  if (/^sb_publishable_[\w-]+$/.test(key)) return true;
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) return false;
  try {
    const payload = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).role === "anon";
  } catch {
    return false;
  }
}

const maraProject = /^https:\/\/[\w-]+\.supabase\.co\/?$/i.test(maraSupabase.url) &&
  isPublicMaraKey(maraSupabase.publicKey)
  ? maraSupabase.url.replace(/\/$/, "")
  : "";

function maraMediaUrl(path) {
  if (!maraProject || !/^[a-f0-9-]{36}\.(jpeg|png|webp)$/.test(path)) return "";
  return `${maraProject}/storage/v1/object/public/${maraMediaBucket}/${path}`;
}

async function maraRequest(path, { method = "GET", token, body, type, headers } = {}) {
  const response = await fetch(maraProject + path, {
    method,
    headers: {
      apikey: maraSupabase.publicKey,
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { "Content-Type": type || "application/json" }),
      ...headers
    },
    ...(body !== undefined && { body: type ? body : JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("Requête Supabase refusée.");
    error.status = response.status;
    error.code = data?.error_code ?? data?.code;
    throw error;
  }
  return data;
}

const maraSitePath = "/rest/v1/mara_site?id=eq.1";

const maraOrderPath = "/rest/v1/mara_orders";
const maraPriceFormatter = new Intl.NumberFormat("fr-FR");

function formatPrice(price) {
  return `${maraPriceFormatter.format(price)} GNF`;
}

function maraSiteSettings(values = {}) {
  const settings = { ...maraPastel.settings };
  for (const [key, fallback] of Object.entries(settings)) {
    const value = values?.[key];
    if (key === "saucePrice") {
      if (Number.isSafeInteger(value) && value >= 0 && value <= 2147483647) settings[key] = value;
    } else if (typeof fallback === "number") {
      if (Number.isSafeInteger(value) && value > 0 && value <= 2147483647) settings[key] = value;
    } else if (typeof fallback === typeof value) {
      settings[key] = typeof value === "string" ? value.trim() : value;
    }
  }
  if (!/^\d{8,15}$/.test(settings.whatsappNumber)) settings.whatsappNumber = maraPastel.settings.whatsappNumber;
  for (const key of ["orderHours", "deliveryHours", "deliveryArea"]) {
    if (!settings[key]) settings[key] = maraPastel.settings[key];
  }
  return settings;
}

function maraSocialUrl(address, domain) {
  try {
    const url = new URL(address);
    return url.protocol === "https:" && [domain, `www.${domain}`].includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}
