# HelloCustom Sync — Deployment Guide

## Architecture

```
Shopify order placed
       │
       ▼  (HTTPS POST, signed with HMAC-SHA256)
  /webhook/orders/create
       │
       ▼
  server.js  →  parser.js  →  sheets.js  →  Google Sheet
```

---

## Step 1 — Google Cloud Setup (one-time)

### 1a. Create a service account

1. Go to https://console.cloud.google.com/
2. Create a project (e.g. "hellocustom-sync")
3. Enable **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a service account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Name: `hellocustom-sheets`
   - Role: **Editor** (or just "Google Sheets Editor" if available)
5. Download the JSON key:
   - Click the service account → Keys tab → Add Key → JSON
   - Save the file as `google-credentials.json` in this project folder

### 1b. Share your Google Sheet with the service account

1. Open your Google Sheet
2. Click **Share**
3. Paste the service account email (looks like `hellocustom-sheets@project-id.iam.gserviceaccount.com`)
4. Give it **Editor** access
5. Click Send

---

## Step 2 — Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in:

| Variable | Where to find it |
|----------|-----------------|
| `SHOPIFY_WEBHOOK_SECRET` | Shopify Admin → Settings → Notifications → Webhooks → show secret |
| `GOOGLE_SHEET_ID` | From your Sheet URL: `https://docs.google.com/spreadsheets/d/**THIS_PART**/edit` |
| `GOOGLE_SHEET_TAB` | Exact name of the tab, default: `Validation Designs` |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to the JSON key file, default: `./google-credentials.json` |

---

## Step 3 — Run locally (test)

```bash
npm install
node server.js
```

You should see:
```
[INFO ] HelloCustom sync server listening on port 3000
[INFO ] Webhook URL: POST /webhook/orders/create
```

### Test with a fake payload

```bash
curl -X POST http://localhost:3000/webhook/orders/create \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": 1001,
    "name": "#1001",
    "created_at": "2025-05-05T10:00:00Z",
    "email": "client@example.com",
    "tags": "portrait-animal",
    "shipping_address": { "first_name": "Sophie", "last_name": "Martin" },
    "line_items": [{
      "title": "Sweatshirt Brodé Portrait",
      "properties": [
        { "name": "Upload photo(s)-1", "value": "https://cdn.shopify.com/photo.jpg" },
        { "name": "Taille", "value": "M" },
        { "name": "Placement de la broderie", "value": "Poitrine gauche" },
        { "name": "Nombre de portraits", "value": "1" },
        { "name": "Champ texte prénom (conditionnel)", "value": "Luna" },
        { "name": "Activation broderie manche", "value": "Oui" },
        { "name": "Champ texte prénom", "value": "Sophie" },
        { "name": "Police", "value": "Script" },
        { "name": "Icône à broder", "value": "Patte" }
      ]
    }]
  }'
```

> **Note**: When `SHOPIFY_WEBHOOK_SECRET` is set, real webhooks include
> an `X-Shopify-Hmac-Sha256` header. The curl test above works only when
> the secret is not set (dev mode). See below for HMAC test script.

---

## Step 4 — Deploy to Railway (recommended, free hobby tier)

### 4a. Push to GitHub first

```bash
git init
git add .
git commit -m "feat: hellocustom shopify→sheets sync"
# create a repo on GitHub, then:
git remote add origin https://github.com/YOUR_USER/hellocustom-sync.git
git push -u origin main
```

### 4b. Deploy on Railway

1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Select `hellocustom-sync`
3. Railway auto-detects Node.js and runs `npm start`
4. Add environment variables in **Variables** tab:
   - `SHOPIFY_WEBHOOK_SECRET`
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SHEET_TAB` = `Validation Designs`
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = paste the **entire contents** of `google-credentials.json`
     (Railway/Render handle this better than a file path in production)
5. Copy the public URL Railway gives you (e.g. `https://hellocustom-sync-production.up.railway.app`)

---

## Step 5 — Deploy to Render (alternative)

1. Go to https://render.com → New → Web Service → Connect GitHub
2. Select `hellocustom-sync`
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add the same env vars as above
6. Deploy

---

## Step 6 — Register the Shopify Webhook

In **Shopify Admin → Settings → Notifications → Webhooks**:

- Click **Create webhook**
- Event: **Order creation**
- Format: **JSON**
- URL: `https://YOUR-RAILWAY-URL.up.railway.app/webhook/orders/create`
- API version: latest (e.g. 2024-10)
- Click Save

Shopify will show the webhook secret — copy it into your `SHOPIFY_WEBHOOK_SECRET` env var.

---

## Step 7 — Verify it works

Place a test order on your Shopify store (or use Shopify's "Send test notification" button next to the webhook). Check:

1. Railway/Render logs show `✓ Order #XXXX written to Google Sheet`
2. A new row appears in your Google Sheet at the next available row after row 3

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| `401 Unauthorized` in logs | HMAC secret mismatch — double-check `SHOPIFY_WEBHOOK_SECRET` |
| `Error: GOOGLE_SHEET_ID is not set` | Add env var in Railway/Render dashboard |
| `403 Forbidden` from Sheets API | Service account email not shared on the Google Sheet |
| `invalid_grant` from Google Auth | Credentials JSON is malformed or wrong project |
| Row added but cells empty | Check field names match exactly (accents matter: `Taille`, `Police`) |

---

## HMAC test script (optional)

Use this to send a properly signed test request locally:

```js
// test-hmac.js  — run with: node test-hmac.js
const crypto = require("crypto");
const http = require("http");

const SECRET = "your_webhook_secret_here";
const payload = JSON.stringify({
  order_number: 1002,
  name: "#1002",
  created_at: new Date().toISOString(),
  email: "test@hellocustom.fr",
  shipping_address: { first_name: "Marie", last_name: "Dupont" },
  line_items: [{
    title: "Sweatshirt Brodé",
    properties: [
      { name: "Upload photo(s)-1", value: "https://example.com/photo.jpg" },
      { name: "Taille", value: "L" },
      { name: "Placement de la broderie", value: "Dos" },
      { name: "Nombre de portraits", value: "2" },
      { name: "Champ texte prénom (conditionnel)", value": "Max" }
    ]
  }]
});

const hmac = crypto.createHmac("sha256", SECRET).update(payload).digest("base64");

const req = http.request({
  hostname: "localhost", port: 3000,
  path: "/webhook/orders/create", method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Hmac-Sha256": hmac,
  }
}, (res) => console.log("Status:", res.statusCode));

req.write(payload);
req.end();
```
