# KH Builds — Context di Progetto

## Cos'è
Web app per condividere, consultare e votare build del gioco **Knighthood**.
SPA vanilla JS su `index.html`, backend Express + SQLite, deploy su Fly.io.
Community-driven: gli utenti possono contribuire al database di armi, armature, eroi, servitori e guanti.

---

## Struttura File

```
testKH_builds/
├── index.html                  ← Frontend completo (HTML + CSS + JS in un file)
├── local-backend/
│   ├── server.js               ← Backend Express + OAuth + JWT
│   ├── db.js                   ← Layer dati @libsql/client (SQLite)
│   ├── package.json            ← deps: express, cors, dotenv, @libsql/client, jsonwebtoken
│   ├── .env                    ← variabili locali (non in git)
│   └── .env.example            ← Template con tutte le variabili
├── Dockerfile                  ← Build image node:20-alpine
├── .dockerignore
├── fly.toml                    ← Config deploy Fly.io (region: ams, 256MB)
├── .github/workflows/deploy.yml ← CI/CD: push main → fly deploy
├── .gitignore
└── context.md                  ← Questo file
```

---

## Architettura

```
Browser (index.html)
    │
    ├─── IS_LOCAL (localhost) ───► Express (localhost:3000)
    │
    └─── produzione (Fly.io) ───► Express (/api)
                                        │
                                   @libsql/client
                                        │
                              file:///app/data/kh_builds.db
                              (SQLite su volume Fly.io persistente)
```

### Rilevamento ambiente
```js
const IS_LOCAL = ['localhost','127.0.0.1'].includes(location.hostname);
const IS_GAS   = typeof google !== 'undefined' && typeof google.script !== 'undefined';
const API_BASE = IS_GAS ? null : (IS_LOCAL ? 'http://localhost:3000/api' : '/api');
```
In produzione il frontend è servito dallo stesso Express → `API_BASE = '/api'` (path relativo).

---

## Configurazione

### `local-backend/.env` — variabili richieste

| Variabile | Dev locale | Produzione (Fly.io) |
|-----------|-----------|---------------------|
| `TURSO_DATABASE_URL` | *(vuoto → SQLite locale)* | `file:///app/data/kh_builds.db` |
| `TURSO_AUTH_TOKEN` | *(vuoto)* | *(non usato con file:)* |
| `PORT` | `3000` | `3000` |
| `ADMIN_TOKEN` | qualsiasi stringa | `openssl rand -hex 32` |
| `JWT_SECRET` | qualsiasi stringa | `openssl rand -hex 32` |
| `APP_URL` | `http://localhost:3000` | `https://kh-builds.fly.dev` |
| `DISCORD_CLIENT_ID` | ID app Discord | uguale |
| `DISCORD_CLIENT_SECRET` | Secret app Discord | uguale |
| `GOOGLE_CLIENT_ID` | ID app Google | uguale |
| `GOOGLE_CLIENT_SECRET` | Secret app Google | uguale |

### Fly.io — secrets attivi
```bash
fly secrets set \
  TURSO_DATABASE_URL="file:///app/data/kh_builds.db" \
  ADMIN_TOKEN="..." \
  JWT_SECRET="..." \
  APP_URL="https://kh-builds.fly.dev" \
  DISCORD_CLIENT_ID="..." DISCORD_CLIENT_SECRET="..." \
  GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." \
  --app kh-builds

# Volume SQLite:
# ID: vol_r1jpdn67536km7wr — montato su /app/data
```

### Setup OAuth (da fare una volta)
- **Discord**: https://discord.com/developers/applications → Redirect URI: `https://kh-builds.fly.dev/auth/discord/callback`
- **Google**: https://console.cloud.google.com/ → Credentials → OAuth 2.0 → Redirect URI: `https://kh-builds.fly.dev/auth/google/callback`

---

## Database — Schema completo

Tutte le tabelle create automaticamente da `db.initSchema()` all'avvio.
Le tabelle item hanno migrazioni automatiche via `ALTER TABLE ADD COLUMN IF NOT EXISTS`.

