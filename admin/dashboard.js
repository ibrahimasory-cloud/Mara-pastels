"use strict";

const dashboardPeriod = document.querySelector("#dashboard-period");
const refreshDashboard = document.querySelector("#refresh-dashboard");
const dashboardStatus = document.querySelector("#dashboard-status");
const dashboardResults = document.querySelector("#dashboard-results");
const activityChart = document.querySelector("#activity-chart");
const activityBars = document.querySelector("#activity-bars");
const productComparison = document.querySelector("#product-comparison");
const countFormat = new Intl.NumberFormat("fr-GN");
const shortDay = new Intl.DateTimeFormat("fr-GN", { day: "numeric", month: "short", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("fr-GN", { month: "short", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("fr-GN", { dateStyle: "full", timeZone: "UTC" });
const fullMonth = new Intl.DateTimeFormat("fr-GN", { month: "long", year: "numeric", timeZone: "UTC" });
let dashboardNeedsRefresh = true;
let dashboardRequest = 0;

function countLabel(count, singular, plural = singular + "s") {
  return `${countFormat.format(count)} ${count > 1 ? plural : singular}`;
}

function dayOffset(date, offset) {
  const day = new Date(date);
  day.setUTCDate(day.getUTCDate() + offset);
  return day;
}

function activeProductTotals(records) {
  const totals = { mini: { orders: 0, pieces: 0 }, king: { orders: 0, pieces: 0 } };
  let active = 0;
  for (const order of records) {
    active++;
    const { chicken = 0, meat = 0, tuna = 0, king = 0 } = order.quantities ?? {};
    const mini = Number(chicken) + Number(meat) + Number(tuna);
    if (mini > 0) {
      totals.mini.orders++;
      totals.mini.pieces += mini;
    }
    if (Number(king) > 0) {
      totals.king.orders++;
      totals.king.pieces += Number(king);
    }
  }
  return { ...totals, active };
}

function renderProductComparison(records) {
  const { mini, king, active } = activeProductTotals(records);
  productComparison.replaceChildren();
  for (const [key, name, totals] of [["mini", "Mini pastels", mini], ["king", "Pastel King", king]]) {
    const row = node("div", "", "comparison-row");
    row.dataset.product = key;
    const meta = node("div", "", "comparison-meta");
    const share = active ? Math.round(totals.orders / active * 100) : 0;
    meta.append(node("strong", name), node("span", `${countLabel(totals.orders, "demande")} · ${share} %`));
    const track = node("div", "", "comparison-track");
    track.setAttribute("aria-hidden", "true");
    const fill = node("span", "", "comparison-fill");
    fill.style.setProperty("--share", `${share}%`);
    track.append(fill);
    row.append(meta, track, node("p", countLabel(totals.pieces, "pièce"), "comparison-pieces"));
    productComparison.append(row);
  }

  const insight = document.querySelector("#product-insight");
  if (!active || (!mini.orders && !king.orders)) {
    insight.textContent = "Aucune demande avec un de ces produits sur la période.";
  } else if (mini.orders === king.orders) {
    insight.textContent = "Les deux produits figurent dans autant de demandes.";
  } else {
    insight.textContent = mini.orders > king.orders
      ? "Les mini pastels figurent dans le plus de demandes."
      : "Le Pastel King figure dans le plus de demandes.";
  }
}

function activityBuckets(records, period, today) {
  const monthly = period === "all";
  const length = monthly ? 12 : Number(period);
  const keyFor = (date) => date.toISOString().slice(0, monthly ? 7 : 10);
  const counts = new Map();
  for (const order of records) {
    const key = keyFor(new Date(order.created_at));
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from({ length }, (_, index) => {
    const offset = index - length + 1;
    const date = monthly
      ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1))
      : dayOffset(today, offset);
    return { date, count: counts.get(keyFor(date)) || 0 };
  });
}

function renderActivity(records, period, today) {
  const buckets = activityBuckets(records, period, today);
  const highest = Math.max(...buckets.map(({ count }) => count));
  const monthly = period === "all";
  document.querySelector("#activity-range").textContent = monthly
    ? "Par mois, sur les 12 derniers mois"
    : "Par jour, heure de Conakry";
  document.querySelector("#activity-empty").hidden = highest > 0;
  activityChart.hidden = !highest;
  activityBars.replaceChildren();
  if (!highest) return;
  document.querySelector("#activity-maximum").textContent = countFormat.format(highest);

  const labelEvery = buckets.length <= 7 ? 1 : Math.ceil(buckets.length / 5);
  const last = buckets.length - 1;
  buckets.forEach(({ date, count }, index) => {
    const item = node("li");
    const fullLabel = monthly ? fullMonth.format(date) : fullDate.format(date);
    const description = `${fullLabel}, ${countLabel(count, "demande")}`;
    item.title = description;
    item.setAttribute("aria-label", description);
    const bar = node("span", "", "activity-bar");
    item.style.setProperty("--height", `${count / highest * 100}%`);
    bar.setAttribute("aria-hidden", "true");
    item.append(bar);
    if (count > 0) {
      item.tabIndex = 0;
      const value = node("span", countFormat.format(count), "activity-value");
      value.setAttribute("aria-hidden", "true");
      item.append(value);
    }
    if (index === 0 || index === last || (index % labelEvery === 0 && last - index >= 2)) {
      const label = node("span", monthly ? monthName.format(date) : shortDay.format(date), "activity-label");
      label.setAttribute("aria-hidden", "true");
      item.append(label);
    }
    activityBars.append(item);
  });
}

function renderMetrics(records, period, today) {
  let pending = 0;
  let confirmed = 0;
  let subtotal = 0n;
  for (const order of records) {
    if (order.status === "pending") pending++;
    if (order.status === "confirmed") {
      confirmed++;
      subtotal += BigInt(order.subtotal_gnf);
    }
  }
  document.querySelector("#metric-received").textContent = countFormat.format(records.length);
  document.querySelector("#metric-pending").textContent = countFormat.format(pending);
  document.querySelector("#metric-confirmed").textContent = countFormat.format(confirmed);
  document.querySelector("#metric-amount").textContent = formatPrice(subtotal);
  renderActivity(records, period, today);
  renderProductComparison(records);
}

async function loadDashboard() {
  if (!session) return;
  const current = session;
  const requestId = ++dashboardRequest;
  const period = dashboardPeriod.value;
  const today = new Date();
  // Conakry stays on UTC throughout the year.
  today.setUTCHours(0, 0, 0, 0);
  const start = period === "all" ? undefined : dayOffset(today, 1 - Number(period));
  const pageSize = 100;
  const columns = "id,created_at,quantities,status,subtotal_gnf";
  const isLatest = () => session === current && requestId === dashboardRequest;
  refreshDashboard.disabled = true;
  dashboardResults.hidden = true;
  status(dashboardStatus, "Chargement des indicateurs…");

  try {
    let cursor;
    const records = [];
    while (isLatest()) {
      const batch = await getOrderPage(pageSize, cursor, { columns, start });
      records.push(...batch);
      if (batch.length < pageSize) break;
      const next = batch.at(-1).id;
      if (next === cursor) throw new Error("Pagination interrompue");
      cursor = next;
    }
    if (!isLatest()) return;
    renderMetrics(records, period, today);
    dashboardNeedsRefresh = false;
    dashboardResults.hidden = false;
    status(dashboardStatus, "");
  } catch (error) {
    if (isLatest() && !sessionError(error)) {
      dashboardNeedsRefresh = true;
      status(dashboardStatus, error.status === 404
        ? "Le stockage des demandes doit être activé dans Supabase."
        : "Les indicateurs n’ont pas pu être chargés.", true);
    }
  } finally {
    if (isLatest()) refreshDashboard.disabled = false;
  }
}

function clearDashboard() {
  dashboardRequest++;
  dashboardNeedsRefresh = true;
  dashboardPeriod.value = "30";
  refreshDashboard.disabled = false;
  dashboardResults.hidden = true;
  activityBars.replaceChildren();
  productComparison.replaceChildren();
  for (const metric of document.querySelectorAll(".metric-card dd")) metric.textContent = "—";
  status(dashboardStatus, "");
}

function invalidateDashboard() {
  dashboardNeedsRefresh = true;
  dashboardRequest++;
  refreshDashboard.disabled = false;
  if (session && !document.querySelector("#tableau-de-bord").hidden) void loadDashboard();
}

dashboardPeriod.addEventListener("change", loadDashboard);
refreshDashboard.addEventListener("click", loadDashboard);
