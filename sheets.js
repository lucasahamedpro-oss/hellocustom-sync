const { google } = require("googleapis");
const log = require("./logger");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_TAB = process.env.GOOGLE_SHEET_TAB || "Validation Designs";
const KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || "./google-credentials.json";

// ── Auth ───────────────────────────────────────────────────────────────────────
let _auth = null;

async function getAuth() {
  if (_auth) return _auth;

  let credentials;

  // Support inline JSON via env var (useful for Railway/Render secrets)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  } else {
    credentials = require(require("path").resolve(KEY_PATH));
  }

  _auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return _auth;
}

// ── Append a row ──────────────────────────────────────────────────────────────

/**
 * Appends one row (array of cell values, columns A→Q) to the sheet.
 * Data starts at row 4; Google Sheets append API adds after the last filled row.
 */
async function appendOrderToSheet(row) {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID is not set in environment");

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const range = `${SHEET_TAB}!A:Q`;

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED", // Parses dates, numbers, URLs correctly
    insertDataOption: "INSERT_ROWS",  // Always inserts a new row
    requestBody: {
      values: [row],
    },
  });

  const updatedRange = response.data.updates?.updatedRange || "unknown range";
  log.info(`Sheet updated → ${updatedRange}`);
  return response.data;
}

module.exports = { appendOrderToSheet };
