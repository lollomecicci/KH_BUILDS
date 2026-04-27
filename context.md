# KH Builds — Context di Progetto

## Cos'è
Web app per condividere, consultare e votare build del gioco **Knighthood**.
SPA vanilla JS su `index.html`, backend Express + SQLite, deploy su Fly.io.
Community-driven: gli utenti registrati possono contribuire al database di armi, armature, eroi, servitori e guanti.

---

## Struttura File

```
testKH_builds/
├── index.html                  ← Frontend completo (HTML + CSS + JS in un file)
├── local-backend/
│   ├── server.js               ← Backend Express + OAuth + JWT + middleware ruoli
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
| `GEMINI_API_KEY` | *(opzionale)* | Gemini free tier — aistudio.google.com/apikey |

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

## Sistema Utenti e Ruoli

### Ruoli
| Ruolo | Permessi |
|-------|----------|
| `user` | Legge build e DB, vota build, salva build |
| `mod` | Come user + conferma/segnala item nel DB |
| `admin` | Tutto: cambia ruoli, forza status item, accede pannello admin |

### Flag `contributor` (separato dal ruolo)
- Qualsiasi utente può attivarlo dal profilo (o all'onboarding)
- Permette di **aggiungere item al DB** e **confermare/segnalare** item altrui
- `mod` e `admin` hanno i permessi contributor implicitamente

### Bootstrap admin
**Il primo utente che si registra** (qualsiasi provider OAuth) viene automaticamente promosso ad `admin` + `contributor = 1`. Logica in `upsertUser()`: controlla `COUNT(*) WHERE role='admin'` prima di inserire.

### Onboarding (primo accesso)
1. OAuth callback rileva `is_new = true` → redirect con `?new_user=1`
2. Frontend apre `#onboarding-overlay` automaticamente
3. Utente sceglie gamertag + spunta "Voglio contribuire al database"
4. `POST /api/me/gamertag` + `PATCH /api/me/contributor` → nuovo JWT

### JWT payload
```json
{
  "userId": "uuid",
  "gamertag": "NomeUtente",
  "avatar": "url",
  "role": "user|mod|admin",
  "contributor": 0|1
}
```
Scadenza 30 giorni, salvato in localStorage. Nuovo token emesso su cambio gamertag/contributor/role.

---

## Database — Schema completo

Tutte le tabelle create automaticamente da `db.initSchema()` all'avvio.
Migrazioni safe via `ALTER TABLE ADD COLUMN` in try/catch.

### Tabella `users`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| gamertag | TEXT | Nome visualizzato, modificabile |
| provider | TEXT | `discord` / `google` |
| provider_id | TEXT | ID univoco del provider |
| avatar_url | TEXT | URL avatar dal provider |
| role | TEXT | `user` / `mod` / `admin` — default `user` |
| contributor | INTEGER | 0 / 1 — default 0 |
| created_at | TEXT | ISO 8601 |

UNIQUE `(provider, provider_id)`.

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

### Tabella `weapons`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | **required** |
| rarity | TEXT | `comune` / `raro` / `epico` / `leggendario` / `unico` / **`mitico`** |
| weapon_type | TEXT | `spada` / `ascia` / `martello` |
| danni | REAL | unica stat numerica |
| forte_contro_1 | TEXT | solo mitico, slot 1 |
| forte_contro_2 | TEXT | solo mitico, slot 2 |
| talisman_slots | INTEGER | max 5 |
| status | TEXT | `pending` / `verified` / `flagged` |
| submitted_by | TEXT | gamertag contributor |
| confirmations | INTEGER | conferme community |
| flags | INTEGER | segnalazioni community |
| timestamp | TEXT | |

### Tabella `armor_pieces`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | **required** |
| slot | TEXT | `elmo` / `spalle` / `busto` / `braccia` / `guanti` / `gambe` |
| rarity | TEXT | comune → **mitico** |
| armatura | REAL | |
| forte_contro | TEXT | solo mitico: 1 slot |
| armor_set | TEXT | non-mitico: `pesante` / `magico` / `leggero` / `a distanza` |
| talisman_slots | INTEGER | max 5 |
| status / submitted_by / confirmations / flags / timestamp | | standard |

**Set bonus** (logica simulatore futura): 2 pz → -5% | 3 → -10% | 4 → -15% | 5 → -25%

### Tabella `gloves`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | es. "Guanto del Caotico" |
| rarity | TEXT | comune → unico (NO mitico) |
| danni | REAL | |
| description | TEXT | effetto guanto |
| nodes_json | TEXT | `[{nome, desc, costo}, ...]` — albero upgrade variabile |
| nodi_totali | INTEGER | es. 84, 16 |
| status / submitted_by / confirmations / flags / timestamp | | standard |

