# KH Builds — Context di Progetto

## Cos'è
Web app per condividere, consultare e votare build del gioco **Knighthood**.
SPA vanilla JS su `index.html`, backend Express + Turso (SQLite), deploy su Fly.io.

---

## Struttura File

```
testKH_builds/
├── index.html                  ← Frontend completo (HTML + CSS + JS in un file)
├── local-backend/
│   ├── server.js               ← Backend Express
│   ├── db.js                   ← Layer dati Turso / SQLite locale
│   ├── package.json            ← deps: express, cors, dotenv, @libsql/client
│   ├── .env                    ← TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, PORT
│   └── .env.example            ← Template
├── Dockerfile                  ← Build image node:20-alpine
├── .dockerignore
├── fly.toml                    ← Config deploy Fly.io (region: ams, 256MB)
├── .gitignore
├── README.md
└── context.md                  ← Questo file
```

---

## Architettura

```
Browser (index.html)
    │
    ├─── IS_LOCAL (localhost) ───► Express (localhost:3000)
    │                                   │
    ├─── IS_GAS (HtmlService) ──► google.script.run (legacy)
    │                                   │
    └─── produzione (Fly.io) ───► Express (/api)
                                        │
                                   @libsql/client
                                        │
                              ┌─────────┴──────────┐
                              │ TURSO_DATABASE_URL  │  ← produzione
                              │ file:./kh_builds.db │  ← dev locale
                              └─────────────────────┘
```

### Rilevamento ambiente (`index.html`)
```js
const IS_LOCAL = ['localhost','127.0.0.1'].includes(location.hostname);
const IS_GAS   = typeof google !== 'undefined' && typeof google.script !== 'undefined';
const API_BASE = IS_GAS ? null : (IS_LOCAL ? 'http://localhost:3000/api' : '/api');
```
In produzione (Fly.io) il frontend è servito dallo stesso Express → `API_BASE = '/api'` (path relativo, nessun URL hardcoded).

---

## Configurazione

### `local-backend/.env`
| Variabile | Dev locale | Produzione |
|-----------|-----------|------------|
| `TURSO_DATABASE_URL` | *(vuoto → SQLite `file:./kh_builds.db`)* | `file:///app/data/kh_builds.db` |
| `TURSO_AUTH_TOKEN` | *(vuoto)* | *(non usato con file:)* |
| `PORT` | `3000` | `3000` |

Se `TURSO_DATABASE_URL` è vuoto, `db.js` usa `file:./kh_builds.db` (SQLite locale).

### Fly.io — secrets + volume
```bash
# Secret già impostato al deploy:
fly secrets set TURSO_DATABASE_URL="file:///app/data/kh_builds.db"

# Volume montato su /app/data (1GB, region: ams):
# ID: vol_r1jpdn67536km7wr
```

---

## Database — Turso / SQLite

Due tabelle, create automaticamente all'avvio da `db.initSchema()`.

### Tabella `builds`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID (`crypto.randomUUID()`) |
| timestamp | TEXT | ISO 8601 |
| title | TEXT | max 100 — **required** |
| mode | TEXT | `arena` / `pve` / `war` / `rift` — **required** |
| weapon | TEXT | max 100 — **required** |
| helmet | TEXT | Elmo |
| spalle | TEXT | Spalle |
| chest | TEXT | Busto |
| braccia | TEXT | Braccia |
| gloves | TEXT | Guanti |
| boots | TEXT | Gambe |
| hero1 | TEXT | Eroe slot 1 |
| hero2 | TEXT | Eroe slot 2 |
| servant1 | TEXT | Servitore slot 1 |
| servant2 | TEXT | Servitore slot 2 |
| charms | TEXT | max 200, separati da virgola |
| description | TEXT | max 1000 |
| author | TEXT | default `'Anonimo'` |
| upvotes | INTEGER | default 0 |
| downvotes | INTEGER | default 0 |
| status | TEXT | `active` (visibile) / `hidden` (filtrato) |

Index: `idx_builds_mode`, `idx_builds_status`

