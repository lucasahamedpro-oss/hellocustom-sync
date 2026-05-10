require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const { appendOrderToSheet } = require("./sheets");
const { parseOrder } = require("./parser");
const log = require("./logger");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Raw body needed for HMAC verification ─────────────────────────────────────
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send("HelloCustom sync server is running ✓"));

// ── Shopify webhook endpoint ──────────────────────────────────────────────────
app.post("/webhook/orders/create", async (req, res) => {
  // 1. Verify HMAC signature
  if (!verifyShopifyHmac(req)) {
    log.warn("HMAC verification failed – request rejected");
    return res.status(401).send("Unauthorized");
  }

  // 2. Acknowledge immediately (Shopify requires < 5 s)
  res.status(200).send("OK");

  // 3. Process asynchronously
  const order = req.body;
  log.info(`Received order #${order.order_number} (id: ${order.id})`);

  // Filtre : uniquement les commandes pull portrait animal
  if (!isPortraitAnimalOrder(order)) {
    log.info(`⏭ Order #${order.order_number} ignorée (tags: "${order.tags}")`);
    return;
  }

  try {
    const row = parseOrder(order);
    log.info(`Parsed row for order #${order.order_number}:`, row);

    await appendOrderToSheet(row);
    log.info(`✓ Order #${order.order_number} written to Google Sheet`);
  } catch (err) {
    log.error(`✗ Failed to process order #${order.order_number}:`, err.message);
  }
});

// ── Filtre commandes portrait animal ─────────────────────────────────────────
function isPortraitAnimalOrder(order) {
  const tags = (order.tags || "").toLowerCase();

  // 1. Vérifie les tags Shopify
  const hasTag = tags.includes("portrait animal pull") ||
                 tags.includes("portrait-animal");

  // 2. Vérifie le titre ou SKU du produit (plus fiable que les tags)
  const hasProductMatch = (order.line_items || []).some(item => {
    const title = (item.title || "").toLowerCase();
    const sku   = (item.sku   || "").toLowerCase();
    return title.includes("brodé animal") ||
           title.includes("brode animal") ||
           sku.includes("hc-sweat-cat")   ||
           sku.includes("hc-sweat-ani");
  });

  // 3. Fallback : présence d'une photo uploadée via Globo
  const hasPhoto = (order.line_items || []).some(item =>
    (item.properties || []).some(p => {
      const name = (p.name || "").trim().toLowerCase();
      const val  = (p.value || "").trim();
      return name.startsWith("upload photo") && val.length > 0;
    })
  );

  return hasTag || hasProductMatch || hasPhoto;
}

// ── HMAC verification ─────────────────────────────────────────────────────────
function verifyShopifyHmac(req) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    log.warn("SHOPIFY_WEBHOOK_SECRET not set – skipping HMAC check (dev mode)");
    return true;
  }

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

app.listen(PORT, () => {
  log.info(`HelloCustom sync server listening on port ${PORT}`);
  log.info(`Webhook URL: POST /webhook/orders/create`);
});
