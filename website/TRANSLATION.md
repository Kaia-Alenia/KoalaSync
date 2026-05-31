# KoalaSync Translation & Localization Guide

Welcome to the **KoalaSync** translation and internationalization framework! This document provides clear, professional instructions for developers and contributors looking to maintain, audit, or add new languages to the official KoalaSync website.

---

## 🏛️ Architecture Overview

The KoalaSync website utilizes a custom, high-performance, zero-dependency static site generator built in Node.js. Instead of using complex client-side translation runtimes or bulky frameworks, localized pages are compiled ahead-of-time (AOT) to maintain lightning-fast page speeds and strict data sovereignty.

*   **Template Source:** [`website/template.html`](file:///Users/koala/Documents/KoalaPlay/website/template.html) (Single Source of Truth)
*   **Locales Source:** `/website/locales/[lang].json` (Structured JSON translation dictionaries)
*   **Build Pipeline:** [`website/build.js`](file:///Users/koala/Documents/KoalaPlay/website/build.js) (Pure Node.js script that compiles pages into `/website/www/`)

---

## 📊 Supported Languages Dashboard

We divide supported languages into two tiers: **Core Languages** (fully hand-crafted and audited by native speakers) and **Extended Languages** (auto-generated using translation models to expand initial coverage).

> [!TIP]
> **Help Us Improve!**
> We welcome community contributions to audit "Auto-Generated" translations and elevate them to "Verified" status.

| Language Code | Language Name | Verification Status | Rationale / Context |
| :--- | :--- | :--- | :--- |
| `en` | **English** | `100% Manually Verified` | Primary developer language and system default |
| `de` | **German** | `100% Manually Verified` | Core market and compliance baseline |
| `fr` | **French** | `Auto-Generated` | Needs manual native review and polishing |
| `es` | **Spanish** | `Auto-Generated` | Needs manual native review and polishing |
| `pt-BR` | **Portuguese (Brasil)** | `Auto-Generated` | Needs manual native review and polishing |
| `ru` | **Russian** | `Auto-Generated` | Needs manual native review and polishing |

> [!WARNING]
> **Autogeneration Quality Rule**
> Any newly contributed languages must be committed as `"Auto-Generated"` until fully reviewed and signed off by a native speaker in a pull request.

---

## ⚖️ Strict Legal Exclusion Rule

Our legal pages have strict constraints to protect user privacy and avoid regulatory liabilities.

> [!IMPORTANT]
> **DO NOT TRANSLATE LEGAL DOCUMENTS**
> The legal notice ([impressum.html](file:///Users/koala/Documents/KoalaPlay/website/impressum.html)) and privacy policy ([datenschutz.html](file:///Users/koala/Documents/KoalaPlay/website/datenschutz.html)) **MUST remain exclusively in English and German**.
> 
> *   **Rationale:** Legal compliance under the European Union General Data Protection Regulation (GDPR) and the German Digital Services Act (DDG). Offering automated translations of legally binding notices introduces compliance risks due to potential mistranslations of liability limits.
> *   **Technical Fallback:** The dynamic initializer script (`lang-init.js`) is configured to automatically fallback to **English** for legal pages if a user visits them with a French, Spanish, or other unsupported language preference, keeping their dynamic dropdown choice intact for homepage links.

---

## 🛠️ Step-by-Step: Adding a New Language

Adding a new language (e.g., Italian - `it`) is straightforward. Follow these four structured steps:

### Step 1: Create the Translation Dictionary
Create a new JSON file inside the locales directory named `[lang].json` (e.g., `website/locales/it.json`).
1. Copy the structure of [`website/locales/en.json`](file:///Users/koala/Documents/KoalaPlay/website/locales/en.json) to use as your baseline.
2. Translate all string values while keeping the JSON keys identical.
3. Configure the language metadata keys at the top of the file:
   ```json
   {
     "LANG_CODE": "it",
     "HTML_CLASS": "lang-it",
     "CANONICAL_PATH": "it/",
     "LANG_TOGGLE_URL": "../",
     "LANG_TOGGLE_TEXT": "EN"
   }
   ```

### Step 2: Register in the Compiler
Open the static site generator script [`website/build.js`](file:///Users/koala/Documents/KoalaPlay/website/build.js) and append your new language code to the active `languages` array:
```javascript
// Add 'it' to the array
const languages = ['en', 'de', 'fr', 'es', 'pt-BR', 'ru', 'it'];
```

### Step 3: Run the Build Script
Execute the compiler from the root of the repository:
```bash
node website/build.js
```
The compiler will automatically:
1. Load the new JSON translation file.
2. Create the target subdirectory `/website/www/it/`.
3. Generate the compiled `/website/www/it/index.html` landing page, injecting correct relative assets and canonical metadata.

### Step 4: Update the Dashboard
Open this `TRANSLATION.md` file and add your language to the **Supported Languages Dashboard** table, marking it as `Auto-Generated` (unless manually verified).

---

## 🔮 Future Roadmap: Dynamic Utility Pages

For pages that require fully dynamic, client-side interactions (like the room invitation bridge [`join.html`](file:///Users/koala/Documents/KoalaPlay/website/join.html)), we need to scale to unlimited languages without bloating the HTML size or polluting the URL.

### Clean Client-Side i18n Architecture

To maintain zero URL pollution (e.g. keeping invitation links clean as `/join.html#join:roomID:password`), we propose an **asynchronous JSON dictionary injection architecture**:

#### 1. Page Lifecycle Flow
1. **User Landing:** The guest enters `/join.html` with a shared hash.
2. **Language Resolution:** `lang-init.js` immediately reads their saved preference (`localStorage` or `navigator.language`) and applies the active class (e.g. `html.lang = "es"`).
3. **Async Fetching:** A client-side loader script (`i18n-client.js`) runs asynchronously, downloading the correct dictionary (`fetch("/locales/es.json")`).
4. **DOM Translation:** The script scans the page for elements carrying a `data-i18n` attribute and safely updates their text content at runtime, avoiding dual-text nodes and stylesheet recalculations.

#### 2. Declarative HTML Markup
Elements are defined with custom data attributes specifying translation keys. English text is placed as the static HTML fallback:
```html
<h1 data-i18n="JOIN_TITLE">Ready to sync?</h1>
<p id="join-desc" data-i18n="JOIN_SUBTITLE">You've been invited to join a session.</p>
```

#### 3. Zero-Dependency Engine (`i18n-client.js`)
```javascript
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Recover the language determined during early initialization
    const activeLang = document.documentElement.lang || 'en';
    if (activeLang === 'en') return; // Default markup is already in English
    
    // 2. Fetch the corresponding locale JSON asynchronously
    try {
        const response = await fetch(`locales/${activeLang}.json`);
        if (!response.ok) throw new Error('Locale file unavailable');
        const dictionary = await response.json();
        
        // 3. Scan and translate data-i18n attributes
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dictionary[key]) {
                if (el.tagName === 'IMG') {
                    el.alt = dictionary[key];
                } else {
                    el.textContent = dictionary[key];
                }
            }
        });
    } catch (err) {
        console.warn('Dynamic i18n loading failed. Defaulting to English:', err);
    }
});
```

#### Core Benefits
*   **Zero URL Pollution:** Keeps invitation hashes private and avoids messy query parameters (`?lang=de`), protecting user privacy.
*   **Optimal Performance:** Eliminates duplicate hidden text blocks, cutting page weight in half and ensuring smooth rendering.
*   **Infinite Scale:** Adding new languages to dynamic pages requires zero edits to HTML markup; the engine simply fetches new JSON dictionaries on-demand.