### Tabella `weapons`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | Nome arma (es. "Spaccamiti") — **required** |
| rarity | TEXT | `comune` / `raro` / `epico` / `leggendario` / `unico` / **`mitico`** |
| weapon_type | TEXT | Tipo (es. `Martello`, `Spada`, `Ascia`) |
| danni | REAL | Stat Danni (unica stat numerica) |
| forte_contro_1 | TEXT | Tipo nemico slot 1 — solo armi mitiche, modificabile in-game |
| forte_contro_2 | TEXT | Tipo nemico slot 2 — solo armi mitiche |
| talisman_slots | INTEGER | Numero slot talismani (max 5) — contenuto talismani TBD |
| status | TEXT | `pending` / `verified` / `flagged` |
| submitted_by | TEXT | Identificativo chi ha inviato |
| confirmations | INTEGER | N° conferme community |
| timestamp | TEXT | ISO 8601 |

**Tipi arma**: `Spada`, `Ascia`, `Martello`

**Nota**: rarità `mitico` è esclusiva di armi e armature (non eroi/servitori/guanti).

### Tabella `armor_pieces`

Unica tabella per tutti e 5 i pezzi di armatura.

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | Nome pezzo (es. "Spallacci Guardamiti") — **required** |
| slot | TEXT | `elmo` / `spalle` / `busto` / `braccia` / `gambe` — **required** |
| rarity | TEXT | `comune` / `raro` / `epico` / `leggendario` / `unico` / `mitico` |
| armatura | REAL | Stat Armatura (unica stat numerica) |
| forte_contro | TEXT | Solo mitico: tipo nemico (1 slot, modificabile in-game) |
| armor_set | TEXT | Non-mitico: `pesante` / `magico` / `leggero` / `a distanza` |
| talisman_slots | INTEGER | Max 5 — contenuto talismani TBD |
| status | TEXT | `pending` / `verified` / `flagged` |
| submitted_by | TEXT | Identificativo chi ha inviato |
| confirmations | INTEGER | N° conferme community |
| timestamp | TEXT | ISO 8601 |

**Set bonus armatura** (logica simulatore, non nel DB):
- 2 pezzi stesso set → -5% danno del tipo
- 3 pezzi → -10% | 4 pezzi → -15% | 5 pezzi → -25%

### Tabella `gloves`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | Nome guanto (es. "Guanto del Caotico") — **required** |
| rarity | TEXT | `comune` / `raro` / `epico` / `leggendario` / `unico` |
| danni | REAL | Stat Danni (unica stat numerica del guanto) |
| description | TEXT | Testo descrittivo dell'effetto (es. "Aumenta il potere degli Eroi caotici...") |
| nodes_json | TEXT | JSON array nodi upgrade: `[{"nome":"POTENZA","desc":"...","costo":4}, ...]` |
| nodi_totali | INTEGER | Numero totale nodi nell'albero (es. 84, 16) |
| status | TEXT | `pending` / `verified` / `flagged` |
| submitted_by | TEXT | Identificativo chi ha inviato |
| confirmations | INTEGER | N° conferme community |
| timestamp | TEXT | ISO 8601 |

**Guanti noti** (da screenshot): del Cavaliere, del Campione, del Ribelle, del Santo, del Logico, dell'Oscuro, del Caotico, del Folle, del Valoroso, dell'Anticonformista (locked), dell'Onesto (locked)

### Tabella `heroes`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | Nome eroe — **required** |
| rarity | TEXT | `comune` / `raro` / `epico` / `leggendario` / `unico` |
| class1 | TEXT | Prima classe (es. Campione) |
| class2 | TEXT | Seconda classe (es. Alchimista) |
| strong_vs | TEXT | Tipo nemico contro cui è forte |
| danni | REAL | Stat Danni al livello max |
| armatura | REAL | Stat Armatura |
| pv | REAL | Stat PV |
| potere1/2/3 | TEXT | Descrizione poteri |
| status | TEXT | `pending` / `verified` / `flagged` |
| submitted_by | TEXT | Identificativo chi ha inviato |
| confirmations | INTEGER | N° conferme community |
| timestamp | TEXT | ISO 8601 |