### Tabella `users`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| gamertag | TEXT | Nome visualizzato, modificabile |
| provider | TEXT | `discord` / `google` |
| provider_id | TEXT | ID univoco del provider |
| avatar_url | TEXT | URL avatar dal provider |
| created_at | TEXT | ISO 8601 |

UNIQUE `(provider, provider_id)` — upsert al login.

### Tabella `builds`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| timestamp | TEXT | ISO 8601 |
| title | TEXT | max 100 — **required** |
| mode | TEXT | `arena` / `pve` / `war` / `rift` — **required** |
| weapon | TEXT | max 100 — **required** |
| helmet | TEXT | Elmo |
| spalle | TEXT | Spalle |
| chest | TEXT | Busto |
| braccia | TEXT | Braccia |
| gloves | TEXT | Guanti (nome guanto da battaglia) |
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
| status | TEXT | `active` / `hidden` |

Index: `idx_builds_mode`, `idx_builds_status`

### Tabella `weapons`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | **required** |
| rarity | TEXT | `comune` / `raro` / `epico` / `leggendario` / `unico` / **`mitico`** |
| weapon_type | TEXT | `Martello` / `Spada` / `Ascia` |
| danni | REAL | unica stat numerica |
| forte_contro_1 | TEXT | solo mitico, slot 1 — tipo nemico, modificabile in-game |
| forte_contro_2 | TEXT | solo mitico, slot 2 |
| talisman_slots | INTEGER | max 5 — contenuto TBD |
| status / submitted_by / confirmations / timestamp | | standard community |

### Tabella `armor_pieces`

Unica tabella per tutti e 5 i pezzi (elmo, spalle, busto, braccia, gambe).

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | **required** |
| slot | TEXT | `elmo` / `spalle` / `busto` / `braccia` / `gambe` |
| rarity | TEXT | comune → **mitico** |
| armatura | REAL | unica stat numerica |
| forte_contro | TEXT | solo mitico: 1 slot tipo nemico |
| armor_set | TEXT | non-mitico: `pesante` / `magico` / `leggero` / `a distanza` |
| talisman_slots | INTEGER | max 5 — contenuto TBD |
| status / submitted_by / confirmations / timestamp | | standard community |

**Set bonus** (logica simulatore, non nel DB):
- 2 pz stesso set → -5% danno | 3→-10% | 4→-15% | 5→-25%

### Tabella `gloves`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | es. "Guanto del Caotico" |
| rarity | TEXT | comune → unico (NO mitico) |
| danni | REAL | unica stat |
| description | TEXT | effetto guanto |
| nodes_json | TEXT | `[{nome, desc, costo}, ...]` — albero upgrade variabile per guanto |
| nodi_totali | INTEGER | es. 84, 16 |
| status / submitted_by / confirmations / timestamp | | standard community |

**Guanti noti**: del Cavaliere, del Campione, del Ribelle, del Santo, del Logico, dell'Oscuro, del Caotico, del Folle, del Valoroso, dell'Anticonformista (locked), dell'Onesto (locked)

### Tabella `heroes`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | **required** |
| rarity | TEXT | comune → unico |
| class1 / class2 | TEXT | es. Campione, Alchimista |
| strong_vs | TEXT | tipo nemico contro cui è forte (1 solo) |
| danni / armatura / pv | REAL | stats al livello max |
| potere1 / potere2 / potere3 | TEXT | descrizione poteri |
| status / submitted_by / confirmations / timestamp | | standard community |

### Tabella `servants`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | **required** |
| rarity | TEXT | comune → unico |
| type | TEXT | es. Bestia, Umano |
| tags | TEXT | comma-separated: `Magico,Bestia,Servitore` |
| danni / armatura / pv | REAL | stats (armatura spesso null) |
| potere_nome | TEXT | es. "Pioggia di Spine" (vuoto se assente) |
| potere_desc | TEXT | descrizione effetto potere |
| vulnerabilities | TEXT | es. `Ustione,Debolezza` |
| resistances | TEXT | es. `Acido,Congelamento` |
| capture_glove | TEXT | es. "Guanto del ribelle" |
| status / submitted_by / confirmations / timestamp | | standard community |

