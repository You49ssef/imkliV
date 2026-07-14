/**
 * =============================================
 * IMKLI — main.js (page client)
 * =============================================
 */

// Ordre d'affichage des jours
const JOURS_ORDRE = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"];

// Mapping des jours en français pour comparaison avec JavaScript Date
const JOURS_FRANCAIS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Ordre du cycle hebdomadaire de disponibilité : Samedi = jour de reset (position 0)
// puis Dimanche, Lundi, Mardi... Sert à calculer la coupure "veille" de chaque repas.
const CYCLE_DISPONIBILITE = ["Samedi", "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

// Mapping des jours français vers arabe pour l'affichage
const JOURS_TRADUCTION = {
  "Lundi": "الاثنين",
  "Mardi": "الثلاثاء",
  "Mercredi": "الأربعاء",
  "Jeudi": "الخميس",
  "Vendredi": "الجمعة",
  "Samedi": "السبت",
  "Dimanche": "الأحد"
};

// Repas actuellement sélectionnés par le client : Map<meal_id, meal>
const panier = new Map();

const mealsContainer = document.getElementById("meals-container");
const cartList = document.getElementById("cart-list");
const cartEmpty = document.getElementById("cart-empty");
const totalValue = document.getElementById("total-value");
const orderForm = document.getElementById("order-form");
const orderFeedback = document.getElementById("order-feedback");
const submitBtn = document.getElementById("submit-order-btn");

/**
 * Obtient le jour actuel de la semaine (0-6, où 0 = Dimanche)
 */
function getJourActuelIndex() {
  return new Date().getDay();
}

/**
 * Obtient le nom du jour actuel en français
 */
function getJourActuelFrancais() {
  const index = getJourActuelIndex();
  // JavaScript: 0 = Dimanche, 1 = Lundi, etc.
  // Notre tableau: 0 = Lundi, 1 = Mardi, etc.
  const ajusteIndex = index === 0 ? 6 : index - 1;
  return JOURS_FRANCAIS[ajusteIndex];
}

/**
 * Vérifie si un jour est indisponible à la commande.
 * Coupure "la veille" : le plat du jour J ferme dès le jour J-1 (pas le jour J
 * lui-même), et reste fermé de façon cumulative jusqu'au samedi, où tout
 * redevient disponible (nouveau cycle hebdomadaire).
 * @param {string} jour - Le jour du repas (ex: "Lundi")
 * @returns {boolean} - true si ce repas doit être bloqué, false sinon
 */
function estJourPasse(jour) {
  const positionActuelle = CYCLE_DISPONIBILITE.indexOf(getJourActuelFrancais());
  const positionRepas = CYCLE_DISPONIBILITE.indexOf(jour);

  if (positionActuelle === -1 || positionRepas === -1) return false;

  // Fermé si sa position dans le cycle est atteinte dès la veille (+1)
  // Exemple : on est Dimanche (position 1) -> Lundi (position 2) est déjà fermé.
  // Le samedi (position 0) réinitialise naturellement le cycle : rien n'est
  // encore assez "proche" pour être fermé, donc tout redevient disponible.
  return positionRepas <= positionActuelle + 1;
}

document.addEventListener("DOMContentLoaded", () => {
  chargerRepas();
  orderForm.addEventListener("submit", confirmerCommande);
});

/**
 * Charge les repas disponibles depuis Supabase et les affiche,
 * regroupés par jour.
 */
async function chargerRepas() {
  mealsContainer.innerHTML = `
    <div class="text-center py-5 w-100">
      <div class="spinner-border" style="color: var(--imkli-green-deep);" role="status"></div>
    </div>`;

  const { data: meals, error } = await imkliSupabase
    .from("meals")
    .select("*")
    .eq("disponible", true)
    .order("jour", { ascending: true })
    .order("nom", { ascending: true });

  if (error) {
    mealsContainer.innerHTML = `<div class="alert alert-danger w-100">تعذر تحميل الوجبات. حاول مرة أخرى لاحقاً.</div>`;
    console.error(error);
    return;
  }

  if (!meals || meals.length === 0) {
    mealsContainer.innerHTML = `<div class="imkli-empty w-100">لا توجد وجبات متاحة حالياً.</div>`;
    return;
  }

  // Note : plus de blocage total le week-end — samedi réinitialise
  // simplement la disponibilité de tous les repas (voir estJourPasse()).

  afficherRepas(meals);
}

/**
 * Regroupe les repas par jour et injecte le HTML dans le DOM.
 */
function afficherRepas(meals) {
  const parJour = {};
  meals.forEach((m) => {
    if (!parJour[m.jour]) parJour[m.jour] = [];
    parJour[m.jour].push(m);
  });

  const joursTries = Object.keys(parJour).sort((a, b) => {
    const ia = JOURS_FRANCAIS.indexOf(a);
    const ib = JOURS_FRANCAIS.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  let html = "";
  joursTries.forEach((jour) => {
    const jourArabe = JOURS_TRADUCTION[jour] || jour;
    html += `<h4 class="w-100 mt-4 mb-3" style="color: var(--primary); font-weight: 700;">${escapeHtml(jourArabe)}</h4>`;
    parJour[jour].forEach((meal) => {
      html += carteRepasHtml(meal);
    });
  });

  mealsContainer.innerHTML = html;

  // Attache les écouteurs sur chaque checkbox de sélection
  document.querySelectorAll(".meal-select").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => toggleMeal(e.target));
  });
  
  // Attache les écouteurs sur chaque champ de note
  document.querySelectorAll(".card-note-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const mealId = e.target.dataset.mealId;
      updateMealNote(mealId, e.target.value);
    });
  });
}

