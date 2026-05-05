/**
 * parseOrder
 * Extrait les colonnes A→Q depuis un payload webhook Shopify brut.
 * Retourne un tableau ordonné prêt à être inséré dans Google Sheets.
 */
function parseOrder(order) {
  const orderNumber = String(order.order_number || order.name || "");
  const orderDate   = formatDate(order.created_at);
  const clientName  = buildClientName(order);
  const clientEmail = (order.email || "").trim();

  const allProperties = collectProperties(order.line_items || []);
  const productType   = detectProductType(order.line_items || []);
  const category      = detectCategory(order.tags || "");

  const photoUrl        = getField(allProperties, "Upload photo(s)-1");
  const size            = getField(allProperties, "Taille");
  const placement       = getField(allProperties, "Placement de la broderie");
  const nbPortraits     = getField(allProperties, "Nombre de portraits");
  const nameUnder       = getField(allProperties, "Champ texte prénom (conditionnel)");
  const sleeveActivation= getField(allProperties, "Activation broderie manche");
  const sleeveText      = getField(allProperties, "Champ texte prénom");
  const font            = getField(allProperties, "Police");
  const sleeveIcon      = getField(allProperties, "Icône à broder");

  const notes = buildNotes({
    size, placement, nbPortraits, nameUnder,
    sleeveActivation, sleeveText, sleeveIcon, font,
  });

  // Colonnes A → Q
  return [
    orderNumber,         // A – Order Number
    orderDate,           // B – Order Date
    productType,         // C – Product Type
    category,            // D – Category
    clientName,          // E – Client Name
    clientEmail,         // F – Email Client
    photoUrl,            // G – Photo Client URL
    "",                  // H – Design Usine (usine remplit)
    "Need to validate",  // I – Statut
    "",                  // J – Email Envoyé le
    "",                  // K – Date Validation
    "",                  // L – Validé Par
    "",                  // M – Réponse Client
    "EN ATTENTE DESIGN", // N – Factory Action
    "0",                 // O – Nb Retouches
    "Normal",            // P – Priorité
    notes,               // Q – Notes internes
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectProperties(lineItems) {
  const map = {};
  for (const item of lineItems) {
    for (const prop of item.properties || []) {
      const key = (prop.name || "").trim();
      const val = (prop.value || "").trim();
      // Ignorer les valeurs vides ou les placeholders Globo ("_", "--")
      if (key && val && val !== "_" && val !== "--") {
        if (!map[key]) map[key] = val;
      }
    }
  }
  return map;
}

function getField(props, name) {
  if (props[name] !== undefined) return props[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(props)) {
    if (k.toLowerCase() === lower) return v;
  }
  return "";
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const dd   = String(d.getDate()).padStart(2, "0");
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function buildClientName(order) {
  const src = order.shipping_address || order.billing_address || order.customer || {};
  const first = src.first_name || order.customer?.first_name || "";
  const last  = src.last_name  || order.customer?.last_name  || "";
  return [first, last].filter(Boolean).join(" ").trim();
}

/**
 * Déduit le type de produit depuis les titres des line items.
 * Valeurs possibles dans le sheet : Pull / T-Shirt / Hoodie
 */
function detectProductType(lineItems) {
  for (const item of lineItems) {
    const title = (item.title || "").toLowerCase();
    if (title.includes("hoodie") || title.includes("capuche")) return "Hoodie";
    if (title.includes("t-shirt") || title.includes("tshirt"))  return "T-Shirt";
  }
  return "Pull"; // défaut pour sweatshirt sans capuche
}

/**
 * Déduit la catégorie depuis les tags de la commande Shopify.
 *
 * Tags attendus (configurés dans Shopify) :
 *   portrait-animal  → Photo Animal
 *   portrait-couple  → Photo Couple
 *   portrait-famille → Photo Famille
 *   portrait-bebe    → Photo Bébé
 *
 * Si aucun tag connu n'est trouvé, retourne "Photo Animal" par défaut.
 */
function detectCategory(tags) {
  const t = tags.toLowerCase();
  if (t.includes("portrait-couple"))  return "Photo Couple";
  if (t.includes("portrait-famille")) return "Photo Famille";
  if (t.includes("portrait-bebe"))    return "Photo Bébé";
  if (t.includes("portrait-animal"))  return "Photo Animal";
  return "Photo Animal"; // fallback
}

function buildNotes({ size, placement, nbPortraits, nameUnder,
                      sleeveActivation, sleeveText, sleeveIcon, font }) {
  const parts = [];
  if (size)             parts.push(`Taille: ${size}`);
  if (placement)        parts.push(`Placement: ${placement}`);
  if (nbPortraits)      parts.push(`Portraits: ${nbPortraits}`);
  if (nameUnder)        parts.push(`Prénom sous portrait: ${nameUnder}`);
  if (sleeveActivation) parts.push(`Broderie manche: ${sleeveActivation}`);
  if (sleeveText)       parts.push(`Texte manche: ${sleeveText}`);
  if (sleeveIcon)       parts.push(`Icône manche: ${sleeveIcon}`);
  if (font)             parts.push(`Police: ${font}`);
  return parts.join(" | ");
}

module.exports = { parseOrder };