### Tabella `votes`

PK `(build_id, voter_key)` — dedup server-side.

| build_id | voter_key | vote_type (`up`/`down`) | timestamp |

### Tabella `item_confirmations`

PK `(item_id, item_type, voter_key)` — un parere per utente per item.

| item_id | item_type (`weapon`/`armor`/`hero`/`servant`/`glove`) | voter_key | action (`confirm`/`flag`) | timestamp |

---

## Sistema Auth (OAuth + JWT)

### Flusso login
1. Utente clicca "Accedi con Discord/Google" → `/auth/discord` o `/auth/google`
2. Redirect al provider OAuth
3. Callback: `GET /auth/discord/callback?code=...`
4. Backend scambia code → access token → profilo utente
5. `upsertUser()` in tabella `users`
6. Crea JWT (30 giorni), redirect a `/?auth_token=<jwt>`
7. Frontend salva JWT in localStorage, rimuove parametro dall'URL

### JWT payload
```json
{ "userId": "uuid", "gamertag": "NomeUtente", "avatar": "url" }
```

### Endpoints auth
| Metodo | Path | Note |
|--------|------|------|
| GET | `/auth/discord` | Redirect a Discord OAuth |
| GET | `/auth/discord/callback` | Callback Discord |
| GET | `/auth/google` | Redirect a Google OAuth |
| GET | `/auth/google/callback` | Callback Google |
| GET | `/api/me` | Profilo utente corrente (Bearer token) |
| PATCH | `/api/me/gamertag` | Aggiorna gamertag, ritorna nuovo token |

### Frontend — oggetto `Auth`
```js
Auth.init()          // legge token da URL/localStorage, popola Auth.user
Auth.user            // { userId, gamertag, avatar } | null
Auth.isLoggedIn()    // boolean
Auth.authHeader()    // { 'Authorization': 'Bearer ...' } | {}
Auth.logout()        // rimuove token
```
Token inviato automaticamente in `apiPost()` via `Auth.authHeader()`.

---

## Sistema Community Contribution

### Flusso item
1. Utente invia item via `POST /api/:type` → status `pending`
2. Altri utenti confermano: `POST /api/items/:type/:id/confirm` con `{ voterKey, action: "confirm"|"flag" }`
3. **3 conferme** → `verified` (visibile in lista)
4. **3 flag** → `flagged` (nascosto)
5. Admin override: `PATCH /api/admin/items/:type/:id/status` (header `X-Admin-Token`)

---

## API — Endpoint Express

### Contratto risposta
```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": "messaggio" }
```

### Tutti gli endpoint

| Metodo | Path | Note |
|--------|------|------|
| GET | `/auth/discord` | OAuth Discord |
| GET | `/auth/discord/callback` | |
| GET | `/auth/google` | OAuth Google |
| GET | `/auth/google/callback` | |
| GET | `/api/me` | Richiede Bearer token |
| PATCH | `/api/me/gamertag` | Richiede Bearer token |
| GET | `/api/builds` | mode, sort, search, page, limit |
| GET | `/api/builds/:id` | |
| POST | `/api/builds` | |
| POST | `/api/builds/:id/vote` | `{ type, voterKey }` |
| GET | `/api/stats` | |
| GET | `/api/weapons` | rarity, weapon_type, status, search |
| GET | `/api/weapons/:id` | |
| POST | `/api/weapons` | → pending |
| GET | `/api/armor` | slot, rarity, armor_set, status, search |
| GET | `/api/armor/:id` | |
| POST | `/api/armor` | → pending |
| GET | `/api/heroes` | rarity, status, search |
| GET | `/api/heroes/:id` | |
| POST | `/api/heroes` | → pending |
| GET | `/api/servants` | rarity, type, status, search |
| GET | `/api/servants/:id` | |
| POST | `/api/servants` | → pending |
| GET | `/api/gloves` | rarity, status, search |
| GET | `/api/gloves/:id` | |
| POST | `/api/gloves` | → pending |
| POST | `/api/items/:type/:id/confirm` | `{ voterKey, action }` |
| PATCH | `/api/admin/items/:type/:id/status` | Header `X-Admin-Token` |
| GET | `/health` | |

