/**
 * =============================================
 * IMKLI — admin.js
 * =============================================
 * Authentification simple basée sur config.js
 * (pas de vrai backend d'auth : identifiants
 * comparés côté client). Suffisant pour un usage
 * interne simple, à ne pas utiliser tel quel pour
 * protéger des données sensibles en production.
 */

const SESSION_KEY = "imkli_admin_session";

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const mealForm = document.getElementById("meal-form");
const mealFormTitle = document.getElementById("meal-form-title");
const mealIdField = document.getElementById("meal-id");
const mealCancelEditBtn = document.getElementById("meal-cancel-edit");
const mealsTableBody = document.getElementById("meals-table-body");
const mealSaveBtn = document.getElementById("meal-save-btn");
const mealFormFeedback = document.getElementById("meal-form-feedback");

const ordersTableBody = document.getElementById("orders-table-body");

document.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem(SESSION_KEY) === "true") {
    afficherDashboard();
  } else {
    afficherLogin();
  }

  loginForm.addEventListener("submit", gererConnexion);
  logoutBtn.addEventListener("click", deconnexion);
  mealForm.addEventListener("submit", enregistrerRepas);
  mealCancelEditBtn.addEventListener("click", annulerEdition);
});

/* ============== AUTHENTIFICATION ============== */

function gererConnexion(e) {
  e.preventDefault();
  const user = document.getElementById("login-username").value.trim();
  const pass = document.getElementById("login-password").value;

  if (user === IMKLI_CONFIG.ADMIN_USERNAME && pass === IMKLI_CONFIG.ADMIN_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, "true");
    loginError.classList.add("d-none");
    afficherDashboard();
  } else {
    loginError.textContent = "Identifiants incorrects.";
    loginError.classList.remove("d-none");
  }
}

function deconnexion() {
  sessionStorage.removeItem(SESSION_KEY);
  afficherLogin();
}

function afficherLogin() {
  loginView.classList.remove("d-none");
  dashboardView.classList.add("d-none");
}

function afficherDashboard() {
  loginView.classList.add("d-none");
  dashboardView.classList.remove("d-none");
  chargerRepasAdmin();
  chargerCommandes();
}

/* ============== CRUD REPAS ============== */

async function chargerRepasAdmin() {
  mealsTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Chargement...</td></tr>`;

  const { data: meals, error } = await imkliSupabase
    .from("meals")
    .select("*")
    .order("jour", { ascending: true })
    .order("nom", { ascending: true });

  if (error) {
    mealsTableBody.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-4">Erreur de chargement.</td></tr>`;
    console.error(error);
    return;
  }

  if (!meals || meals.length === 0) {
    mealsTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Aucun repas enregistré.</td></tr>`;
    return;
  }

  mealsTableBody.innerHTML = meals.map(ligneRepasHtml).join("");

  meals.forEach((meal) => {
    document.getElementById(`edit-${meal.id}`).addEventListener("click", () => preRemplirEdition(meal));
    document.getElementById(`delete-${meal.id}`).addEventListener("click", () => supprimerRepas(meal.id));
    document.getElementById(`toggle-${meal.id}`).addEventListener("change", (e) => basculerDisponibilite(meal.id, e.target.checked));
  });
}

function ligneRepasHtml(meal) {
  const image = meal.image_url || "assets/images/placeholder.png";
  return `
    <tr class="${meal.disponible ? "" : "imkli-toggle-off"}">
      <td><img src="${escapeHtml(image)}" class="meal-thumb" alt="${escapeHtml(meal.nom)}"></td>
      <td>${escapeHtml(meal.jour)}</td>
      <td>
        <div class="fw-semibold">${escapeHtml(meal.nom)}</div>
        <div class="text-muted small">${escapeHtml(meal.description || "")}</div>
      </td>
      <td>${Number(meal.prix).toFixed(2)} MAD</td>
      <td class="text-center">
        <div class="form-check form-switch d-flex justify-content-center">
          <input class="form-check-input" type="checkbox" id="toggle-${meal.id}" ${meal.disponible ? "checked" : ""}>
        </div>
      </td>
      <td class="text-end">
        <button id="edit-${meal.id}" class="btn btn-sm btn-outline-secondary me-1">Modifier</button>
        <button id="delete-${meal.id}" class="btn btn-sm btn-outline-danger">Supprimer</button>
      </td>
    </tr>`;
}

function preRemplirEdition(meal) {
  mealFormTitle.textContent = "Modifier le repas";
  mealIdField.value = meal.id;
  document.getElementById("meal-nom").value = meal.nom;
  document.getElementById("meal-description").value = meal.description || "";
  document.getElementById("meal-prix").value = meal.prix;
  document.getElementById("meal-jour").value = meal.jour;
  document.getElementById("meal-disponible").checked = meal.disponible;
  mealCancelEditBtn.classList.remove("d-none");
  window.scrollTo({ top: mealForm.offsetTop - 20, behavior: "smooth" });
}

function annulerEdition() {
  mealForm.reset();
  mealIdField.value = "";
  mealFormTitle.textContent = "Ajouter un repas";
  mealCancelEditBtn.classList.add("d-none");
  mealFormFeedback.innerHTML = "";
}

async function enregistrerRepas(e) {
  e.preventDefault();
  mealFormFeedback.innerHTML = "";

  const id = mealIdField.value;
  const nom = document.getElementById("meal-nom").value.trim();
  const description = document.getElementById("meal-description").value.trim();
  const prix = parseFloat(document.getElementById("meal-prix").value);
  const jour = document.getElementById("meal-jour").value;
  const disponible = document.getElementById("meal-disponible").checked;
  const fichierImage = document.getElementById("meal-image").files[0];

  if (!nom || !jour || isNaN(prix)) {
    mealFormFeedback.innerHTML = `<div class="alert alert-danger">Merci de remplir tous les champs obligatoires.</div>`;
    return;
  }

  mealSaveBtn.disabled = true;
  mealSaveBtn.textContent = "Enregistrement...";

  try {
    let image_url = null;

    if (fichierImage) {
      image_url = await televerserImage(fichierImage);
    }

    const donnees = { nom, description, prix, jour, disponible };
    if (image_url) donnees.image_url = image_url;

    let error;
    if (id) {
      ({ error } = await imkliSupabase.from("meals").update(donnees).eq("id", id));
    } else {
      ({ error } = await imkliSupabase.from("meals").insert(donnees));
    }

    if (error) throw error;

    mealFormFeedback.innerHTML = `<div class="alert alert-success">Repas enregistré avec succès.</div>`;
    annulerEdition();
    chargerRepasAdmin();
  } catch (err) {
    console.error(err);
    mealFormFeedback.innerHTML = `<div class="alert alert-danger">Erreur lors de l'enregistrement du repas.</div>`;
  } finally {
    mealSaveBtn.disabled = false;
    mealSaveBtn.textContent = "Enregistrer le repas";
  }
}