### Tabella `servants`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | Nome servitore — **required** |
| rarity | TEXT | `comune` / `raro` / `epico` / `leggendario` / `unico` |
| type | TEXT | Tipo principale (es. Bestia, Umano) |
| tags | TEXT | Comma-separated (es. `Magico,Bestia,Servitore`) |
| danni | REAL | Stat Danni |
| armatura | REAL | Stat Armatura |
| pv | REAL | Stat PV |
| potere_nome | TEXT | Nome del potere (es. "Pioggia di Spine") — vuoto se assente |
| potere_desc | TEXT | Descrizione effetto potere (es. "Infligge X danni, +35% danno subito per 3 turni") |
| vulnerabilities | TEXT | Comma-separated (es. `Ustione,Debolezza`) |
| resistances | TEXT | Comma-separated (es. `Acido,Congelamento`) |
| capture_glove | TEXT | Nome del guanto necessario per catturarlo (es. "Guanto del ribelle") |
| status | TEXT | `pending` / `verified` / `flagged` |
| submitted_by | TEXT | Identificativo chi ha inviato |
| confirmations | INTEGER | N° conferme community |
| timestamp | TEXT | ISO 8601 |

### Tabella `votes`

| Colonna | Tipo | Note |
|---------|------|------|
| build_id | TEXT | FK → builds.id |
| voter_key | TEXT | token localStorage (`kh_voter_key`) |
| vote_type | TEXT | `up` / `down` |
| timestamp | TEXT | ISO 8601 |

PK composta `(build_id, voter_key)` → garantisce dedup server-side a livello DB.

---

## API

## Sistema Community Contribution

### Flusso item
1. Utente invia item via `POST /api/:type` → status `pending`
2. Altri utenti: `POST /api/items/:type/:id/confirm` con `{ voterKey, action: "confirm"|"flag" }`
3. **3 conferme** → status `verified` (visibile in lista)
4. **3 flag** → status `flagged` (nascosto)
5. Admin override: `PATCH /api/admin/items/:type/:id/status` con header `X-Admin-Token`

### Tabella `item_confirmations`
PK composta `(item_id, item_type, voter_key)` — un parere per voter per item.

| Colonna | Tipo |
|---------|------|
| item_id | TEXT |
| item_type | TEXT | `weapon`/`armor`/`hero`/`servant`/`glove` |
| voter_key | TEXT |
| action | TEXT | `confirm` / `flag` |
| timestamp | TEXT |

### Configurazione admin
- `ADMIN_TOKEN` in env → header `X-Admin-Token` per endpoint `/api/admin/*`
- In produzione: `fly secrets set ADMIN_TOKEN="token_segreto"`

---

### Contratto risposta
```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": "messaggio" }
```

### Endpoint Express

| Metodo | Path | Funzione |
|--------|------|----------|
| GET | `/api/builds` | `listBuilds` |
| GET | `/api/builds/:id` | `getBuild` |
| POST | `/api/builds` | `createBuild` |
| POST | `/api/builds/:id/vote` | `voteBuild` |
| GET | `/api/stats` | `getStats` |
| GET | `/api/heroes` | `listHeroes` — query: rarity, status, search |
| GET | `/api/heroes/:id` | `getHero` |
| POST | `/api/heroes` | `createHero` — invia in `pending` |
| GET | `/api/servants` | `listServants` — query: rarity, type, status, search |
| GET | `/api/servants/:id` | `getServant` |
| POST | `/api/servants` | `createServant` — invia in `pending` |
| GET | `/api/weapons` | `listWeapons` — query: rarity, weapon_type, status, search |
| GET | `/api/weapons/:id` | `getWeapon` |
| POST | `/api/weapons` | `createWeapon` — invia in `pending` |
| GET | `/api/armor` | `listArmorPieces` — query: slot, rarity, armor_set, status, search |
| GET | `/api/armor/:id` | `getArmorPiece` |
| POST | `/api/armor` | `createArmorPiece` — invia in `pending` |
| GET | `/api/gloves` | `listGloves` — query: rarity, status, search |
| GET | `/api/gloves/:id` | `getGlove` |
| POST | `/api/gloves` | `createGlove` — invia in `pending` |
| GET | `/health` | health check |

### Parametri `GET /api/builds`
- `mode`: `all` / `arena` / `pve` / `war` / `rift`
- `sort`: `votes` (score netto) / `newest` / `oldest` / `upvotes`
- `search`: LIKE su title, weapon, hero1, hero2, hero3, description
- `page`: 1-based
- `limit`: default 12, max 50

### Risposta `listBuilds`
```json
{ "builds": [...], "total": 42, "page": 1, "limit": 12, "pages": 4 }
```

