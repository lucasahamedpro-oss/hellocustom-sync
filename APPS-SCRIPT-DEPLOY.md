# Déploiement — Google Apps Script HelloCustom

## Étape 1 — Ouvrir l'éditeur Apps Script

1. Ouvre ton Google Sheet
2. Menu **Extensions → Apps Script**
3. Supprime tout le code existant dans `Code.gs`
4. Colle tout le contenu de `hellocustom-apps-script.gs`
5. Clique **Enregistrer** (icône disquette ou Cmd+S)

---

## Étape 2 — Vérifier la config

En haut du script, vérifie ces valeurs dans `CFG` :

```js
LUCAS_EMAIL : 'hellocustom.fr@gmail.com',  // ← ton email Gmail
FACTORY_EMAIL: 'csmy6699@sina.com',
AUTO_APPROVE_H: 24,
```

---

## Étape 3 — Autoriser l'accès Gmail + Sheets

1. Dans l'éditeur, sélectionne la fonction `setupAllTriggers` dans le menu déroulant
2. Clique **Exécuter**
3. Une popup "Autorisation requise" apparaît → clique **Examiner les autorisations**
4. Choisis ton compte Google (hellocustom.fr@gmail.com)
5. Clique **Avancé → Accéder à HelloCustom (non sécurisé)**
6. Clique **Autoriser**

> Cela autorise le script à lire/écrire Gmail et le sheet.

---

## Étape 4 — Créer les triggers

La fonction `setupAllTriggers` crée automatiquement :

| Trigger | Fonction | Fréquence |
|---------|----------|-----------|
| onEdit | `onEditInstallable` | À chaque modification |
| Timer | `automation2_CheckReplies` | Toutes les 30 min |
| Timer | `automation4_AutoApprove` | Toutes les heures |

Une popup de confirmation apparaît quand c'est bon.

Pour vérifier : Apps Script → menu **Déclencheurs** (icône horloge à gauche).

---

## Étape 5 — Checklist de test

### Test Automation 1 (design prêt → email client)
1. Dans le sheet, colle une URL dans la colonne H d'une vraie commande
2. L'email doit arriver dans la boîte du client
3. La colonne I passe à "Design Sent", colonne J est remplie
4. Colonne Q contient `📧 Email design envoyé à...`

### Test Automation 2 (lecture réponse client)
1. Depuis une boîte email client, réponds à l'email de design avec "OUI"
2. Attends 30 min OU exécute manuellement `TEST_automation2` dans l'éditeur
3. La colonne I passe à "Approved", colonnes K/L/M remplies
4. L'usine reçoit un email "APPROVED"
5. Lucas reçoit une notif statut

### Test Automation 3 (email usine)
1. Mets manuellement une colonne I à "Approved" via le menu déroulant
2. L'usine doit recevoir l'email "APPROVED — Start embroidery"
3. Lucas reçoit une notif

### Test Automation 4 (auto-validation 24h)
1. Exécute `TEST_automation4` dans l'éditeur
2. Toutes les lignes "Design Sent" dont J est vieux de plus de 24h passent en "Approved"
3. L'usine et le client reçoivent un email

### Test Automation 5 (notif Lucas)
1. Change n'importe quelle colonne I manuellement
2. Lucas reçoit un email avec le numéro de commande et le nouveau statut

---

## Points importants

**Réponses Gmail ambiguës** : si un client répond quelque chose d'incompréhensible,
le script envoie un email à Lucas pour qu'il décide manuellement.

**Doublons d'emails usine** : le script vérifie `FACTORY_NOTIFIED` dans les notes
pour ne jamais envoyer deux fois l'email à l'usine pour la même commande.

**Doublons de réponses** : le script stocke l'ID du message traité (`REPLY_PROCESSED:xxx`)
dans les notes pour ne jamais traiter deux fois la même réponse.

**Format date colonne J** : doit être au format `dd/MM/yyyy HH:mm` (géré automatiquement
par le script). Si tu remplis J manuellement, respecte ce format.
