"use strict";

const loginForm = document.querySelector("#login-form");
const loginPanel = document.querySelector("#login-panel");
const loginStatus = document.querySelector("#login-status");
const dashboard = document.querySelector("#dashboard");
const logoutButton = document.querySelector("#logout");
const accountSettings = document.querySelector("#account-settings");
const passwordDialog = document.querySelector("#password-dialog");
const passwordForm = document.querySelector("#password-form");
const passwordStatus = document.querySelector("#password-status");
const savePassword = document.querySelector("#save-password");
const closePassword = document.querySelector("#close-password");
const editors = document.querySelector("#editors");
const eventEditors = document.querySelector("#event-editors");
const addEventButton = document.querySelector("#add-event");
const publishButton = document.querySelector("#publish");
const publishStatus = document.querySelector("#publish-status");
const inboxList = document.querySelector("#inbox-list");
const inboxStatus = document.querySelector("#inbox-status");
const refreshInbox = document.querySelector("#refresh-inbox");
const moreMessages = document.querySelector("#more-messages");
const inboxDate = new Intl.DateTimeFormat("fr-GN", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Conakry" });

let session;
let draft;
let revision;
let dirty = false;
let uploads = 0;
let publishing = false;
let changingPassword = false;
let inboxCursor;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function status(element, message, error = false) {
  element.textContent = message;
  element.dataset.error = String(error);
}

function button(text, action) {
  const control = node("button", text, "btn admin-secondary");
  control.type = "button";
  control.addEventListener("click", action);
  return control;
}

function field(label, value, change, { type = "text", max = 100, multiline = false } = {}) {
  const wrapper = node("label", label, "fld");
  const input = node(multiline ? "textarea" : "input");
  if (multiline) input.rows = 3;
  else input.type = type;
  input.maxLength = max;
  input.value = value || "";
  input.addEventListener("input", () => {
    change(input.value);
    markDirty();
  });
  wrapper.append(input);
  return wrapper;
}

function updatePublishButton() {
  publishButton.disabled = !dirty || uploads > 0 || publishing;
  logoutButton.disabled = accountSettings.disabled = uploads > 0 || publishing || changingPassword;
}

function markDirty() {
  dirty = true;
  status(publishStatus, "Modifications à publier.");
  updatePublishButton();
}

function applySession(auth, target = {}) {
  target.token = auth.access_token;
  target.refreshToken = auth.refresh_token;
  target.expires = Date.now() + auth.expires_in * 1000;
  if (auth.user) {
    target.userId = auth.user.id;
    target.email = auth.user.email;
  }
  return target;
}

function signInWithPassword(email, password) {
  return maraRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password }
  });
}

function revokeSession(token) {
  return maraRequest("/auth/v1/logout?scope=local", { method: "POST", token }).catch(() => {});
}

async function adminRequest(path, options = {}) {
  const current = session;
  if (!current) throw new Error("Session terminée.");
  if (current.expires - Date.now() < 30000) {
    current.refreshing ??= maraRequest("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: current.refreshToken }
    }).then((auth) => applySession(auth, current)).finally(() => { current.refreshing = null; });
    await current.refreshing;
  }
  if (session !== current) throw new Error("Session terminée.");
  return maraRequest(path, { ...options, token: current.token });
}

function disconnect(message) {
  const token = session?.token;
  session = undefined;
  if (passwordDialog.open) passwordDialog.close();
  draft = undefined;
  dirty = false;
  dashboard.hidden = true;
  logoutButton.hidden = true;
  loginPanel.hidden = false;
  inboxList.replaceChildren();
  editors.replaceChildren();
  eventEditors.replaceChildren();
  status(loginStatus, message);
  return token;
}