### Risposta `POST /api/builds/:id/vote`
```json
{ "message": "Voto registrato!", "upvotes": 5, "downvotes": 1 }
// oppure, se già votato:
{ "alreadyVoted": true, "voteType": "up", "message": "Hai già votato questa build" }
```

---

## Frontend (`index.html`)

### Librerie esterne (CDN, `defer`)
- **GSAP 3.12.5** — animazioni entry cards, modal open/close, vote pop, counter
- **particles.js 2.0.0** — ember particles di sfondo (oro/arancio, direzione top)
- **Google Fonts** — Cinzel (titoli/badge), Rajdhani (testo UI)

### Design System (CSS custom properties `:root`)
- Palette: `--bg` `--card` `--border` (dark navy/viola)
- Colori modalità: `--arena` (rosso), `--pve` (verde), `--war` (arancio), `--rift` (viola)
- `--gold` / `--gold-h` / `--gold-d` / `--gold-bg` / `--gold-glow`

### Oggetto `state`
```js
const state = {
  filters: { mode: 'all', sort: 'votes', search: '', page: 1 },
  total: 0, pages: 1, builds: [],
  loading: false, searchTimer: null
};
```

### Oggetto `Anim`
Wrapper GSAP con fallback silenzioso se non caricato.
Metodi: `header()`, `cards(grid)`, `modalOpen(overlay)`, `modalClose(overlay, cb)`, `vote(btn)`, `scorePop(el)`, `counter(el, target)`, `stateBox()`

### Sistema di Voto (client-side)
- `kh_voter_key` in localStorage — generato una volta, formato `kh_<random>_<timestamp36>`
- `kh_votes` in localStorage — `{ buildId: 'up'|'down' }` — dedup UI
- Server-side dedup: PRIMARY KEY `(build_id, voter_key)` sulla tabella votes

### Flusso init
1. `DOMContentLoaded` → `initParticles()` + `Anim.header()`
2. Se `!IS_CONFIGURED` → mostra stato "Configurazione richiesta"
3. Altrimenti → `loadBuilds()` + `loadStats()` in parallelo
4. Filtri/sort/search/pagina → `loadBuilds()` (debounce 380ms su search)

### Modali
- `#create-overlay` — form nuova build
- `#detail-overlay` — dettaglio build (carica dati fresh all'apertura)
- Chiusura: click su overlay, Escape, pulsante ✕

---

## Backend (`local-backend/server.js` + `db.js`)

### server.js
Express 4 puro — routes, middleware CORS, static serving.
Serve `index.html` da `path.resolve(__dirname, '..')` (root progetto).
All'avvio chiama `db.initSchema()` — crea le tabelle se non esistono.

### db.js
Layer dati con `@libsql/client`.
- Dev: `file:./kh_builds.db` (SQLite locale, no auth)
- Prod: URL Turso + auth token da env
- `voteBuild` usa `db.batch([UPDATE, INSERT], 'write')` — atomico
- `getStats` usa `Promise.all` per le 3 query in parallelo

---

## Deploy

### Dev locale
```bash
cd local-backend
npm install
# .env: lascia TURSO_* vuoti → SQLite locale automatico
npm run dev   # http://localhost:3000
```

### Produzione (Fly.io — già deployato)
- **URL**: https://kh-builds.fly.dev
- **App Fly.io**: `kh-builds` — region `ams`
- **DB**: SQLite su volume Fly.io `kh_data` → `/app/data/kh_builds.db`
- **Deploy successivo**: push su `main` → GitHub Actions → `fly deploy --remote-only`

```bash
# Re-deploy manuale se necessario:
fly deploy --remote-only --app kh-builds
```

---

## Note Tecniche / Limitazioni

- **status `hidden`**: filtrato in ogni query SQL (`WHERE status != 'hidden'`). Moderazione manuale via Turso CLI o Turso UI.
- **Nessuna autenticazione**: chiunque può creare build. Autore = campo testuale libero.
- **voteBuild atomicità**: `batch(['write'])` invia UPDATE + INSERT in una transazione — safe su Turso.
- **GAS legacy**: il codice frontend mantiene il ramo `IS_GAS` per retrocompatibilità con eventuali embed HtmlService. Non usato nel flusso normale.
- **Cold start Fly.io**: `auto_stop_machines = 'stop'` — la macchina si ferma dopo inattività, riavvio ~3-5s al primo accesso. Turso rimane sempre online.