function carteRepasHtml(meal) {
  const image = meal.image_url || "assets/images/placeholder.png";
  const jourPasse = estJourPasse(meal.jour);
  const badgeClass = meal.nouveau ? 'new' : '';
  const badgeText = meal.nouveau ? 'Nouveau' : 'Disponible';
  const cardClass = jourPasse ? 'card card-disabled' : 'card';
  
  return `
    <div class="col" style="flex: 0 0 50%; max-width: 50%; padding: 0 0.75rem; margin-bottom: 1.5rem;">
      <div class="${cardClass}">
        <div class="card-image-wrapper">
          <img src="${escapeHtml(image)}" class="card-image" alt="${escapeHtml(meal.nom)}" loading="lazy">
          ${jourPasse ? '<span class="card-badge badge-closed">تم إغلاق الطلب</span>' : `<span class="card-badge ${badgeClass}">${badgeText}</span>`}
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(meal.nom)}</h3>
          <p class="card-description">${escapeHtml(meal.description || "")}</p>
          <div class="card-price">${Number(meal.prix).toFixed(2)} MAD</div>
        </div>
        <div class="card-footer">
          <div class="card-select">
            <input type="checkbox" id="meal-${meal.id}" 
                   data-id="${meal.id}"
                   data-nom="${escapeHtml(meal.nom)}"
                   data-prix="${meal.prix}"
                   data-jour="${escapeHtml(meal.jour)}"
                   class="meal-select"
                   ${jourPasse ? 'disabled' : ''}>
            <label for="meal-${meal.id}" ${jourPasse ? 'style="color: var(--gray-400); cursor: not-allowed;"' : ''}>${jourPasse ? 'غير متاح' : 'اختر'}</label>
          </div>
          ${!jourPasse ? `
          <div class="card-note">
            <input type="text" 
                   id="note-${meal.id}" 
                   placeholder="ملاحظة (مثال: بدون ملح)" 
                   class="card-note-input"
                   data-meal-id="${meal.id}">
          </div>
          ` : ''}
        </div>
      </div>
    </div>`;
}

/**
 * Ajoute ou retire un repas du panier selon l'état de la case à cocher.
 */
function toggleMeal(checkbox) {
  const id = checkbox.dataset.id;
  const jour = checkbox.dataset.jour;
  
  // Empêcher l'ajout de repas des jours passés (ou du jour même)
  if (checkbox.checked && estJourPasse(jour)) {
    checkbox.checked = false;
    afficherMessage("لا يمكن طلب وجبات من أيام سابقة", "danger");
    return;
  }
  
  if (checkbox.checked) {
    panier.set(id, {
      id,
      nom: checkbox.dataset.nom,
      prix: parseFloat(checkbox.dataset.prix),
      jour: checkbox.dataset.jour,
      note: "",
    });
  } else {
    panier.delete(id);
  }
  rafraichirPanier();
}

/**
 * Met à jour la note d'un repas dans le panier.
 */
