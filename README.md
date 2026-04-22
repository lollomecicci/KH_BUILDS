# ⚔ KH Builds — Database Build Knighthood

Web app per **consultare, condividere e votare** le migliori build di Knighthood.

---

## Struttura Progetto

```
testKH_builds/
├── index.html                  ← Frontend SPA (dark theme, responsive)
├── gas/
│   ├── Code.gs                 ← Backend Google Apps Script
│   ├── appsscript.json         ← Configurazione GAS
│   └── Index.html              ← (generato da sync-gas.ps1)
├── local-backend/
│   ├── server.js               ← Backend Node.js/Express (sviluppo)
│   ├── package.json
│   ├── .env.example            ← Template configurazione
│   └── service-account.json.example
├── scripts/
│   ├── publish-gas.ps1         ← Deploy su Google Apps Script
│   └── sync-gas.ps1            ← Sincronizza file per deploy
├── .clasp.json.example
├── .gitignore
└── README.md
```

---

## Funzionalità

- **Sfoglia build** con filtri per modalità (Arena / PvE / War / Rift)
- **Ordina** per punteggio voti, data, più votate
- **Cerca** per titolo, arma, eroe
- **Crea build** con scheda completa (arma, armatura, eroi, charm, strategia)
- **Vota** le build (sistema anti-duplicato via localStorage + server)
- **Statistiche** in tempo reale (totale build per modalità)
- **Responsive** per mobile e desktop

---

## Struttura Database (Google Sheets)

### Sheet `Builds`
| Colonna | Campo | Tipo |
|---------|-------|------|
| A | ID | UUID |
| B | Timestamp | Data/Ora |
| C | Title | Testo (max 100) |
| D | Mode | arena/pve/war/rift |
| E | Weapon | Testo (max 100) |
| F | Helmet | Testo |
| G | Chest | Testo |
| H | Gloves | Testo |
| I | Boots | Testo |
| J | Hero1 | Testo |
| K | Hero2 | Testo |
| L | Hero3 | Testo |
| M | Charms | Testo (max 200) |
| N | Description | Testo (max 1000) |
| O | Author | Testo |
| P | Upvotes | Numero |
| Q | Downvotes | Numero |
| R | Status | active/hidden |

### Sheet `Votes`
| Colonna | Campo |
|---------|-------|
| A | BuildID |
| B | VoterKey |
| C | VoteType (up/down) |
| D | Timestamp |

---

## Setup — Percorso 1: Google Apps Script (Produzione)

### 1. Crea il Google Sheets
1. Vai su [sheets.google.com](https://sheets.google.com) → Crea nuovo foglio
2. Copia l'ID dalla URL: `https://docs.google.com/spreadsheets/d/**ID**/edit`

### 2. Crea il progetto Apps Script
1. Vai su [script.google.com](https://script.google.com) → Nuovo progetto
2. Imposta il nome: `KH Builds`
3. Copia il contenuto di `gas/Code.gs` nell'editor

### 3. Configura il Spreadsheet ID
In Apps Script: **Progetto → Proprietà script → Aggiungi proprietà**
```
SPREADSHEET_ID = <il tuo ID foglio>
```

### 4. Deploy
In Apps Script: **Deploy → Nuova implementazione**
- Tipo: **App web**
- Esegui come: **Me**
- Accesso: **Chiunque**
- Clicca **Implementa** e copia l'URL

### 5. Collega il frontend
Apri `index.html` e imposta:
```javascript
const GAS_URL = 'https://script.google.com/macros/s/TUO_ID/exec';
```

### 6. (Opzionale) Deploy con clasp
```bash
npm install -g @google/clasp
clasp login
cp .clasp.json.example .clasp.json
# Modifica .clasp.json con il tuo scriptId
./scripts/publish-gas.ps1
```

---

## Setup — Percorso 2: Backend Locale (Sviluppo)

### Prerequisiti
- Node.js 18+
- Un progetto Google Cloud con Google Sheets API abilitata
- Un Service Account con accesso al foglio

### 1. Installa dipendenze
```bash
cd local-backend
npm install
```

### 2. Configura le credenziali
```bash
cp .env.example .env
cp service-account.json.example service-account.json
# Modifica .env con il tuo SPREADSHEET_ID
# Sostituisci service-account.json con le credenziali reali
```

### 3. Condividi il foglio con il Service Account
Nel Google Sheets: **Condividi** → aggiungi l'email del service account come **Editor**.

### 4. Avvia il server
```bash
npm run dev     # con auto-reload (nodemon)
# oppure
npm start       # produzione
```

Il frontend sarà disponibile su **http://localhost:3000**
(IS_LOCAL viene rilevato automaticamente — nessuna configurazione extra).

---

## API Reference

### GET `/api/builds` (locale) / `?action=listBuilds` (GAS)
Parametri: `mode`, `sort`, `search`, `page`, `limit`

### GET `/api/builds/:id` / `?action=getBuild&id=`
Dettaglio di una singola build

### GET `/api/stats` / `?action=getStats`
Statistiche aggregate

### POST `/api/builds` / `{action:"createBuild"}`
Crea una nuova build

### POST `/api/builds/:id/vote` / `{action:"vote"}`
Body: `{ type: "up"|"down", voterKey: "..." }`
