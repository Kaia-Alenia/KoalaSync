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
| `en` | 🇬🇧 **English** | `100% Manually Verified` | Primary developer language and system default |
| `de` | 🇩🇪 **German** | `100% Manually Verified` | Core market and compliance baseline |
| `fr` | 🇫🇷 **French** | `Auto-Generated` | Needs manual native review and polishing |
| `es` | 🇪🇸 **Spanish** | `Auto-Generated` | Needs manual native review and polishing |
| `pt-BR` | 🇧🇷 **Portuguese (Brasil)** | `Auto-Generated` | Needs manual native review and polishing |
| `ru` | 🇷🇺 **Russian** | `Auto-Generated` | Needs manual native review and polishing |
| `it` | 🇮🇹 **Italian** | `Auto-Generated` | Needs manual native review and polishing |
| `pl` | 🇵🇱 **Polish** | `Auto-Generated` | Needs manual native review and polishing |
| `tr` | 🇹🇷 **Turkish** | `Auto-Generated` | Needs manual native review and polishing |
| `nl` | 🇳🇱 **Dutch** | `Auto-Generated` | Needs manual native review and polishing |
| `ja` | 🇯🇵 **Japanese** | `Auto-Generated` | Needs manual native review and polishing |
| `ko` | 🇰🇷 **Korean** | `Auto-Generated` | Needs manual native review and polishing |
| `pt` | 🇵🇹 **European Portuguese** | `Auto-Generated` | Needs manual native review and polishing |

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

## 🛠️ Step-by-Step: Translating or Adding a Language

If you want to correct an existing language or add a new one, here is how you do it. 

### Step 1: Fork and Clone the Repository
If you are an external contributor, you need to use the standard Open Source workflow:
1. Click the "Fork" button on GitHub to create your own copy of the repository.
2. Clone your fork locally: `git clone https://github.com/YOUR-USERNAME/KoalaSync.git`
3. Create a branch: `git checkout -b translation/my-language`

### Step 2: Edit or Create the Dictionaries
KoalaSync requires two sets of translations: one for the **website** and one for the **browser extension**.

**For the Website:**
1. Navigate to `website/locales/`. Edit an existing `[lang].json` or copy `en.json` to create a new one (e.g., `it.json`).
2. Translate all string values. Do not change the JSON keys.
3. If creating a new language, configure the metadata at the top:
   ```json
   {
     "LANG_CODE": "it",
     "HTML_CLASS": "lang-it",
     "CANONICAL_PATH": "it/",
     "LANG_TOGGLE_URL": "../",
     "LANG_TOGGLE_TEXT": "EN"
   }
   ```
4. If creating a new language, register it in `website/build.js` by adding it to the `languages` array.

**For the Extension:**
1. Navigate to `extension/locales/`. Edit an existing `[lang].json` or copy `en.json` to create a new one.
2. Translate the values.

### Step 3: Verify Locally
Ensure your JSON files are valid and all keys match the English baseline:
```bash
# Tests the extension locales for missing keys or syntax errors
node scripts/test-locales.js

# Tests the website locales for missing keys or syntax errors
node scripts/test-website-locales.mjs

# Builds the website with your new translations
node website/build.js
```

### Step 4: Commit and Pull Request
1. Open this `TRANSLATION.md` file and add/update your language in the **Supported Languages Dashboard**. Mark it as `100% Manually Verified` if you are a native speaker checking an auto-generated file.
2. Commit your changes: `git commit -m "Update Italian translations"`
3. Push to your fork: `git push origin translation/my-language`
4. Open a **Pull Request** on the main KoalaSync repository on GitHub.

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

---

## 🔌 Extension Internationalization (i18n)

In **v2.0**, we extended full internationalization support to the **Browser Extension itself**. The architecture mirrors our web-based dynamic localization model to maintain complete parity.

*   **Locales Directory:** [`extension/locales/`](file:///Users/koala/Documents/KoalaPlay/extension/locales/)
*   **Active Dictionaries:**
    *   [`en.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/en.json) (🇬🇧 Baseline English)
    *   [`de.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/de.json) (🇩🇪 German)
    *   [`fr.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/fr.json) (🇫🇷 French)
    *   [`es.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/es.json) (🇪🇸 Spanish)
    *   [`pt-BR.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/pt-BR.json) (🇧🇷 Portuguese (Brasil))
    *   [`ru.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/ru.json) (🇷🇺 Russian)
    *   [`it.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/it.json) (🇮🇹 Italian)
    *   [`pl.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/pl.json) (🇵🇱 Polish)
    *   [`tr.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/tr.json) (🇹🇷 Turkish)
    *   [`nl.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/nl.json) (🇳🇱 Dutch)
    *   [`ja.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/ja.json) (🇯🇵 Japanese)
    *   [`ko.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/ko.json) (🇰🇷 Korean)
    *   [`pt.json`](file:///Users/koala/Documents/KoalaPlay/extension/locales/pt.json) (🇵🇹 European Portuguese)
*   **Translation Engine:** [`extension/i18n.js`](file:///Users/koala/Documents/KoalaPlay/extension/i18n.js)
*   **Validation Script:** [`scripts/test-locales.js`](file:///Users/koala/Documents/KoalaPlay/scripts/test-locales.js)

### ⚙️ How it Works inside the Extension

1. **System Locale Auto-Detection**: On first run, the extension detects the browser system language using `navigator.language` or `chrome.i18n.getUILanguage()`.
2. **On-the-Fly Redraws**: When the user selects a different language in the settings tab (`#langSelector`), the selection is stored in `chrome.storage.sync` and the translation engine immediately triggers `translateDOM()`. The interface, empty state cards, tooltips, dynamic onboarding tutorial guides, and status badges re-render instantly without reloading the popup.
3. **Localized System Notifications**: On play, pause, or seek commands, `background.js` retrieves the user's active locale preference from storage, loads the correct dictionary, and pushes native OS notifications fully translated.

### 🧪 Auditing & Sync Checks

To ensure that no language dictionary falls out of sync (causing missing labels or blank interfaces), developers must run the locale auditor tool before packaging releases:
```bash
node scripts/test-locales.js
```
This script asserts that all JSON dictionary files under `extension/locales/` share exactly the same set of keys as the English baseline (`en.json`).

