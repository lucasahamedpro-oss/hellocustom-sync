/**
 * backfill.js
 * Récupère toutes les commandes Shopify existantes et les ajoute au sheet.
 * Lance avec : node backfill.js
 */
require("dotenv").config();
const https = require("https");
const { appendOrderToSheet } = require("./sheets");
const { parseOrder } = require("./parser");
const log = require("./logger");

const SHOP = process.env.SHOPIFY_SHOP_DOMAIN;   // ex: hellocustom.myshopify.com
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;   // shpat_...

if (!SHOP || !TOKEN) {
  console.error("Ajoute SHOPIFY_SHOP_DOMAIN et SHOPIFY_ADMIN_TOKEN dans .env");
  process.exit(1);
}

async function fetchOrders(pageInfo = null) {
  const params = new URLSearchParams({
    limit: "250",
    status: "any",
  });
  if (pageInfo) params.set("page_info", pageInfo);

  const url = `https://${SHOP}/admin/api/2024-10/orders.json?${params}`;

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json",
      },
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        const linkHeader = res.headers["link"] || "";
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
        const nextPageInfo = nextMatch ? nextMatch[1] : null;
        resolve({ orders: JSON.parse(data).orders || [], nextPageInfo });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function isPortraitAnimalOrder(order) {
  const tags = (order.tags || "").toLowerCase();
  const hasTag = tags.includes("portrait animal pull") || tags.includes("portrait-animal");
  const hasPhoto = (order.line_items || []).some(item =>
    (item.properties || []).some(p =>
      (p.name || "").trim() === "Upload photo(s)-1" && (p.value || "").trim()
    )
  );
  return hasTag || hasPhoto;
}

async function run() {
  log.info("Démarrage du backfill...");
  let total = 0;
  let skipped = 0;
  let pageInfo = null;

  do {
    const { orders, nextPageInfo } = await fetchOrders(pageInfo);
    log.info(`Page récupérée : ${orders.length} commandes`);

    for (const order of orders) {
      if (!isPortraitAnimalOrder(order)) {
        skipped++;
        continue;
      }

      try {
        const row = parseOrder(order);
        await appendOrderToSheet(row);
        log.info(`✓ #${order.order_number} – ${order.email}`);
        total++;
        // Pause pour ne pas dépasser les quotas Google Sheets API
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        log.error(`✗ #${order.order_number} : ${err.message}`);
      }
    }

    pageInfo = nextPageInfo;
  } while (pageInfo);

  log.info(`Backfill terminé : ${total} commandes ajoutées, ${skipped} ignorées.`);
}

run().catch(err => {
  log.error("Erreur fatale :", err.message);
  process.exit(1);
});