function sessionError(error) {
  if (error.status === 401) {
    disconnect("La session a expiré. Connectez-vous à nouveau.");
    return true;
  }
  return false;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = loginForm.querySelector("button");
  if (!maraProject || submit.disabled) return;
  submit.disabled = true;
  status(loginStatus, "Connexion en cours…");
  try {
    const values = new FormData(loginForm);
    const auth = await signInWithPassword(values.get("email").trim(), values.get("password"));
    session = applySession(auth);
    const allowed = await adminRequest("/rest/v1/rpc/is_mara_admin", { method: "POST", body: {} });
    if (allowed !== true) {
      const token = disconnect("Ce compte n’a pas accès à l’administration.");
      await revokeSession(token);
      return;
    }
    const [site] = await adminRequest(`${maraSitePath}&select=content,revision`);
    if (!site) throw new Error("Configuration absente.");
    draft = { texts: {}, images: {}, events: [], ...site.content };
    revision = site.revision;
    dirty = false;
    renderEditors();
    renderEvents();
    status(publishStatus, "");
    updatePublishButton();
    loginPanel.hidden = true;
    dashboard.hidden = false;
    logoutButton.hidden = false;
    await loadInbox();
  } catch (error) {
    disconnect(error.status === 400 || error.status === 401
      ? "Adresse e-mail ou mot de passe incorrect."
      : "Connexion ou chargement impossible. Vérifiez la configuration Supabase et réessayez.");
  } finally {
    loginForm.elements.password.value = "";
    submit.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  if (dirty && !window.confirm("Quitter sans publier vos modifications ?")) return;
  const token = disconnect("Vous êtes déconnecté.");
  await revokeSession(token);
});

accountSettings.addEventListener("click", () => {
  if (session) passwordDialog.showModal();
});
closePassword.addEventListener("click", () => passwordDialog.close());
passwordDialog.addEventListener("cancel", (event) => {
  if (changingPassword) event.preventDefault();
});
passwordDialog.addEventListener("close", () => {
  passwordForm.reset();
  status(passwordStatus, "");
});

function passwordError(error) {
  if (error.code === "invalid_credentials" || error.code === "current_password_mismatch") {
    return "L’ancien mot de passe est incorrect.";
  }
  if (error.code === "same_password") return "Choisissez un mot de passe différent de l’ancien.";
  if (error.code === "weak_password") return "Le nouveau mot de passe ne respecte pas les règles de sécurité du compte.";
  if (error.status === 429) return "Trop de tentatives. Réessayez dans quelques instants.";
  return "Impossible de confirmer la modification du mot de passe. Réessayez dans quelques instants.";
}

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = session;
  if (!current || !passwordDialog.open || changingPassword) return;
  const fields = new FormData(passwordForm);
  const oldPassword = fields.get("currentPassword");
  const newPassword = fields.get("newPassword");
  if (newPassword !== fields.get("confirmPassword")) {
    status(passwordStatus, "Les deux nouveaux mots de passe doivent être identiques.", true);
    passwordForm.elements.confirmPassword.focus();
    return;
  }
  if (oldPassword === newPassword) {
    status(passwordStatus, "Choisissez un mot de passe différent de l’ancien.", true);
    passwordForm.elements.newPassword.focus();
    return;
  }

  changingPassword = true;
  savePassword.disabled = closePassword.disabled = true;
  updatePublishButton();
  status(passwordStatus, "Vérification de l’ancien mot de passe…");
  try {
    const auth = await signInWithPassword(current.email, oldPassword);
    if (session !== current || !current.userId || auth.user?.id !== current.userId) {
      await revokeSession(auth.access_token);
      if (session === current) status(passwordStatus, "Le compte n’a pas pu être vérifié. Reconnectez-vous.", true);
      return;
    }

    // Supabase conserve la session utilisée pour le changement et révoque les autres.
    session = applySession(auth);
    void revokeSession(current.token);
    await maraRequest("/auth/v1/user", {
      method: "PUT",
      token: session.token,
      body: { current_password: oldPassword, password: newPassword }
    });
    passwordForm.reset();
    status(passwordStatus, "Mot de passe modifié. Utilisez le nouveau à la prochaine connexion.");
  } catch (error) {
    status(passwordStatus, passwordError(error), true);
  } finally {
    changingPassword = false;
    savePassword.disabled = closePassword.disabled = false;
    updatePublishButton();
  }
});

const allowedImages = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const maxImageSize = 6 * 1024 * 1024;