---

## Frontend (`index.html`)

### Librerie esterne (CDN, `defer`)
- **GSAP 3.12.5** — animazioni
- **particles.js 2.0.0** — ember particles sfondo
- **Google Fonts** — Cinzel + Rajdhani

### Design System
- Palette dark navy/viola, `--gold` / `--gold-h` / `--gold-d`
- Colori modalità: `--arena` (rosso), `--pve` (verde), `--war` (arancio), `--rift` (viola)

### Slot build (aggiornati)
- **Armatura**: elmo, spalle, busto (chest), braccia, guanti (gloves), gambe (boots)
- **Compagnia**: hero1, hero2, servant1, servant2
- `partyHeroes(b)` / `partyServants(b)` per display card/detail

### Modali
- `#create-overlay` — form nuova build (tutti gli slot)
- `#detail-overlay` — dettaglio build
- `#login-overlay` — scelta provider OAuth
- `#profile-overlay` — profilo utente + cambio gamertag

### Init flow
1. `Auth.init()` — legge JWT da URL o localStorage
2. `initParticles()` + `Anim.header()`
3. `loadBuilds()` + `loadStats()` in parallelo

---

## Backend (`server.js` + `db.js`)

### Dipendenze
```json
"@libsql/client": "^0.14",
"cors": "^2.8",
"dotenv": "^16",
"express": "^4.21",
"jsonwebtoken": "^9.0"
```

### db.js — funzioni esportate
```
initSchema()
listBuilds / getBuild / createBuild / voteBuild / getStats
listWeapons / getWeapon / createWeapon
listArmorPieces / getArmorPiece / createArmorPiece
listHeroes / getHero / createHero
listServants / getServant / createServant
listGloves / getGlove / createGlove
confirmItem / adminSetStatus
upsertUser / updateGamertag
```

---

## Deploy

### Dev locale
```bash
cd local-backend
npm install
# .env: copia .env.example, compila le variabili OAuth + lascia TURSO_* vuoti
npm run dev   # http://localhost:3000
```

### Produzione (Fly.io)
- **URL**: https://kh-builds.fly.dev
- **App**: `kh-builds` — region `ams`, 256MB
- **DB**: SQLite su volume `kh_data` → `/app/data/kh_builds.db`
- **CI/CD**: push su `main` → GitHub Actions → `fly deploy --remote-only`
- **Repo GitHub**: https://github.com/lollomecicci/KH_BUILDS

```bash
# Re-deploy manuale:
fly deploy --remote-only --app kh-builds

# Logs:
fly logs --app kh-builds
```

---

## Note Tecniche

- **Migrazioni DB**: `initSchema()` esegue `ALTER TABLE ADD COLUMN` silenzioso — safe su DB esistente
- **JWT**: payload firmato con `JWT_SECRET`, scadenza 30 giorni, salvato in `localStorage`
- **voter_key**: usato per dedup voti builds e conferme item — generato una volta in localStorage (`kh_voter_key`)
- **voteBuild atomicità**: `db.batch(['write'])` → UPDATE + INSERT in transazione
- **Cold start Fly.io**: `auto_stop_machines = 'stop'` — riavvio ~3-5s dopo inattività
- **GAS legacy**: `IS_GAS` branch mantenuto in frontend per retrocompatibilità, non usato
- **Rarità mitico**: esclusiva di armi e armature (non eroi/servitori/guanti)
- **Set bonus armatura**: logica nel simulatore (TBD), non nel DB

## TODO / Prossimi step
- [ ] Setup OAuth: configurare app Discord + Google, impostare secrets su Fly.io, poi `git push`
- [ ] Sezione Database nel frontend (browser item + form submit community)
- [ ] Simulatore stat (combina equipaggiamento + set bonus + eroi)
- [ ] Suggeritore build per modalità
- [ ] Talismani (schema TBD)
