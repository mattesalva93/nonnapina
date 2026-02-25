# 🎯 Keepa Tracker - Amazon Affiliate Deal Scraper

Strumento automatizzato per monitorare le offerte Amazon tramite Keepa e generare link di affiliazione con l'Amazon Creators API.

## 📋 Cosa fa questo progetto?

**Keepa Tracker** automatizza il processo di:

1. 🔍 **Scraping** delle migliori offerte da Keepa.com per categorie Amazon selezionate
2. 📊 **Estrazione** di dati completi: ASIN, prezzi, sconti, recensioni
3. 🔗 **Generazione** automatica di link di affiliazione Amazon (web, app mobile, storefront)
4. 💾 **Salvataggio** dei dati in JSON ed Excel per facile analisi e tracking
5. 📈 **Organizzazione** per categoria con storico temporale

Il tutto con **zero intervento manuale** - basta configurare le variabili d'ambiente e lanciare lo script!

---

## 🚀 Installazione Completa su Mac (da Zero)

Questa guida assume che tu stia partendo da zero, senza Homebrew o Node.js installati.

### Passo 1: Installare Xcode Command Line Tools

Gli Xcode Command Line Tools sono necessari per compilare software su Mac.

```bash
# Apri il Terminale (Applicazioni > Utility > Terminale) e digita:
xcode-select --install
```

Segui le istruzioni a schermo per completare l'installazione.

**Verifica l'installazione:**

```bash
xcode-select -p
# Output atteso: /Library/Developer/CommandLineTools
```

---

### Passo 2: Installare Homebrew (Package Manager)

Homebrew è il gestore pacchetti più usato su Mac. Facilita enormemente l'installazione di software.

```bash
# Installa Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Importante:** Dopo l'installazione, Homebrew ti mostrerà dei comandi da eseguire per aggiungere brew al PATH. **Copia ed esegui quei comandi!**

Solitamente sono simili a:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

**Verifica l'installazione:**

```bash
brew --version
# Output atteso: Homebrew 4.x.x
```

---

### Passo 3: Installare Git

Git è necessario per clonare il repository e gestire il codice.

```bash
# Installa Git tramite Homebrew
brew install git
```

**Verifica l'installazione:**

```bash
git --version
# Output atteso: git version 2.x.x
```

**Configura Git (prima volta):**

```bash
# Sostituisci con il tuo nome e email
git config --global user.name "Il Tuo Nome"
git config --global user.email "tuaemail@example.com"
```

**Verifica la configurazione:**

```bash
git config --list | grep user
# Output atteso:
# user.name=Il Tuo Nome
# user.email=tuaemail@example.com
```

---

### Passo 4: Installare Node.js (versione 22+)

Il progetto richiede Node.js versione 22 o superiore. Useremo **nvm** (Node Version Manager) per gestire Node.js.

#### 4.1 Installa nvm

```bash
# Installa nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

**Importante:** Dopo l'installazione, chiudi e riapri il Terminale, oppure esegui:

```bash
# Ricarica il profilo shell
source ~/.zshrc
```

**Verifica l'installazione:**

```bash
nvm --version
# Output atteso: 0.39.7 (o superiore)
```

#### 4.2 Installa Node.js v22

```bash
# Installa Node.js versione 22 (LTS)
nvm install 22

# Imposta la versione 22 come predefinita
nvm use 22
nvm alias default 22
```

**Verifica l'installazione:**

```bash
node --version
# Output atteso: v22.x.x

npm --version
# Output atteso: 10.x.x
```

---

### Passo 5: Clonare o Scaricare il Progetto

Se hai già il progetto sul tuo computer, salta questo passo.

#### Opzione A: Clonare da Git (se il progetto è su GitHub/GitLab)

```bash
# Clona il repository
git clone <URL_DEL_REPOSITORY>
cd keepa_tracker
```

#### Opzione B: Hai già la cartella del progetto

```bash
# Naviga nella cartella del progetto
cd /percorso/alla/cartella/keepa_tracker
```

---

### Passo 6: Installare le Dipendenze del Progetto

```bash
# Assicurati di essere nella cartella del progetto
# Installa tutte le dipendenze npm
npm install
```

Questo installerà:

- **axios** - Per chiamate HTTP all'Amazon API
- **dotenv** - Per gestire variabili d'ambiente
- **playwright** - Browser automation
- **puppeteer-real-browser** - Web scraping avanzato
- **xlsx** - Per gestire file Excel

**Verifica che l'installazione sia andata a buon fine:**

```bash
# Controlla che node_modules sia stato creato
ls -la | grep node_modules
```

---

### Passo 7: Installare i Browser per Playwright

Playwright necessita di browser headless per lo scraping.

```bash
# Installa il browser Chromium per Playwright
npm run install-browsers
```

---

### Passo 8: Configurare le Variabili d'Ambiente

#### 8.1 Crea il file `.env`

```bash
# Copia il file di esempio
cp .env.example .env
```

#### 8.2 Apri il file `.env` con un editor di testo

```bash
# Apri con TextEdit (o usa VS Code, nano, vim...)
open -e .env
```

#### 8.3 Compila le variabili d'ambiente

Vedi la sezione **"📖 Guida alla Configurazione"** più avanti per dettagli su come ottenere ogni valore.

---

## 📖 Guida alla Configurazione (.env)

### 🔑 Credenziali Amazon Creators API

Per usare questo progetto, **devi essere iscritto al programma Amazon Affiliazione** e avere accesso all'**Amazon Creators API**.

#### Come ottenere le credenziali:

1. **Iscriviti al programma Amazon Affiliazione:**
   - Vai su: [https://programma-affiliazione.amazon.it](https://programma-affiliazione.amazon.it)
   - Registrati e completa il processo di approvazione

2. **Accedi all'Amazon Creators API:**
   - Dopo l'approvazione, accedi alla dashboard Affiliazione
   - Vai alla sezione **"API"** o **"Creators API"**
   - Segui le istruzioni per richiedere l'accesso all'API (potrebbe richiedere approvazione)

3. **Ottieni le credenziali OAuth 2.0:**
   - Una volta approvato, vedrai:
     - **Client ID** (`AMAZON_ACCESS_KEY`)
     - **Client Secret** (`AMAZON_SECRET_KEY`)
     - **Partner Tag** (`AMAZON_PARTNER_TAG`) - è il tuo ID affiliato (es. `tuoid-21`)

#### Compila le variabili:

```bash
# Credenziali Amazon Creators API
AMAZON_ACCESS_KEY=amzn1.application-oa2-client.xxxxxxxxxxxxx
AMAZON_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AMAZON_PARTNER_TAG=tuoid-21
AMAZON_MARKETPLACE=IT
```

- **`AMAZON_ACCESS_KEY`**: Il tuo Client ID OAuth
- **`AMAZON_SECRET_KEY`**: Il tuo Client Secret OAuth
- **`AMAZON_PARTNER_TAG`**: Il tuo Partner Tag/Tracking ID (es. `tuoid-21`)
- **`AMAZON_MARKETPLACE`**: Il marketplace Amazon (predefinito: `IT` per Italia)
  - Altri valori: `US`, `UK`, `DE`, `FR`, `ES`

---

### 🏪 Storefront ID (Opzionale)

Se hai un **Amazon Storefront** (vetrina personalizzata per affiliati), puoi aggiungere l'ID per generare link diretti al tuo store.

#### Come trovare il tuo Storefront ID:

1. Vai sul tuo Amazon Storefront (es. `https://www.amazon.it/shop/tuonome`)
2. Cerca nella URL un parametro come `?storefront_id=XXXXXXXXXXXX`
3. Copia l'ID

```bash
# Storefront ID (opzionale)
AMAZON_STOREFRONT_ID=A123456789ABCD
```

Se lasci vuoto, i link storefront non verranno generati (gli altri link funzioneranno comunque).

---

### 🗂️ Categorie Keepa

Keepa organizza i prodotti Amazon in categorie. Puoi selezionare quali categorie monitorare.

#### **Lista Completa Categorie Amazon.it:**

| ID  | Nome Categoria                     |
| --- | ---------------------------------- |
| 1   | Alimentari e cura della casa       |
| 2   | Altro                              |
| 3   | App e Giochi                       |
| 4   | Auto e Moto                        |
| 5   | Bellezza                           |
| 6   | CD e Vinili                        |
| 7   | Cancelleria e prodotti per ufficio |
| 8   | Casa e cucina                      |
| 9   | Commercio, Industria e Scienza     |
| 10  | Elettronica                        |
| 11  | Fai da te                          |
| 12  | Film e TV                          |
| 13  | Giardino e giardinaggio            |
| 14  | Giochi e giocattoli                |
| 15  | Grandi elettrodomestici            |
| 16  | Illuminazione                      |
| 17  | Informatica                        |
| 18  | Libri                              |
| 19  | Moda                               |
| 20  | Musica Digitale                    |
| 21  | Prima infanzia                     |
| 22  | Prodotti per animali domestici     |
| 23  | Salute e cura della persona        |
| 24  | Software                           |
| 25  | Sport e tempo libero               |
| 26  | Strumenti musicali                 |
| 27  | Videogiochi                        |

#### Configurazione:

```bash
# Categorie Keepa (IDs separati da virgola)
KEEPA_CATEGORIES=5,16,3,2

# Numero massimo di prodotti per categoria
MAX_PRODUCTS_PER_CATEGORY=10

# Delay tra richieste (millisecondi) - evita rate limiting
SCRAPING_DELAY_MS=2000
```

**Esempio:**

- `KEEPA_CATEGORIES=5,16,3,2` → Bellezza, Illuminazione, App e Giochi, Altro
- `MAX_PRODUCTS_PER_CATEGORY=10` → Massimo 10 prodotti per categoria (totale: 40 prodotti)

**Suggerimenti:**

- Non esagerare con troppe categorie o troppi prodotti (rischi timeout o ban)
- Inizia con 2-3 categorie e 10 prodotti per testare
- `SCRAPING_DELAY_MS=2000` è sicuro (2 secondi tra richieste)

---

### 📂 Percorsi File di Output

Dove salvare i dati estratti:

```bash
# File JSON con dati Keepa (ASIN, prezzi, sconti, recensioni)
OUTPUT_FILE=./output/deals.json

# File JSON completo con dati Amazon API (dettagli prodotto + link affiliazione)
PRODUCTS_OUTPUT_FILE=./output/products-complete.json
```

I file Excel vengono salvati automaticamente in `./output/tracker_outcome.xlsx`.

---

### 🔗 Opzioni Link di Affiliazione

```bash
# Genera deep links per app Amazon mobile (iOS/Android)
INCLUDE_DEEP_LINKS=true

# Genera link storefront (richiede AMAZON_STOREFRONT_ID)
INCLUDE_STOREFRONT_LINKS=false
```

**Deep Links:**

- Se `true`, genera link che aprono l'app Amazon su iOS/Android
- Utile per campagne mobile

**Storefront Links:**

- Se `true` e hai configurato `AMAZON_STOREFRONT_ID`, genera link alla tua vetrina
- Se `false` o se `AMAZON_STOREFRONT_ID` è vuoto, non vengono generati

---

## ▶️ Come Usare il Progetto

### Esecuzione Completa (Scraping + Fetching + Excel)

Il comando principale esegue tutto il flusso automaticamente:

```bash
npm start
```

**Cosa fa:**

1. ✅ Valida le configurazioni
2. 🌐 Apre un browser headless
3. 🇮🇹 Naviga su Keepa.com e seleziona Amazon.it
4. 🔍 Scrape le offerte per le categorie configurate
5. 📊 Estrae ASIN, prezzi, sconti, recensioni
6. 💾 Salva i dati in `./output/deals.json`
7. 🔗 Chiama l'Amazon Creators API per ogni ASIN
8. 📦 Genera link di affiliazione (web, mobile app, storefront)
9. 💾 Salva i dati completi in `./output/products-complete.json`
10. 📊 Aggiorna il file Excel `./output/tracker_outcome.xlsx` con un nuovo foglio della data corrente

---

### Comandi Disponibili

```bash
# Esegui il flusso completo (scraping + API + Excel)
npm start

# Esegui con auto-reload su modifiche (sviluppo)
npm run dev

# Esegui solo il fetching da Amazon API (salta lo scraping Keepa)
# Usa i dati già salvati in ./output/deals.json
npm run fetch-products

# Installa i browser per Playwright (da eseguire dopo npm install)
npm run install-browsers
```

---

### Modalità di Esecuzione

#### 1️⃣ Prima Esecuzione Completa

```bash
npm start
```

Output atteso:

```
🎬 Starting Keepa Tracker...
══════════════════════════════════════════════════════

📋 Step 1: Validating configuration...
✅ Configuration validated successfully

📋 Step 2: Scraping Keepa deals...
🚀 Starting Keepa scraper (puppeteer-real-browser)...
✅ Browser launched with puppeteer-real-browser
...
✅ Scraped 30 products from Keepa

📊 Products by Category:
  Bellezza: 10 products
  Illuminazione: 10 products
  App e Giochi: 10 products

📋 Step 4: Saving product data with pricing to file...
💾 Saved 30 products to ./output/deals.json

📋 Step 5: Automatically fetching product details from Amazon...
🔍 Fetching details for 30 products from Amazon Creators API...
✅ Fetched 30 products successfully

📋 Step 6: Saving complete product data to file...
💾 Saved 30 products to ./output/products-complete.json

📋 Step 6.5: Exporting to Excel tracker file...
✅ Excel file created with sheet: "20-02-2026"

🎉 Keepa scraping completed successfully!
```

---

#### 2️⃣ Esecuzione Solo Fetching (Salta Scraping)

Se hai già scraped i dati e vuoi solo aggiornare i dettagli Amazon o rigenerare i link:

```bash
npm run fetch-products
```

Questo:

- ✅ Legge i dati da `./output/deals.json`
- 🔗 Chiama l'Amazon API per ogni ASIN
- 💾 Aggiorna `./output/products-complete.json` e Excel

---

## 📊 File di Output

### 1. `./output/deals.json`

Contiene i dati scraped da Keepa:

```json
[
  {
    "asin": "B0DHRQ2XGJ",
    "category": "Bellezza",
    "discount": -45,
    "avgPrice": 29.99,
    "currentPrice": 16.50,
    "rating": 4.5,
    "reviewCount": 234
  },
  ...
]
```

---

### 2. `./output/products-complete.json`

Contiene i dati completi da Amazon API + link affiliazione:

```json
[
  {
    "asin": "B0DHRQ2XGJ",
    "parentASIN": null,
    "title": "L'Oréal Paris Crema Viso Giorno...",
    "price": 16.50,
    "currency": "EUR",
    "availability": {
      "message": "In Stock",
      "type": "Now"
    },
    "rating": 4.5,
    "ratingCount": 234,
    "features": [
      "Texture leggera e non grassa",
      "SPF 15",
      ...
    ],
    "image": {
      "small": "https://m.media-amazon.com/images/I/41abc123._SL75_.jpg",
      "large": "https://m.media-amazon.com/images/I/41abc123._SL500_.jpg"
    },
    "affiliateLinks": {
      "web": "https://www.amazon.it/dp/B0DHRQ2XGJ?tag=tuoid-21",
      "mobileAppIOS": "amazon://musthave/B0DHRQ2XGJ?tag=tuoid-21",
      "mobileAppAndroid": "amzn://amazon.com/gp/product/B0DHRQ2XGJ?tag=tuoid-21",
      "storefront": "https://www.amazon.it/services/storefront?storefront_id=A123456789ABCD&asins=B0DHRQ2XGJ&tag=tuoid-21",
      "smartLink": {
        "url": "https://www.amazon.it/dp/B0DHRQ2XGJ?tag=tuoid-21&ref=smart-link",
        "fallbackIOS": "amazon://musthave/B0DHRQ2XGJ?tag=tuoid-21",
        "fallbackAndroid": "amzn://amazon.com/gp/product/B0DHRQ2XGJ?tag=tuoid-21",
        "description": "Use this with a redirect service that detects device and opens app on mobile"
      }
    },
    "category": "Bellezza",
    "keepaDiscount": -45,
    "keepaAvgPrice": 29.99,
    "keepaCurrentPrice": 16.50,
    "keepaRating": 4.5,
    "keepaReviewCount": 234,
    "rawData": { ... },
    "fetchedAt": "2026-02-20T10:30:45.123Z",
    "marketplace": "IT"
  },
  ...
]
```

---

### 3. `./output/tracker_outcome.xlsx`

File Excel con fogli organizzati per data (un foglio per ogni giorno), contenente:

| Data Fetch       | Categoria | ASIN       | Titolo           | Prezzo Originale | Prezzo Scontato | Importo Risparmiato | Sconto % | ... |
| ---------------- | --------- | ---------- | ---------------- | ---------------- | --------------- | ------------------- | -------- | --- |
| 20/02/2026 10:30 | Bellezza  | B0DHRQ2XGJ | L'Oréal Paris... | 29.99            | 16.50           | 13.49               | -45      | ... |

**Gestione Automatica dei Fogli:**

- Se non esiste un foglio per la data corrente, ne viene creato uno nuovo
- I dati vengono aggiunti in fondo al foglio della data corrente
- Facile confrontare prezzi tra giorni diversi

---

## 🛠️ Troubleshooting

### Errore: "Missing required environment variables"

**Causa:** Non hai configurato correttamente il file `.env`.

**Soluzione:**

```bash
# Verifica che .env esista
ls -la | grep .env

# Se non esiste, copialo da .env.example
cp .env.example .env

# Apri e compila le variabili obbligatorie
open -e .env
```

Assicurati di aver compilato almeno:

- `AMAZON_ACCESS_KEY`
- `AMAZON_SECRET_KEY`
- `AMAZON_PARTNER_TAG`

---

### Errore: "Failed to get access token"

**Causa:** Credenziali Amazon Creators API non valide o scadute.

**Soluzione:**

1. Verifica che le credenziali siano corrette nell'`.env`
2. Controlla che il tuo account affiliazione sia attivo
3. Verifica di avere accesso all'Amazon Creators API (potrebbe richiedere approvazione)

**Test rapido:**

```bash
# Prova a ottenere un token manualmente
curl -X POST https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "TUO_CLIENT_ID:TUO_CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=creatorsapi/default"
```

Se questo fallisce, le tue credenziali non sono valide.

---

### Errore: "Cloudflare challenge detected"

**Causa:** Keepa usa Cloudflare per proteggere il sito. A volte rileva bot.

**Soluzione:**

- Lo script gestisce automaticamente Cloudflare (attende 90 secondi)
- Se continua a fallire:
  - Aumenta `SCRAPING_DELAY_MS` nell'`.env` (prova 3000-5000)
  - Riduci `MAX_PRODUCTS_PER_CATEGORY` (prova 5-8)
  - Esegui lo script in orari diversi

---

### Browser non si avvia / "Browser not found"

**Causa:** I browser Playwright non sono installati.

**Soluzione:**

```bash
npm run install-browsers
```

Se continua a fallire:

```bash
# Installa manualmente Chromium
npx playwright install chromium --with-deps
```

---

### Excel non si genera / "Error writing Excel"

**Causa:** Permessi file o cartella `output` non esistente.

**Soluzione:**

```bash
# Crea la cartella output manualmente
mkdir -p ./output
chmod 755 ./output

# Rimuovi eventuali file Excel corrotti
rm -f ./output/tracker_outcome.xlsx

# Rilancia lo script
npm start
```

---

### "Node version too old" o errori di sintassi

**Causa:** Stai usando una versione di Node.js inferiore a 22.

**Soluzione:**

```bash
# Verifica la versione
node --version

# Se è inferiore a 22, installa la v22
nvm install 22
nvm use 22
nvm alias default 22

# Verifica di nuovo
node --version
```

---

## 📚 Struttura del Progetto

```
keepa_tracker/
├── assets/                  # Risorse grafiche (icone, logo)
│   └── AppIcon.iconset/
│       └── icon_512x512@2x.png # Logo dell'applicazione
├── bin/
│   └── run-node.sh          # Script per eseguire Node.js con nvm
├── docs/                    # Documentazione aggiuntiva
├── output/                  # File di output (JSON, Excel)
│   ├── deals.json           # Dati Keepa
│   ├── products-complete.json # Dati completi Amazon + links
│   └── tracker_outcome.xlsx # Excel tracker
├── src/
│   ├── index.js             # Entry point principale (scraping + fetching)
│   ├── fetch-products.js    # Script per fetch da Amazon API
│   ├── config/
│   │   └── index.js         # Gestione configurazioni .env
│   ├── scrapers/
│   │   └── keepa.js         # Scraper Keepa (puppeteer-real-browser)
│   ├── services/
│   │   └── amazon.js        # Client Amazon Creators API
│   ├── templates/
│   │   └── product-page-template.html # Template HTML per pagina prodotti
│   └── utils/
│       ├── excel-handler.js # Gestione file Excel
│       ├── json-builder.js  # Gestione file JSON
│       └── notes-generator.js # Generatore pagine HTML interattive
├── .env                     # Variabili d'ambiente (NON committare!)
├── .env.example             # Template variabili d'ambiente
├── .gitignore               # File da ignorare in Git
├── package.json             # Dipendenze e script npm
└── README.md                # Questa guida
```

---

## 🎨 Personalizzazione Template HTML

Il sistema utilizza un **template HTML separato** per generare le pagine dei prodotti, rendendolo facilmente personalizzabile.

### Percorso Template

Il template si trova in: `src/templates/product-page-template.html`

### Come Personalizzare

Il template usa **placeholder** che vengono sostituiti dinamicamente:

- `{{PAGE_TITLE}}` - Titolo della pagina (es. "I consigli di Nonna Pina Deals - 25-02-2026")
- `{{LOGO_PATH}}` - Percorso del logo in alto a sinistra
- `{{PRODUCTS_CONTENT}}` - Contenuto HTML dei prodotti

### Personalizzazioni Comuni

#### 1. **Cambiare Colori**

Modifica i gradienti nel CSS del template:

```css
/* Gradient principale (attualmente viola) */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Cambia con i tuoi colori preferiti, es. blu/verde: */
background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
```

#### 2. **Modificare Font**

Nel tag `<style>`, cerca:

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...;
```

Sostituisci con il tuo font preferito.

#### 3. **Cambiare Logo**

Il logo è caricato da: `assets/AppIcon.iconset/icon_512x512@2x.png`

Per cambiare:

1. Sostituisci il file PNG nella cartella `assets/AppIcon.iconset/`
2. Oppure modifica `notes-generator.js` alla riga 23:

```javascript
this.logoPath = path.join(__dirname, '../../assets/TUO_LOGO.png');
```

#### 4. **Modificare Layout Prodotti**

Modifica il metodo `formatProductForNote()` in `notes-generator.js` (linea ~155) per cambiare la struttura HTML di ogni prodotto.

### Struttura Template

```html
<div class="page-header">
  <!-- Logo e titolo -->
</div>

<div class="container">
  <h1>{{PAGE_TITLE}}</h1>
  <div id="products-container">
    <!-- Categoria -->
    <div class="category-header">...</div>

    <!-- Prodotto -->
    <div class="product">
      <div class="image-section">...</div>
      <div class="copyable-content">
        <div class="text-content">...</div>
        <button class="copy-btn">...</button>
      </div>
    </div>
  </div>
</div>
```

---

## 🔐 Sicurezza

---

## 📝 File di Output Generati

### 1. **File Excel** (`output/tracker_outcome.xlsx`)

Spreadsheet con i dati di tutte le offerte estratte, organizzato in fogli per data:

- **Colonne**: ASIN, Titolo, Categoria, Prezzo Originale, Prezzo Scontato, Sconto%, Rating, Numero Review, Link Affiliazione, Immagini, etc.
- **Fogli**: Uno per ogni data (formato `DD-MM-YYYY`)
- **Header giallo**: Prima riga con i titoli colonna
- **Aggiornamento**: I nuovi prodotti si aggiungono automaticamente

**Uso**: Tracking storico delle offerte, analisi sconti, reporting

---

### 2. **File JSON** (`output/products-complete.json`)

Dati completi in formato JSON con tutte le informazioni per ogni prodotto:

- **Struttura**: Array di oggetti prodotto
- **Campi**: ASIN, titolo, prezzi, rating, categoria, link di affiliazione (web, mobile iOS/Android, storefront smart link), immagini, dati grezzi API

**Uso**: Integrazione con altri sistemi, automazione, API custom

---

### 3. **Pagina HTML Interattiva** (`Desktop/nonnapina_DD-MM-YYYY.html`)

**🆕 Nuovo!** Pagina HTML interattiva per social media, salvata direttamente sul Desktop.

Caratteristiche:

- 📁 **Posizione**: Desktop (facile accesso)
- 📋 **Organizzazione**: Prodotti raggruppati per categoria
- 🎨 **Design**: Pagina web moderna e responsive con:
  - 🖼️ **Immagini renderizzate** direttamente nella pagina
  - 📋 **Pulsanti "Copia"** per copiare il testo negli appunti con un click
  - 🎨 **Grafica accattivante** con gradient viola e layout pulito
  - 📱 **Responsive** - funziona su desktop, tablet e mobile
- 💻 **Interattività**: Ogni prodotto ha un pulsante laterale per copiare il testo formattato
- 🔗 **Link immagine** sotto l'immagine renderizzata per accesso diretto

**Contenuto per ogni prodotto**:

```
[IMMAGINE RENDERIZZATA]
🖼️ Link Immagine

━━━━━━━━━━━━━━━━━━━━━
| 💬 [Titolo prodotto]      | [📋 Copia]
| 💰 A soli XX€ invece di   |
|    YY€ (-Z%)              |
|                           |
| 🔗 [Smart Link]           |
| ⭐ [N] Recensioni: X.X/5.0|
| 🚚 Venduto e spedito da   |
|    Amazon                 |
━━━━━━━━━━━━━━━━━━━━━
```

**Funzionalità**:

- **Click su "Copia"**: Copia tutto il testo formattato negli appunti
- **Feedback visivo**: Il pulsante diventa verde "✅ Copiato!" per 2 secondi
- **Immagini grandi**: Le immagini dei prodotti sono visualizzate direttamente
- **Link immagine**: Per aprire l'immagine a schermo intero

**Apertura automatica**: Il file si apre automaticamente con il browser predefinito dopo la generazione.

---

## 🚀 Launcher App - Eseguire il Processo da Mac

### Creazione del Launcher (Una volta sola)

Per eseguire il Keepa Tracker con un semplice doppio click dal Desktop, crea l'applicazione launcher:

```bash
# Dalla cartella del progetto
./create-launcher.sh
```

Questo script crea:

- 📦 **Keepa Tracker.app** sul Desktop
- 🎨 **Icona personalizzata** (dalla cartella `assets/icdnp_icon.png`)
- ⚙️ **Script launcher** che apre il Terminale e avvia il processo

### Uso del Launcher

#### Metodo 1: Desktop

1. Vai sul **Desktop**
2. Doppio click su **"Keepa Tracker.app"**
3. ✅ Si apre un Terminale e parte il processo

#### Metodo 2: Dock

1. Apri il Finder
2. Vai al Desktop
3. Trascinare **"Keepa Tracker.app"** nel Dock
4. Ora puoi lanciare il processo clicco nel Dock

#### Metodo 3: Spotlight

1. Premi **Cmd + Spazio** (Spotlight)
2. Digita "Keepa Tracker"
3. Premi Enter
4. ✅ Parte il processo

### Personalizzare l'Icona

#### Opzione 1: Icona dalla tua immagine (consigliato)

1. Prepara un file immagine (PNG, JPG, qualsiasi formato)
2. Salvalo come `AppIcon.icns` in `assets/AppIcon.icns`
3. Esegui di nuovo: `./create-launcher.sh`
4. ✨ La nuova app avrà l'icona personalizzata

#### Opzione 2: Cambia l'icona direttamente

1. Fai **right-click** su "Keepa Tracker.app"
2. Seleziona **"Get Info"**
3. Clicca sull'**icona piccola in alto a sinistra**
4. Copia l'immagine che vuoi (Cmd+C)
5. Incolla (Cmd+V)
6. 🎨 L'icona cambia subito!

#### Opzione 3: Conversione professionale

Se vuoi un file `.icns` professionale:

1. Prepara un'immagine PNG/JPG (consigliato almeno 1024x1024px)
2. Converti con: [https://cloudconvert.com/png-to-icns](https://cloudconvert.com/png-to-icns)
3. Scarica il file `.icns`
4. Seguire Opzione 1

### Ricreazione del Launcher

Se cambi l'icona o il nome, ricrea l'app:

```bash
# Rimuovi la vecchia app
rm -rf ~/Desktop/Keepa\ Tracker.app

# Crea la nuova
./create-launcher.sh
```

---

### ⚠️ Importante: NON committare il file `.env`!

Il file `.env` contiene credenziali sensibili. **Mai** condividerlo pubblicamente o committarlo su Git.

**Verifica che `.env` sia in `.gitignore`:**

```bash
cat .gitignore | grep .env
```

Output atteso:

```
.env
```

**Se commetti accidentalmente il .env:**

```bash
# Rimuovi dalla history Git
git rm --cached .env
git commit -m "Remove .env from version control"
git push
```

Poi:

1. Rigenera le tue credenziali Amazon (le vecchie sono compromesse!)
2. Aggiorna il `.env` con le nuove credenziali

---

## 🤝 Contribuire

Se vuoi contribuire al progetto:

1. Fai un fork del repository
2. Crea un branch per la tua feature (`git checkout -b feature/nuova-feature`)
3. Committa le modifiche (`git commit -am 'Aggiunta nuova feature'`)
4. Pusha il branch (`git push origin feature/nuova-feature`)
5. Apri una Pull Request

---

## 📝 Note Aggiuntive

### Rate Limiting

- Amazon Creators API: **1 richiesta/secondo** (gestito automaticamente dallo script)
- Keepa Scraping: Configurabile tramite `SCRAPING_DELAY_MS` (default 2000ms)

### Limiti di Default

- **Batch size Amazon API:** 10 ASINs per richiesta
- **Max prodotti per categoria:** Configurabile (default 10)
- **Timeout scraping:** 60 secondi per caricamento prodotti

### Performance

- Scraping di 40 prodotti (4 categorie x 10): ~5-10 minuti
- Fetching da Amazon API (40 prodotti): ~1-2 minuti
- Generazione Excel: ~1-2 secondi

---

## 🎨 Nuove Funzionalità - Top Deals Collage

### Top 5 Deals con Immagine Collage

Il sistema ora genera automaticamente una **categoria speciale "Top 5 Deals"** che raccoglie i 5 prodotti con il **maggior sconto percentuale**.

#### Caratteristiche:

- **📊 Selezione Automatica**: Estrae i top 5 prodotti ordinati per percentuale di sconto
- **🖼️ Collage Immagine**: Crea un'immagine composita con layout 3+2 (3 prodotti sopra, 2 sotto)
- **📱 Post Speciale**: Genera un post unico con:
  - Nome prodotto
  - Smart link
  - Review score (rating + numero recensioni)
  - Percentuale sconto

#### Configurazione

Aggiungi al file `.env`:

```env
# Top 5 Deals Category
TOP_DEALS_COUNT=5  # Numero di top deals da mostrare (default: 5)
```

#### Output

- **HTML**: Categoria "Top 5 Deals" sempre in prima posizione nell'indice
- **Immagine collage**: Salvata in `output/assets/top-5-deals.png` (sovrascritta ad ogni esecuzione)
- **Formato immagine**: PNG, griglia 3+2, dimensioni ottimizzate per social media

#### Tecnologia

- Utilizza **sharp** per il download e la composizione delle immagini
- Download parallelo delle 5 immagini prodotto
- Fallback con placeholder se il download fallisce
- Creazione automatica della directory `output/assets`

---

## 📞 Supporto

Per problemi tecnici o domande:

1. Leggi attentamente questa guida
2. Controlla la sezione **Troubleshooting**
3. Verifica i log di errore nel Terminale
4. Consulta la documentazione Amazon Creators API: [https://developers.amazon.com/](https://developers.amazon.com/)

---

## ⚖️ Disclaimer

Questo strumento è fornito "as-is" per scopi educativi e personali. L'utente è responsabile di:

- Rispettare i Terms of Service di Amazon e Keepa
- Non abusare dello scraping (rispettare rate limits)
- Verificare la conformità alle leggi locali sul web scraping
- Gestire correttamente le credenziali API

L'autore non è responsabile per:

- Uso improprio dello strumento
- Violazioni dei ToS di terze parti
- Perdita di dati o credenziali
- Ban o sospensioni account Amazon/Keepa

---

## 📄 Licenza

ISC License - vedi [package.json](package.json) per dettagli.

---

**Buon tracking! 🚀**