function photoField(label, addPhoto, multiple = false) {
  const wrapper = node("label", label, "fld");
  const input = node("input");
  input.type = "file";
  input.accept = Object.keys(allowedImages).join(",");
  input.multiple = multiple;
  const feedback = node("span", "", "admin-status");
  feedback.setAttribute("role", "status");
  input.addEventListener("change", async () => {
    const files = [...input.files];
    if (!files.length) return;
    const current = session;
    input.disabled = true;
    uploads++;
    updatePublishButton();
    status(feedback, "Import en cours…");
    const failures = [];
    try {
      for (const file of files) {
        if (session !== current) break;
        const extension = allowedImages[file.type];
        if (!extension || file.size > maxImageSize || !file.size) {
          failures.push(file.name);
          continue;
        }
        const path = `${crypto.randomUUID()}.${extension}`;
        try {
          await adminRequest(`/storage/v1/object/${maraMediaBucket}/${path}`, {
            method: "POST", type: file.type, body: file
          });
          if (session === current && addPhoto(path)) markDirty();
        } catch (error) {
          if (sessionError(error)) break;
          failures.push(file.name);
        }
      }
      if (session === current) {
        status(feedback, failures.length
          ? `Import impossible pour ${failures.join(", ")}. Formats acceptés : JPEG, PNG ou WebP, 6 Mio maximum par photo.`
          : "Import terminé.", Boolean(failures.length));
      }
    } finally {
      uploads--;
      updatePublishButton();
      input.value = "";
      input.disabled = false;
    }
  });
  wrapper.append(input, feedback);
  return wrapper;
}

const builtInPhotos = { hero: "../assets/mara-accueil.jpg", story: "../assets/mara-evenement.webp" };

function renderEditors() {
  editors.replaceChildren(...maraFields.map(({ title, texts, image }) => {
    const card = node("article", "", "card admin-editor");
    card.append(node("h3", title));
    for (const [key, label, fallback, max] of texts) {
      card.append(field(label, draft.texts[key] ?? fallback, (value) => { draft.texts[key] = value; }, {
        max, multiline: max > 100
      }));
    }
    const preview = node("img", "", "editor-photo");
    preview.alt = "Aperçu de la photo";
    const altField = field("Description de la photo", draft.images[image]?.alt, (value) => {
      draft.images[image].alt = value;
    }, { max: 160 });
    function updatePhoto() {
      const photo = maraMediaUrl(draft.images[image]?.path);
      const source = photo || builtInPhotos[image];
      if (source) preview.src = source;
      else preview.removeAttribute("src");
      preview.hidden = !source;
      altField.hidden = !photo;
      reset.hidden = !photo;
      if (!photo) altField.querySelector("input").value = "";
    }
    const upload = photoField("Importer une photo", (path) => {
      draft.images[image] = { path, alt: draft.images[image]?.alt || "" };
      updatePhoto();
      return true;
    });
    const reset = button(photoResetLabel(image), () => {
      if (upload.querySelector("input").disabled) return;
      delete draft.images[image];
      updatePhoto();
      markDirty();
    });
    card.append(preview, upload, altField, reset);
    updatePhoto();
    return card;
  }));
}

function photoResetLabel(image) {
  return builtInPhotos[image] ? "Rétablir la photo d’origine" : "Retirer la photo";
}

function renderEvent(event) {
  const article = node("article", "", "card admin-editor");
  const title = node("h3", event.nom || "Nouvel événement");
  const photos = node("ul", "", "event-photos");
  function renderPhotos() {
    photos.replaceChildren(...event.photos.map((path) => {
      const item = node("li");
      const image = node("img");
      image.src = maraMediaUrl(path);
      image.alt = "Photo de l’événement";
      image.loading = "lazy";
      item.append(image, button("Retirer", () => {
        event.photos = event.photos.filter((photo) => photo !== path);
        renderPhotos();
        markDirty();
      }));
      return item;
    }));
  }
  article.append(
    title,
    field("Nom de l’événement", event.nom, (value) => { event.nom = value; title.textContent = value || "Nouvel événement"; }),
    field("Date", event.date, (value) => { event.date = value; }, { type: "date" }),
    field("Lieu", event.lieu, (value) => { event.lieu = value; }),
    photos,
    photoField("Ajouter des photos", (path) => {
      event.photos.push(path);
      renderPhotos();
      return true;
    }, true),
    button("Retirer l’événement", () => {
      if (article.querySelector('[type="file"]').disabled) return;
      draft.events = draft.events.filter((item) => item !== event);
      article.remove();
      updateEmptyEvents();
      markDirty();
    })
  );
  renderPhotos();
  return article;
}