function updateMealNote(mealId, note) {
  if (panier.has(mealId)) {
    const item = panier.get(mealId);
    item.note = note;
    panier.set(mealId, item);
  }
}

/**
 * Met à jour l'affichage du panier (liste + total).
 */
function rafraichirPanier() {
  if (panier.size === 0) {
    cartList.innerHTML = "";
    cartEmpty.style.display = "block";
  } else {
    cartEmpty.style.display = "none";
    let html = "";
    let total = 0;
    panier.forEach((item) => {
      total += item.prix;
      const jourArabe = JOURS_TRADUCTION[item.jour] || item.jour;
      const noteHtml = item.note ? `<div class="cart-item-note">📝 ${escapeHtml(item.note)}</div>` : '';
      html += `
        <div class="cart-item">
          <div class="cart-item-info">
            <span class="cart-item-name">${escapeHtml(jourArabe)} — ${escapeHtml(item.nom)}</span>
            ${noteHtml}
          </div>
          <span class="cart-item-price">${item.prix.toFixed(2)} MAD</span>
        </div>`;
    });
    cartList.innerHTML = html;
    totalValue.textContent = total.toFixed(2) + " MAD";
    return;
  }
  totalValue.textContent = "0.00 MAD";
}

/**
 * Valide le formulaire, enregistre la commande dans Supabase,
 * puis ouvre WhatsApp avec un message prérempli.
 */
async function confirmerCommande(e) {
  e.preventDefault();
  orderFeedback.innerHTML = "";

  const nom = document.getElementById("client-name").value.trim();
  const telephone = document.getElementById("client-phone").value.trim();

  if (!nom || !telephone) {
    afficherMessage("يرجى إدخال اسمك ورقم هاتفك.", "danger");
    return;
  }
  if (panier.size === 0) {
    afficherMessage("اختر وجبة واحدة على الأقل قبل التأكيد.", "danger");
    return;
  }

  const total = [...panier.values()].reduce((sum, item) => sum + item.prix, 0);

  submitBtn.disabled = true;
  submitBtn.textContent = "جاري الإرسال...";

  try {
    // 1. Créer la commande
    const { data: order, error: orderError } = await imkliSupabase
      .from("orders")
      .insert({
        client_name: nom,
        client_phone: telephone,
        total: total,
        status: "En attente",
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 2. Créer les lignes de commande (order_items)
    const items = [...panier.values()].map((item) => ({
      order_id: order.id,
      meal_id: item.id,
      prix: item.prix,
    }));

    const { error: itemsError } = await imkliSupabase.from("order_items").insert(items);
    if (itemsError) throw itemsError;

    // 3. Construire le message WhatsApp et ouvrir la conversation
    const message = construireMessageWhatsapp(nom, telephone, total);
    const url = `https://wa.me/${IMKLI_CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");

    afficherMessage("تم تسجيل الطلب! جاري التوجيه إلى واتساب...", "success");
    reinitialiserFormulaire();
  } catch (err) {
    console.error(err);
    afficherMessage("حدث خطأ أثناء تسجيل الطلب.", "danger");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "تأكيد الطلب";
  }
}

function construireMessageWhatsapp(nom, telephone, total) {
  let lignes = [...panier.values()]
    .map((item) => {
      const jourArabe = JOURS_TRADUCTION[item.jour] || item.jour;
      const noteText = item.note ? ` (${item.note})` : '';
      return `- ${jourArabe} : ${item.nom}${noteText} (${item.prix.toFixed(2)} MAD)`;
    })
    .join("\n");

  return `طلب جديد من IMKLI\nالاسم : ${nom}\nالهاتف : ${telephone}\n\nالوجبات المطلوبة :\n${lignes}\n\nالمجموع : ${total.toFixed(2)} MAD`;
}

function reinitialiserFormulaire() {
  orderForm.reset();
  panier.clear();
  document.querySelectorAll(".meal-select").forEach((cb) => (cb.checked = false));
  document.querySelectorAll(".card-note-input").forEach((input) => (input.value = ""));
  rafraichirPanier();
}

function afficherMessage(texte, type) {
  orderFeedback.innerHTML = `<div class="alert alert-${type} mt-2">${escapeHtml(texte)}</div>`;
}

/**
 * Échappe le HTML pour éviter toute injection dans les cartes générées dynamiquement.
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}