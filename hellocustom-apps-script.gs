// ═══════════════════════════════════════════════════════════════════════════════
//  HelloCustom — Validation Designs — Google Apps Script
//  5 automations : envoi email design, lecture réponses, notif usine,
//                  auto-validation 24h, notif Lucas
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONFIG ─────────────────────────────────────────────────────────────────────
const CFG = {
  SHEET_NAME    : 'Validation Designs',
  DATA_START    : 4,          // première ligne de données
  FACTORY_EMAIL : 'csmy6699@sina.com',
  LUCAS_EMAIL   : 'hellocustom.fr@gmail.com', // ← ton email à toi
  AUTO_APPROVE_H: 24,         // heures avant validation automatique
};

// Indices colonnes (0-based → colonne A = 0)
const C = {
  ORDER    : 0,   // A
  DATE     : 1,   // B
  PRODUCT  : 2,   // C
  CATEGORY : 3,   // D
  NAME     : 4,   // E
  EMAIL    : 5,   // F
  PHOTO    : 6,   // G
  DESIGN   : 7,   // H
  STATUS   : 8,   // I
  SENT_AT  : 9,   // J
  VALID_AT : 10,  // K
  VALID_BY : 11,  // L
  RESPONSE : 12,  // M
  FACTORY  : 13,  // N
  RETOUCHES: 14,  // O
  PRIORITY : 15,  // P
  NOTES    : 16,  // Q
};

// ── HELPERS ────────────────────────────────────────────────────────────────────

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_NAME);
}

function getDataRows() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < CFG.DATA_START) return { sheet, rows: [], startRow: CFG.DATA_START };
  const data = sheet.getRange(CFG.DATA_START, 1, lastRow - CFG.DATA_START + 1, 17).getValues();
  return { sheet, rows: data, startRow: CFG.DATA_START };
}

function ts() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function addNote(sheet, rowIndex, msg) {
  const cell = sheet.getRange(rowIndex, C.NOTES + 1);
  const existing = cell.getValue() || '';
  cell.setValue((existing ? existing + '\n' : '') + '[' + ts() + '] ' + msg);
}