### Tabella `heroes`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | **required** |
| rarity | TEXT | comune → unico |
| class1 / class2 | TEXT | es. Campione, Alchimista |
| strong_vs | TEXT | tipo nemico contro cui è forte |
| danni / armatura / pv | REAL | stats al livello max |
| potere1 / potere2 / potere3 | TEXT | descrizione poteri |
| status / submitted_by / confirmations / flags / timestamp | | standard |

### Tabella `servants`

| Colonna | Tipo | Note |
|---------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | **required** |
| rarity | TEXT | comune → unico |
| type | TEXT | es. Bestia, Umano |
| tags | TEXT | comma-separated: `Magico,Bestia,Servitore` |
| danni / armatura / pv | REAL | stats |
| potere_nome | TEXT | nome del potere |
| potere_desc | TEXT | descrizione effetto |
| vulnerabilities | TEXT | es. `Ustione,Debolezza` |
| resistances | TEXT | es. `Acido,Congelamento` |
| capture_glove | TEXT | es. "Guanto del ribelle" |
| status / submitted_by / confirmations / flags / timestamp | | standard |

### Tabella `votes`
PK `(build_id, voter_key)`.

### Tabella `item_confirmations`
PK `(item_id, item_type, voter_key)` — `voter_key` = `userId` JWT per utenti autenticati.

---

## Sistema Auth

### Flusso login
1. Utente clicca "Accedi" → `/auth/discord` o `/auth/google`
2. Redirect al provider OAuth
3. Callback: backend scambia code → profilo utente → `upsertUser()`
4. Se `is_new`: redirect `/?auth_token=jwt&new_user=1` → onboarding modal
5. JWT salvato in localStorage, rimosso dall'URL

### Middleware server
```js
requireAuth(req,res,next)         // Bearer JWT valido
requireContributor(req,res,next)  // contributor=1 OR role mod/admin
requireAdmin(req,res,next)        // role='admin' OR X-Admin-Token header
```

### Frontend Auth object
```js
Auth.init()          // legge JWT da URL/localStorage, apre onboarding se new_user
Auth.user            // { userId, gamertag, avatar, role, contributor } | null
Auth.isLoggedIn()    // boolean
Auth.authHeader()    // { 'Authorization': 'Bearer ...' } | {}
Auth.logout()
canContribute()      // Auth.user?.contributor || role mod/admin
```

---

## Sistema Community Contribution

### Flusso item
1. Contributor invia item via `POST /api/:type` (requireAuth + requireContributor) → status `pending`
2. Altri contributor confermano: `POST /api/items/:type/:id/confirm` `{ action: "confirm"|"flag" }`
   - voterKey = `userId` dal JWT (un voto per account)
   - Contatori `confirmations` / `flags` aggiornati sulla riga item (denormalizzati)
3. **3 conferme** → `verified` | **3 flag** → `flagged`
4. Admin override: `PATCH /api/admin/items/:type/:id/status`

---

## API — Endpoint Express

### Contratto risposta
```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": "messaggio" }
```

| Metodo | Path | Auth | Note |
|--------|------|------|------|
| GET | `/auth/discord` | — | Redirect OAuth |
| GET | `/auth/discord/callback` | — | |
| GET | `/auth/google` | — | Redirect OAuth |
| GET | `/auth/google/callback` | — | |
| GET | `/api/me` | Bearer | Dati freschi da DB |
| PATCH | `/api/me/gamertag` | Bearer | Ritorna nuovo token |
| PATCH | `/api/me/contributor` | Bearer | Ritorna nuovo token |
| GET | `/api/builds` | — | mode, sort, search, page, limit |
| GET | `/api/builds/:id` | — | |
| POST | `/api/builds` | — | |
| POST | `/api/builds/:id/vote` | — | `{ type, voterKey }` |
| GET | `/api/stats` | — | |
| GET | `/api/weapons` | — | rarity, weapon_type, status, search |
| POST | `/api/weapons` | Contributor | → pending |
| GET | `/api/armor` | — | slot, rarity, armor_set, status, search |
| POST | `/api/armor` | Contributor | → pending |
| GET | `/api/heroes` | — | rarity, status, search |
| POST | `/api/heroes` | Contributor | → pending |
| GET | `/api/servants` | — | rarity, type, status, search |
| POST | `/api/servants` | Contributor | → pending |
| GET | `/api/gloves` | — | rarity, status, search |
| POST | `/api/gloves` | Contributor | → pending |
| POST | `/api/items/:type/:id/confirm` | Contributor | `{ action }` |
| PATCH | `/api/admin/items/:type/:id/status` | Admin | |
| GET | `/api/admin/users` | Admin | search, page |
| PATCH | `/api/admin/users/:id/role` | Admin | `{ role }` |
| POST | `/api/ai/parse-item` | Contributor | `{ image: base64, mimeType }` → campi item |
| GET | `/health` | — | |

