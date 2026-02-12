# Keepa Tracker

Scraper automatico per deals Keepa con generazione link affiliati Amazon.

## 🚀 Setup Iniziale

### 1. Installa dipendenze

```bash
npm install
```

### 2. Installa browser Playwright

```bash
npm run install-browsers
```

### 3. Configura credenziali

Copia `.env.example` in `.env` e compila:

```bash
cp .env.example .env
```

Modifica `.env` con le tue credenziali Amazon PA-API:

- `AMAZON_ACCESS_KEY`: Access Key da Amazon Associates
- `AMAZON_SECRET_KEY`: Secret Key da Amazon Associates
- `AMAZON_PARTNER_TAG`: Il tuo tag affiliato (es. `tuotag-21`)

### 4. Configura categorie Keepa

Nel file `.env`, modifica `KEEPA_CATEGORIES` con gli ID desiderati:

- `2` = Sport e tempo libero
- `3` = Elettronica
- `5` = Casa e cucina
- `16` = Fai da te
- `78` = Giardino

Esempio: `KEEPA_CATEGORIES=5,16,3` (3 categorie)

## 📦 Esecuzione

### Metodo 1: VS Code Debug (consigliato)

1. Premi `F5` o vai nel pannello "Run and Debug"
2. Seleziona **"🚀 Run Keepa Tracker"**
3. Premi Play ▶️

### Metodo 2: Terminale

```bash
npm start
```

### Metodo 3: Watch mode (sviluppo)

```bash
npm run dev
```

## 🧪 Test Singoli Moduli

Nel pannello debug sono disponibili configurazioni per testare:

- **🧪 Test Keepa Scraper Only**: testa solo lo scraping
- **🔗 Test Amazon API Only**: testa solo le API Amazon

## 📁 Output

Il file JSON viene salvato in `./output/deals.json` con questa struttura:

```json
[
  {
    "name": "Nome Prodotto",
    "asin": "B0DHRQ2XGJ",
    "url": "https://www.amazon.it/...",
    "affiliate_link": "https://www.amazon.it/dp/B0DHRQ2XGJ?tag=tuotag-21",
    "img": "https://m.media-amazon.com/...",
    "description": "Descrizione del prodotto",
    "post": "",
    "price": "€29.99",
    "category": "Casa e cucina"
  }
]
```

## ⚙️ Configurazione Avanzata

### Modifica numero prodotti per categoria

Nel `.env`:

```
MAX_PRODUCTS_PER_CATEGORY=15
```

### Modifica delay tra richieste (ms)

```
SCRAPING_DELAY_MS=3000
```

### Cambia path output

```
OUTPUT_FILE=./miei-deals/prodotti.json
```

## 📝 Note

- Lo scraping viene eseguito con browser visibile (headless=false). Per produzione, modifica `src/scrapers/keepa.js` linea 26.
- Amazon PA-API ha limite di 1 richiesta/secondo (gestito automaticamente).
- Keepa potrebbe avere anti-bot: usa con moderazione (2-3 volte/giorno come pianificato).

## 🛠️ Troubleshooting

**"Missing required environment variables"**
→ Verifica che `.env` sia presente e contenga tutte le chiavi

**"Browser not found"**
→ Esegui `npm run install-browsers`

**"Amazon API error"**
→ Verifica credenziali PA-API e che l'account sia attivo
