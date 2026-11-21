"use strict";

const ordersList = document.querySelector("#orders-list");
const ordersStatus = document.querySelector("#orders-status");
const ordersPrint = document.querySelector("#orders-print");
const refreshOrders = document.querySelector("#refresh-orders");
const moreOrders = document.querySelector("#more-orders");
const exportOrders = document.querySelector("#export-orders");
const orderStatuses = {
  pending: "En attente de confirmation",
  confirmed: "Confirmée",
  cancelled: "Annulée"
};
const orderColumns = "id,created_at,first_name,last_name,address,delivery_day,items,subtotal_gnf,sauce_pending,status";
let orderCursor;

function orderLines(order) {
  const list = node("ul", "", "order-details");
  for (const item of order.items) {
    const rate = item.unit_price === null ? "Prix à confirmer" : formatPrice(item.unit_price);
    list.append(node("li", `${item.quantity} × ${item.name} · ${rate}`));
  }
  return list;
}

function orderCard(order, printable = false) {
  const card = node(printable ? "article" : "li", "", printable ? "print-order" : "card");
  const created = node("time", inboxDate.format(new Date(order.created_at)));
  created.dateTime = order.created_at;
  card.append(
    node("h3", `MP-${order.id} · ${order.first_name} ${order.last_name}`),
    created,
    node("p", `Livraison souhaitée : ${order.delivery_day} · ${order.address}`),
    orderLines(order),
    node("p", `Sous-total des produits : ${formatPrice(order.subtotal_gnf)}`),
    node("p", order.sauce_pending ? "Sauce et livraison à confirmer." : "Frais de livraison à confirmer.")
  );

  if (printable) {
    card.append(node("p", `Statut : ${orderStatuses[order.status]}`));
    return card;
  }

  const label = node("label", "Statut", "fld order-status-field");
  const select = node("select");
  for (const [value, title] of Object.entries(orderStatuses)) {
    const option = node("option", title);
    option.value = value;
    select.append(option);
  }
  select.value = order.status;
  select.addEventListener("change", async () => {
    const current = session;
    select.disabled = true;
    try {
      const [saved] = await adminRequest(`${maraOrderPath}?id=eq.${order.id}&select=status`, {
        method: "PATCH",
        body: { status: select.value },
        headers: { Prefer: "return=representation" }
      });
      if (!saved) throw new Error("Statut non enregistré");
      order.status = saved.status;
    } catch (error) {
      select.value = order.status;
      if (session === current && !sessionError(error)) status(ordersStatus, "Le statut n’a pas pu être enregistré.", true);
    } finally {
      select.disabled = false;
    }
  });
  label.append(select);
  card.append(label);
  return card;
}

function getOrderPage(limit, before) {
  const filter = before === undefined ? "" : `&id=lt.${encodeURIComponent(before)}`;
  return adminRequest(`${maraOrderPath}?select=${orderColumns}&order=id.desc&limit=${limit}${filter}`);
}

async function loadOrders(previous = false) {
  const current = session;
  refreshOrders.disabled = moreOrders.disabled = true;
  status(ordersStatus, "Chargement des demandes…");
  try {
    const page = await getOrderPage(31, previous ? orderCursor : undefined);
    if (session !== current) return;
    const visible = page.slice(0, 30);
    if (!previous) ordersList.replaceChildren();
    ordersList.append(...visible.map((order) => orderCard(order)));
    orderCursor = visible.at(-1)?.id;
    moreOrders.hidden = page.length <= 30;
    exportOrders.disabled = ordersList.childElementCount === 0;
    status(ordersStatus, ordersList.childElementCount ? "" : "Aucune demande pour le moment.");
  } catch (error) {
    if (session === current && !sessionError(error)) {
      status(ordersStatus, error.status === 404
        ? "Le stockage des demandes doit être activé dans Supabase."
        : "Chargement des demandes impossible.", true);
    }
  } finally {
    refreshOrders.disabled = moreOrders.disabled = false;
  }
}

function resetOrdersPrint() {
  document.body.classList.remove("printing-orders");
  ordersPrint.hidden = true;
  ordersPrint.replaceChildren();
}

function clearOrders() {
  ordersList.replaceChildren();
  orderCursor = undefined;
  exportOrders.disabled = true;
  moreOrders.hidden = true;
  status(ordersStatus, "");
  resetOrdersPrint();
}

refreshOrders.addEventListener("click", () => loadOrders());
moreOrders.addEventListener("click", () => loadOrders(true));
window.addEventListener("afterprint", resetOrdersPrint);

exportOrders.addEventListener("click", async () => {
  const current = session;
  exportOrders.disabled = true;
  status(ordersStatus, "Préparation du PDF…");
  try {
    const records = [];
    let cursor;
    const pageSize = 100;
    while (session === current) {
      const batch = await getOrderPage(pageSize, cursor);
      records.push(...batch);
      if (batch.length < pageSize) break;
      const next = batch.at(-1).id;
      if (next === cursor) throw new Error("Pagination des demandes interrompue");
      cursor = next;
    }
    if (session !== current) return;
    const heading = node("h1", "Mara Pastel · Demandes de commande");
    const summary = node("p", `${records.length} demandes · Export du ${inboxDate.format(new Date())}`);
    ordersPrint.replaceChildren(heading, summary, ...records.map((order) => orderCard(order, true)));
    document.body.classList.add("printing-orders");
    ordersPrint.hidden = false;
    status(ordersStatus, "Choisissez « Enregistrer au format PDF » dans la fenêtre d’impression.");
    window.print();
  } catch (error) {
    resetOrdersPrint();
    if (session === current && !sessionError(error)) status(ordersStatus, "L’export des demandes a échoué.", true);
  } finally {
    if (session === current) exportOrders.disabled = ordersList.childElementCount === 0;
  }
});