function isUrl(val) {
  return typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'));
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION 1 + 3 + 5 — Trigger onEdit (installable)
//  → quand colonne H passe de vide à URL  : envoie email design au client
//  → quand colonne I passe à "Approved"   : envoie email usine
//  → quand colonne I change               : notifie Lucas
// ══════════════════════════════════════════════════════════════════════════════

function onEditInstallable(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CFG.SHEET_NAME) return;

    const row     = e.range.getRow();
    const col     = e.range.getColumn(); // 1-based
    const newVal  = e.range.getValue();
    const oldVal  = e.oldValue || '';

    if (row < CFG.DATA_START) return;

    const rowData = sheet.getRange(row, 1, 1, 17).getValues()[0];

    // ── Automation 1 : colonne H → URL ────────────────────────────────────
    if (col === C.DESIGN + 1 && isUrl(newVal) && !isUrl(oldVal)) {
      automation1_DesignReady(sheet, row, rowData, newVal);
    }

    // ── Automation 3 : colonne I → "Approved" (manuel) ────────────────────
    if (col === C.STATUS + 1 && newVal === 'Approved' && oldVal !== 'Approved') {
      automation3_NotifyFactory(sheet, row, rowData);
    }

    // ── Automation 5 : colonne I change → notif Lucas ─────────────────────
    if (col === C.STATUS + 1 && newVal !== oldVal) {
      automation5_NotifyLucas(rowData, newVal);
    }

  } catch (err) {
    Logger.log('onEditInstallable error: ' + err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION 1 — Design prêt : email au client
// ══════════════════════════════════════════════════════════════════════════════

function automation1_DesignReady(sheet, rowIndex, rowData, designUrl) {
  const clientEmail = rowData[C.EMAIL];
  const clientName  = rowData[C.NAME];
  const orderNum    = rowData[C.ORDER];

  if (!clientEmail) {
    addNote(sheet, rowIndex, '⚠️ Email client manquant — email design non envoyé');
    return;
  }
  if (!designUrl) {
    addNote(sheet, rowIndex, '⚠️ URL design manquante — email non envoyé');
    return;
  }

  const subject = '🎨 Votre portrait est prêt à valider — HelloCustom';
  const body = `Bonjour ${clientName},

Bonne nouvelle ! Votre portrait est prêt 🎉

👉 Voir votre design ici : ${designUrl}

Regardez attentivement :
- La ressemblance avec votre animal
- Les couleurs
- Les détails du pelage

Répondez directement à cet email :
✅ Tapez OUI → on lance la broderie immédiatement
✏️ Tapez NON + décrivez ce qui ne va pas → on retouche sans frais

⚠️ Sans réponse sous 24h, le design sera automatiquement validé.

Réf. commande : #${orderNum}

À très vite,
Élodie & l'équipe HelloCustom 🐾`;

  const sent = GmailApp.sendEmail(clientEmail, subject, body, {
    name: 'HelloCustom',
    replyTo: CFG.LUCAS_EMAIL,
  });

  // Stocker le threadId dans Notes pour pouvoir matcher les réponses
  const thread = GmailApp.search('in:sent subject:"' + subject + '" to:' + clientEmail, 0, 1);
  const threadId = thread.length > 0 ? thread[0].getId() : '';

  sheet.getRange(rowIndex, C.STATUS + 1).setValue('Design Sent');
  sheet.getRange(rowIndex, C.SENT_AT + 1).setValue(ts());
  addNote(sheet, rowIndex, '📧 Email design envoyé à ' + clientEmail + (threadId ? ' | THREAD:' + threadId : ''));

  Logger.log('✓ Automation 1 — email envoyé à ' + clientEmail + ' pour commande #' + orderNum);
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION 2 — Lecture réponses Gmail (toutes les 30 min)
// ══════════════════════════════════════════════════════════════════════════════

function automation2_CheckReplies() {
  try {
    const { sheet, rows, startRow } = getDataRows();

    // Mots-clés validation positive
    const OUI_KEYWORDS = ['oui', 'ok', 'parfait', 'valide', 'validé', 'c\'est bien', 'top', 'nickel',
                          'super', 'yes', 'good', 'great', 'approved', 'j\'approuve', 'lancez'];
    // Mots-clés retouche
    const NON_KEYWORDS = ['non', 'modifier', 'changer', 'pas bien', 'ressemble pas', 'couleur',
                          'retouche', 'refaire', 'problem', 'problème', 'pas correct', 'pas exactement'];

    rows.forEach((row, i) => {
      const rowIndex = startRow + i;
      const status   = row[C.STATUS];
      const notes    = row[C.NOTES] || '';
      const orderNum = row[C.ORDER];
      const clientEmail = row[C.EMAIL];

      if (status !== 'Design Sent') return;

      // Retrouver le threadId stocké dans Notes
      const threadMatch = notes.match(/THREAD:([a-zA-Z0-9]+)/);
      if (!threadMatch) return;
      const threadId = threadMatch[1];

      let thread;
      try {
        thread = GmailApp.getThreadById(threadId);
      } catch(e) {
        Logger.log('Thread introuvable: ' + threadId);
        return;
      }
      if (!thread) return;

      const messages = thread.getMessages();
      if (messages.length < 2) return; // Pas encore de réponse

      // Prendre le dernier message qui n'est pas de nous
      const myEmail = Session.getActiveUser().getEmail();
      const replies = messages.filter(m => m.getFrom().indexOf(myEmail) === -1 &&
                                          m.getFrom().indexOf(CFG.LUCAS_EMAIL) === -1);
      if (replies.length === 0) return;

      const lastReply  = replies[replies.length - 1];
      const replyText  = lastReply.getPlainBody().toLowerCase();
      const replyFull  = lastReply.getPlainBody();
      const replyDate  = Utilities.formatDate(lastReply.getDate(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

      // Éviter de traiter 2x la même réponse (vérifier si la réponse a déjà été traitée)
      if (notes.includes('REPLY_PROCESSED:' + lastReply.getId())) return;

      const isOui = OUI_KEYWORDS.some(k => replyText.includes(k));
      const isNon = NON_KEYWORDS.some(k => replyText.includes(k));

      if (isOui && !isNon) {
        // ── Validation positive ────────────────────────────────────────────
        sheet.getRange(rowIndex, C.STATUS   + 1).setValue('Approved');
        sheet.getRange(rowIndex, C.VALID_AT + 1).setValue(ts());
        sheet.getRange(rowIndex, C.VALID_BY + 1).setValue('Client');
        sheet.getRange(rowIndex, C.RESPONSE + 1).setValue(replyFull.substring(0, 500));
        sheet.getRange(rowIndex, C.FACTORY  + 1).setValue('LANCER BRODERIE');
        addNote(sheet, rowIndex, '✅ Réponse client POSITIVE — REPLY_PROCESSED:' + lastReply.getId());

        automation3_NotifyFactory(sheet, rowIndex, sheet.getRange(rowIndex, 1, 1, 17).getValues()[0]);
        sendClientConfirmation(row[C.NAME], clientEmail);
        automation5_NotifyLucas(row, 'Approved');
        Logger.log('✓ Automation 2 — Approuvé : commande #' + orderNum);

      } else if (isNon) {
        // ── Retouche demandée ──────────────────────────────────────────────
        const currentRetouches = parseInt(row[C.RETOUCHES]) || 0;
        sheet.getRange(rowIndex, C.STATUS    + 1).setValue('Revision Requested');
        sheet.getRange(rowIndex, C.RESPONSE  + 1).setValue(replyFull.substring(0, 500));
        sheet.getRange(rowIndex, C.FACTORY   + 1).setValue('RETOUCHE');
        sheet.getRange(rowIndex, C.RETOUCHES + 1).setValue(currentRetouches + 1);
        addNote(sheet, rowIndex, '✏️ Retouche demandée par client — REPLY_PROCESSED:' + lastReply.getId());

        sendRetoucheNotifToLucas(row, replyFull);
        automation5_NotifyLucas(row, 'Revision Requested');
        Logger.log('✓ Automation 2 — Retouche : commande #' + orderNum);

      } else {
        // Réponse ambiguë — notifier Lucas pour qu'il tranche
        addNote(sheet, rowIndex, '❓ Réponse ambiguë reçue — REPLY_PROCESSED:' + lastReply.getId());
        const ambSubject = '❓ Réponse ambiguë — Commande #' + orderNum;
        const ambBody = 'Commande #' + orderNum + ' (' + row[C.NAME] + ')\n\nRéponse client :\n' + replyFull + '\n\nLien design : ' + row[C.DESIGN];
        GmailApp.sendEmail(CFG.LUCAS_EMAIL, ambSubject, ambBody, { name: 'HelloCustom Bot' });
        Logger.log('⚠️ Automation 2 — Réponse ambiguë : commande #' + orderNum);
      }
    });

  } catch(err) {
    Logger.log('automation2_CheckReplies error: ' + err.message);
  }
}

function sendClientConfirmation(name, email) {
  const subject = '✅ Design validé — votre broderie est lancée !';
  const body = `Bonjour ${name},

Votre design est validé ! On lance la broderie maintenant. 🎉

Vous recevrez votre pull dans 7 à 14 jours ouvrés.

Merci pour votre confiance,
Élodie & l'équipe HelloCustom 🐾`;

  GmailApp.sendEmail(email, subject, body, { name: 'HelloCustom' });
}

function sendRetoucheNotifToLucas(rowData, replyText) {
  const subject = '⚠️ Retouche demandée — Commande #' + rowData[C.ORDER];
  const body = `Commande #${rowData[C.ORDER]}
Client : ${rowData[C.NAME]} (${rowData[C.EMAIL]})
Lien design : ${rowData[C.DESIGN]}

Commentaire client :
${replyText}

Transmets les instructions à l'usine.`;

  GmailApp.sendEmail(CFG.LUCAS_EMAIL, subject, body, { name: 'HelloCustom Bot' });
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION 3 — Email usine quand design approuvé
// ══════════════════════════════════════════════════════════════════════════════

function automation3_NotifyFactory(sheet, rowIndex, rowData) {
  const orderNum  = rowData[C.ORDER];
  const clientName= rowData[C.NAME];
  const designUrl = rowData[C.DESIGN];
  const notes     = rowData[C.NOTES] || '';

  if (!designUrl) {
    addNote(sheet, rowIndex, '⚠️ URL design manquante — email usine non envoyé');
    return;
  }

  // Ne pas renvoyer si déjà envoyé
  if (notes.includes('FACTORY_NOTIFIED')) return;

  const subject = '✅ APPROVED — Start embroidery: #' + orderNum;
  const body = `Order #${orderNum} — ${clientName} is APPROVED.

Design: ${designUrl}

Please start the embroidery now.

Thank you,
HelloCustom Team`;

  GmailApp.sendEmail(CFG.FACTORY_EMAIL, subject, body, { name: 'HelloCustom' });
  addNote(sheet, rowIndex, '🏭 Email usine envoyé — FACTORY_NOTIFIED');
  Logger.log('✓ Automation 3 — Usine notifiée pour commande #' + orderNum);
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION 4 — Auto-validation après 24h sans réponse (toutes les heures)
// ══════════════════════════════════════════════════════════════════════════════

function automation4_AutoApprove() {
  try {
    const { sheet, rows, startRow } = getDataRows();
    const now = new Date();

    rows.forEach((row, i) => {
      const rowIndex = startRow + i;
      if (row[C.STATUS] !== 'Design Sent') return;

      const sentAtStr = row[C.SENT_AT];
      if (!sentAtStr) return;

      // Parser la date stockée au format dd/MM/yyyy HH:mm
      const parts = sentAtStr.toString().match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
      if (!parts) return;
      const sentAt = new Date(parts[3], parts[2] - 1, parts[1], parts[4], parts[5]);
      const diffH  = (now - sentAt) / (1000 * 60 * 60);

      if (diffH < CFG.AUTO_APPROVE_H) return;

      const orderNum   = row[C.ORDER];
      const clientName = row[C.NAME];
      const clientEmail= row[C.EMAIL];

      sheet.getRange(rowIndex, C.STATUS   + 1).setValue('Approved');
      sheet.getRange(rowIndex, C.VALID_AT + 1).setValue(ts());
      sheet.getRange(rowIndex, C.VALID_BY + 1).setValue('Auto-approuvé (24h)');
      sheet.getRange(rowIndex, C.FACTORY  + 1).setValue('LANCER BRODERIE');
      addNote(sheet, rowIndex, '⏰ Auto-validé après 24h sans réponse');

      // Email client
      if (clientEmail) {
        GmailApp.sendEmail(clientEmail,
          '✅ Design validé automatiquement — HelloCustom',
          `Bonjour ${clientName},\n\nSans retour de votre part sous 24h, votre design a été validé automatiquement.\nVotre pull est maintenant en cours de broderie !\n\nÀ très vite,\nÉlodie & l'équipe HelloCustom 🐾`,
          { name: 'HelloCustom' }
        );
      }

      // Email usine
      automation3_NotifyFactory(sheet, rowIndex, sheet.getRange(rowIndex, 1, 1, 17).getValues()[0]);
      automation5_NotifyLucas(row, 'Approved (auto-24h)');
      Logger.log('✓ Automation 4 — Auto-validé : commande #' + orderNum);
    });

  } catch(err) {
    Logger.log('automation4_AutoApprove error: ' + err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION 5 — Notification Lucas à chaque changement de statut
// ══════════════════════════════════════════════════════════════════════════════

function automation5_NotifyLucas(rowData, newStatus) {
  const orderNum  = rowData[C.ORDER];
  const clientName= rowData[C.NAME];
  const designUrl = rowData[C.DESIGN] || '—';
  const subject   = '[HelloCustom] #' + orderNum + ' — Statut : ' + newStatus;
  const body      = `Commande : #${orderNum}
Client : ${clientName}
Nouveau statut : ${newStatus}
Design : ${designUrl}`;

  GmailApp.sendEmail(CFG.LUCAS_EMAIL, subject, body, { name: 'HelloCustom Bot' });
  Logger.log('✓ Automation 5 — Lucas notifié : #' + orderNum + ' → ' + newStatus);
}

// ══════════════════════════════════════════════════════════════════════════════
//  SETUP — Crée tous les triggers automatiquement (lance une seule fois)
// ══════════════════════════════════════════════════════════════════════════════

function setupAllTriggers() {
  // Supprimer les anciens triggers pour éviter les doublons
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Trigger onEdit installable (permet l'envoi d'emails depuis onEdit)
  ScriptApp.newTrigger('onEditInstallable')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Automation 2 — lecture réponses Gmail toutes les 30 min
  ScriptApp.newTrigger('automation2_CheckReplies')
    .timeBased()
    .everyMinutes(30)
    .create();

  // Automation 4 — auto-validation 24h toutes les heures
  ScriptApp.newTrigger('automation4_AutoApprove')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('✓ Tous les triggers créés avec succès');
  SpreadsheetApp.getUi().alert('✅ Triggers créés !\n\n• onEdit → envoi email design + notif usine + notif Lucas\n• Toutes les 30 min → lecture réponses Gmail\n• Toutes les heures → auto-validation 24h');
}

// ══════════════════════════════════════════════════════════════════════════════
//  TEST — Fonctions de test pour chaque automation
// ══════════════════════════════════════════════════════════════════════════════

function TEST_automation1() {
  // Simule l'ajout d'un design URL en colonne H sur la ligne 4
  const sheet = getSheet();
  const rowData = sheet.getRange(4, 1, 1, 17).getValues()[0];
  Logger.log('Test Automation 1 — ligne 4 : ' + JSON.stringify(rowData));
  automation1_DesignReady(sheet, 4, rowData, rowData[C.DESIGN] || 'https://example.com/design-test.jpg');
  Logger.log('✓ Test Automation 1 terminé — vérifie Gmail et le sheet');
}

function TEST_automation2() {
  Logger.log('Test Automation 2 — Lecture des réponses Gmail...');
  automation2_CheckReplies();
  Logger.log('✓ Test Automation 2 terminé — vérifie les logs');
}

function TEST_automation4() {
  Logger.log('Test Automation 4 — Auto-validation 24h...');
  automation4_AutoApprove();
  Logger.log('✓ Test Automation 4 terminé — vérifie le sheet');
}