function updateEmptyEvents() {
  document.querySelector("#empty-events").hidden = draft.events.length > 0;
}

function renderEvents() {
  eventEditors.replaceChildren(...draft.events.map(renderEvent));
  updateEmptyEvents();
}

addEventButton.addEventListener("click", () => {
  const event = { nom: "", date: "", lieu: "", photos: [] };
  draft.events.push(event);
  const editor = renderEvent(event);
  eventEditors.append(editor);
  updateEmptyEvents();
  editor.querySelector("input").focus();
  markDirty();
});

publishButton.addEventListener("click", async () => {
  if (draft.events.some((event) => !event.nom.trim() || !event.photos.length)) {
    status(publishStatus, "Chaque événement doit avoir un nom et au moins une photo.", true);
    return;
  }
  publishing = true;
  editors.inert = eventEditors.inert = true;
  addEventButton.disabled = true;
  updatePublishButton();
  status(publishStatus, "Publication en cours…");
  try {
    const [saved] = await adminRequest(`${maraSitePath}&revision=eq.${revision}&select=revision`, {
      method: "PATCH",
      body: { content: draft, revision: revision + 1 },
      headers: { Prefer: "return=representation" }
    });
    if (!saved) {
      status(publishStatus, "Une autre session a publié des modifications. Vos changements restent affichés. Copiez-les avant de vous reconnecter pour récupérer la dernière version.", true);
      return;
    }
    revision = saved.revision;
    dirty = false;
    status(publishStatus, "Modifications publiées sur la vitrine.");
  } catch (error) {
    if (!sessionError(error)) status(publishStatus, "Publication impossible. Vos modifications restent affichées.", true);
  } finally {
    publishing = false;
    editors.inert = eventEditors.inert = false;
    addEventButton.disabled = false;
    updatePublishButton();
  }
});

function inboxCard({ sender, received_at, body }) {
  const item = node("li", "", "card");
  const heading = node("h3", `+${sender}`);
  const received = node("time", inboxDate.format(new Date(received_at)));
  received.dateTime = received_at;
  const reply = node("a", "Répondre sur WhatsApp");
  reply.href = `https://wa.me/${encodeURIComponent(sender)}`;
  reply.target = "_blank";
  reply.rel = "noopener noreferrer";
  item.append(heading, received, node("p", body), reply);
  return item;
}

async function loadInbox(previous = false) {
  const current = session;
  refreshInbox.disabled = moreMessages.disabled = true;
  status(inboxStatus, "Chargement des messages…");
  try {
    const filter = previous ? `&id=lt.${encodeURIComponent(inboxCursor)}` : "";
    const records = await adminRequest(`/rest/v1/mara_inbox?select=id,sender,received_at,body&order=id.desc&limit=31${filter}`);
    if (session !== current) return;
    if (!previous) inboxList.replaceChildren();
    const visible = records.slice(0, 30);
    inboxList.append(...visible.map(inboxCard));
    inboxCursor = visible.at(-1)?.id;
    moreMessages.hidden = records.length <= 30;
    status(inboxStatus, inboxList.childElementCount ? "" : "Aucun message du site reçu pour le moment.");
  } catch (error) {
    if (session === current && !sessionError(error)) status(inboxStatus, "Chargement des messages impossible.", true);
  } finally {
    refreshInbox.disabled = moreMessages.disabled = false;
  }
}

refreshInbox.addEventListener("click", () => loadInbox());
moreMessages.addEventListener("click", () => loadInbox(true));

if (maraProject) loginForm.querySelector("button").disabled = false;
else status(loginStatus, "La connexion sera disponible après la configuration de Supabase.");