---

## Frontend (`index.html`) — Sezioni

### Sezione ⚔ Build (default)
- Stats bar, filter bar (mode tabs + sort + search), builds grid, paginazione
- FAB "＋ Nuova Build"
- Modal: `#create-overlay` (form build), `#detail-overlay` (dettaglio + voto)

### Sezione 📚 Database
- Type tabs: Armi / Armature / Eroi / Servitori / Guanti
- Filtro status (Verificati / In attesa / Tutti) + ricerca
- Item grid con rarity badge, status badge, confirm/flag buttons
- FAB "＋ Contribuisci" (visibile solo a contributor/mod/admin)
- Modal: `#submit-item-overlay` — form dinamico per tipo + **zona screenshot AI**
  - Drag&drop / file picker → preview thumbnail
  - "✨ Analizza con AI" → chiama `/api/ai/parse-item` → pre-compila tutti i campi
  - Auto-switch al tab tipo corretto (weapons/armor/ecc.)
  - Campi mitico condizionali (forte_contro visibile solo se rarity=mitico)

### Sezione 👑 Admin (solo admin)
- Tabella utenti: avatar, gamertag, provider, ruolo (dropdown), contributor flag, data
- Ricerca utenti
- Dropdown ruolo per riga (non modificabile su se stessi)

### Modali globali
| ID | Contenuto |
|----|-----------|
| `#onboarding-overlay` | Primo accesso: gamertag + checkbox contributor |
| `#login-overlay` | Scelta provider OAuth (Discord / Google) |
| `#profile-overlay` | Profilo: gamertag edit, toggle contributor, badge ruolo, logout |
| `#create-overlay` | Form nuova build |
| `#detail-overlay` | Dettaglio build + voto |
| `#submit-item-overlay` | Form submit item DB (tipo dinamico) |

---

## Backend (`server.js` + `db.js`)

### Dipendenze (`package.json`)
```json
"@libsql/client": "^0.14",
"cors": "^2.8",
"dotenv": "^16",
"express": "^4.21",
"jsonwebtoken": "^9.0"
// Gemini: chiamata diretta via fetch(), nessun SDK aggiuntivo
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
upsertUser / getUserById / updateGamertag / setContributor / updateUserRole / listUsers
```

### ITEM_TABLES mapping
Accetta sia chiavi plurali (da URL route) che singolari (legacy):
`weapons/weapon → weapons`, `armor/armor_pieces → armor_pieces`, ecc.

---

## Deploy

### Dev locale
```bash
cd local-backend
npm install
# .env: copia .env.example, compila OAuth + lascia TURSO_* vuoti
npm run dev   # http://localhost:3000
```

### Produzione (Fly.io)
- **URL**: https://kh-builds.fly.dev
- **App**: `kh-builds` — region `ams`, 256MB
- **DB**: SQLite su volume `kh_data` → `/app/data/kh_builds.db`
- **CI/CD**: push su `main` → GitHub Actions → `fly deploy --remote-only`
- **Repo GitHub**: https://github.com/lollomecicci/KH_BUILDS

---

## Note Tecniche

- **Migrazioni DB**: `initSchema()` esegue `ALTER TABLE ADD COLUMN` silenzioso — safe su DB esistente
- **JWT**: payload include `role` + `contributor`, scadenza 30d, nuovo token emesso su ogni modifica profilo
- **voter_key confirm**: usa `userId` JWT (non localStorage) → un parere per account, non aggirabile
- **Bootstrap admin**: primo `upsertUser` con DB senza admin → `role='admin'`, `contributor=1`
- **voteBuild atomicità**: `db.batch(['write'])` → UPDATE + INSERT in transazione
- **Cold start Fly.io**: `auto_stop_machines = 'stop'` — riavvio ~3-5s
- **GAS legacy**: branch `IS_GAS` mantenuto nel frontend, non attivo
- **Rarità mitico**: solo armi e armature (non eroi/servitori/guanti)
- **Set bonus armatura**: logica nel simulatore (TBD), non nel DB

---

## TODO / Prossimi step

- [ ] Setup OAuth: configurare app Discord + Google, impostare secrets su Fly.io
- [ ] Simulatore stat (combina equipaggiamento + set bonus + eroi)
- [ ] Suggeritore build per modalità
- [ ] Talismani (schema TBD)
- [ ] Mod: permessi aggiuntivi (es. edit item altrui)