async function televerserImage(fichier) {
  const cheminFichier = `${Date.now()}-${fichier.name}`;
  const { error: uploadError } = await imkliSupabase.storage
    .from(IMKLI_CONFIG.SUPABASE_STORAGE_BUCKET)
    .upload(cheminFichier, fichier, { upsert: false });

  if (uploadError) throw uploadError;

  const { data } = imkliSupabase.storage
    .from(IMKLI_CONFIG.SUPABASE_STORAGE_BUCKET)
    .getPublicUrl(cheminFichier);

  return data.publicUrl;
}

async function supprimerRepas(id) {
  if (!confirm("Supprimer définitivement ce repas ?")) return;

  const { error } = await imkliSupabase.from("meals").delete().eq("id", id);
  if (error) {
    alert("Erreur lors de la suppression.");
    console.error(error);
    return;
  }
  chargerRepasAdmin();
}

async function basculerDisponibilite(id, disponible) {
  const { error } = await imkliSupabase.from("meals").update({ disponible }).eq("id", id);
  if (error) {
    alert("Erreur lors de la mise à jour.");
    console.error(error);
    return;
  }
  chargerRepasAdmin();
}

/* ============== COMMANDES ============== */

async function chargerCommandes() {
  ordersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Chargement...</td></tr>`;

  const { data: orders, error } = await imkliSupabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    ordersTableBody.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-4">Erreur de chargement.</td></tr>`;
    console.error(error);
    return;
  }

  if (!orders || orders.length === 0) {
    ordersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Aucune commande pour le moment.</td></tr>`;
    return;
  }

  const lignes = await Promise.all(orders.map(ligneCommandeHtml));
  ordersTableBody.innerHTML = lignes.join("");

  orders.forEach((order) => {
    document.getElementById(`toggle-details-${order.id}`).addEventListener("click", () => {
      document.getElementById(`details-${order.id}`).classList.toggle("d-none");
    });
    document.getElementById(`status-${order.id}`).addEventListener("change", (e) =>
      changerStatutCommande(order.id, e.target.value)
    );
  });
}

async function ligneCommandeHtml(order) {
  const date = new Date(order.created_at).toLocaleString("fr-FR");
  const badgeClass = classeBadgeStatut(order.status);

  return `
    <tr>
      <td>${date}</td>
      <td>
        <div class="fw-semibold">${escapeHtml(order.client_name)}</div>
        <div class="text-muted small">${escapeHtml(order.client_phone)}</div>
      </td>
      <td>${Number(order.total).toFixed(2)} MAD</td>
      <td>
        <span class="badge ${badgeClass}">${escapeHtml(order.status)}</span>
      </td>
      <td>
        <select id="status-${order.id}" class="form-select form-select-sm">
          ${["En attente", "Confirmée", "Livrée", "Annulée"]
            .map((s) => `<option value="${s}" ${s === order.status ? "selected" : ""}>${s}</option>`)
            .join("")}
        </select>
      </td>
      <td class="text-end">
        <button id="toggle-details-${order.id}" class="btn btn-sm btn-outline-secondary">Détails</button>
      </td>
    </tr>
    <tr id="details-${order.id}" class="d-none">
      <td colspan="6" class="bg-light">
        <div id="details-content-${order.id}">${await detailsCommandeHtml(order.id)}</div>
      </td>
    </tr>`;
}

async function detailsCommandeHtml(orderId) {
  const { data: items, error } = await imkliSupabase
    .from("order_items")
    .select("prix, meals ( nom, jour )")
    .eq("order_id", orderId);

  if (error || !items) return `<p class="text-danger mb-0">Impossible de charger le détail.</p>`;

  return `
    <ul class="list-unstyled mb-0 small">
      ${items
        .map(
          (it) =>
            `<li>- ${escapeHtml(it.meals?.jour || "?")} : ${escapeHtml(it.meals?.nom || "Repas supprimé")} (${Number(it.prix).toFixed(2)} MAD)</li>`
        )
        .join("")}
    </ul>`;
}

function classeBadgeStatut(status) {
  switch (status) {
    case "En attente": return "badge-en-attente";
    case "Confirmée": return "badge-confirmee";
    case "Livrée": return "badge-livree";
    case "Annulée": return "badge-annulee";
    default: return "bg-secondary";
  }
}

async function changerStatutCommande(orderId, nouveauStatut) {
  const { error } = await imkliSupabase
    .from("orders")
    .update({ status: nouveauStatut })
    .eq("id", orderId);

  if (error) {
    alert("Erreur lors de la mise à jour du statut.");
    console.error(error);
    return;
  }
  chargerCommandes();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
