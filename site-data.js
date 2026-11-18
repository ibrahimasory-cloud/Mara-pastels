"use strict";

const maraFields = [
  {
    title: "Accueil et photo principale",
    texts: [
      ["hero.title", "Titre", "La saveur qui rassemble", 100],
      ["hero.body", "Présentation", "Mara Pastel prépare des pastels faits maison, farcis au poulet, au thon ou à la viande. Pour un repas à emporter comme pour un événement, nous livrons votre commande.", 500]
    ],
    image: "hero"
  },
  ...maraPastel.fillings.map(({ id, name }, index) => ({
    title: `Fiche ${name}`,
    texts: [
      [`product.${id}.title`, "Nom de la garniture", name, 60],
      [`product.${id}.body`, "Description", [
        "Pastel fait maison, farci au poulet.",
        "Pastel fait maison, farci au thon.",
        "Pastel fait maison, farci à la viande."
      ][index], 300]
    ],
    image: `product.${id}`
  })),
  {
    title: "Notre histoire",
    texts: [
      ["story.title", "Titre", "Notre histoire", 100],
      ["story.intro", "Premier paragraphe", "Mara Pastel est une marque de restauration snacking spécialisée dans les pastels. Chaque pastel est fait maison, farci au poulet, au thon ou à la viande, puis livré chez vous.", 800],
      ["story.body", "Second paragraphe", "Notre ambition est simple : partager une saveur qui rassemble, du repas entre amis aux grands événements. Nous sommes installés à Kipé, à Conakry.", 800]
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
