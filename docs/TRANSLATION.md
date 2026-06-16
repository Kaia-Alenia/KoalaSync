# KoalaSync Translation & Localization Guide

Welcome to the **KoalaSync** translation guide! We rely on the open-source community to make KoalaSync accessible to users worldwide.

KoalaSync is split into two independent translation areas. You can translate either one, or both:
1. **The Browser Extension** (`extension/locales/`): The core product that users interact with daily.
2. **The Website** (`website/locales/`): The landing page and invitation bridge.

---

## 📊 Supported Languages Dashboard

We divide supported languages into two tiers: **Core Languages** (fully hand-crafted and audited by native speakers) and **Extended Languages** (auto-generated using translation models to expand initial coverage).

> [!TIP]
> **Help Us Improve!**
> We welcome community contributions to audit "Auto-Generated" translations and elevate them to "Verified" status.

| Language Code | Language Name | Verification Status | Rationale / Context |
| :--- | :--- | :--- | :--- |
| `en` | 🇬🇧 **English** | `100% Manually Verified` | Global default language (Verified by developer) |
| `de` | 🇩🇪 **German** | `100% Manually Verified` | Developer's native language |
| `fr` | 🇫🇷 **French** | `Auto-Generated` | Needs manual native review and polishing |
| `es` | 🇪🇸 **Spanish** | `100% Manually Verified` | Manual native review by Alenia Studios |
| `pt-BR` | 🇧🇷 **Portuguese (Brasil)** | `100% Manually Verified` | Manual native review by Alenia Studios |
| `ru` | 🇷🇺 **Russian** | `Auto-Generated` | Needs manual native review and polishing |
| `it` | 🇮🇹 **Italian** | `100% Manually Verified` | Manual native review by Alenia Studios |
| `pl` | 🇵🇱 **Polish** | `Auto-Generated` | Needs manual native review and polishing |
| `tr` | 🇹🇷 **Turkish** | `Auto-Generated` | Needs manual native review and polishing |
| `nl` | 🇳🇱 **Dutch** | `Auto-Generated` | Needs manual native review and polishing |
| `ja` | 🇯🇵 **Japanese** | `Auto-Generated` | Needs manual native review and polishing |
| `ko` | 🇰🇷 **Korean** | `Auto-Generated` | Needs manual native review and polishing |
| `pt` | 🇵🇹 **European Portuguese** | `100% Manually Verified` | Manual native review by Alenia Studios |

> [!WARNING]
> **Autogeneration Quality Rule**
> Any newly contributed languages must be marked as `"Auto-Generated"` in this table until fully reviewed and signed off by a native speaker in a pull request.

---

## 🛠️ How to Translate KoalaSync

Here is the exact step-by-step process for contributing translations.

### Step 1: Fork and Clone the Repository
If you are an external contributor, start with the standard Open Source workflow:
1. Click the "Fork" button on GitHub to create your own copy of the repository.
2. Clone your fork locally: `git clone https://github.com/YOUR-USERNAME/KoalaSync.git`
3. Create a branch: `git checkout -b translation/my-language`

### Step 2: Translate the Extension
The browser extension handles real-time syncing, settings, and popups.
1. Navigate to [`extension/locales/`](file:///Users/koala/Documents/Workspaces/KoalaSync/extension/locales/).
2. Edit an existing `[lang].json` or copy `en.json` to create a new one (e.g., `it.json`).
3. Translate all the string values. **Do not change the JSON keys.**

### Step 3: Translate the Website
The website hosts the landing page and invitation bridge.
1. Navigate to [`website/locales/`](file:///Users/koala/Documents/Workspaces/KoalaSync/website/locales/).
2. Edit an existing `[lang].json` or copy `en.json` to create a new one.
3. Translate all the string values. **Do not change the JSON keys.**
4. If creating a **brand new language**, configure the metadata at the top of your JSON file:
   ```json
   {
     "LANG_CODE": "it",
     "HTML_CLASS": "lang-it",
     "CANONICAL_PATH": "it/",
     "LANG_TOGGLE_URL": "../",
     "LANG_TOGGLE_TEXT": "EN"
   }
   ```
5. If creating a **brand new language**, register it in `website/build.js` by adding it to the `languages` array.

### Step 4: Verify Locally
Ensure your JSON files are valid and all keys match the English baseline. Open your terminal in the KoalaSync root folder and run:
```bash
# Tests the extension locales for missing keys or syntax errors
node scripts/test-locales.js

# Tests the website locales for missing keys or syntax errors
node scripts/test-website-locales.mjs

# Builds the website with your new translations
node website/build.js
```
*Note: If you receive any errors about missing keys or `TODO` placeholders, please fix them before submitting.*

### Step 5: Commit and Pull Request
1. Open this `TRANSLATION.md` file and add/update your language in the **Supported Languages Dashboard** above. Mark it as `100% Manually Verified` if you are a native speaker.
2. Commit your changes: `git commit -m "Update Italian translations"`
3. Push to your fork: `git push origin translation/my-language`
4. Open a **Pull Request** on the main KoalaSync repository on GitHub.

---

## ⚖️ Strict Legal Exclusion Rule

Our legal pages have strict constraints to protect user privacy and avoid regulatory liabilities.

> [!IMPORTANT]
> **DO NOT TRANSLATE LEGAL DOCUMENTS**
> The legal notice ([impressum.html](file:///Users/koala/Documents/Workspaces/KoalaSync/website/impressum.html)) and privacy policy ([datenschutz.html](file:///Users/koala/Documents/Workspaces/KoalaSync/website/datenschutz.html)) **MUST remain exclusively in English and German**.
> 
> *   **Rationale:** Legal compliance under the European Union General Data Protection Regulation (GDPR) and the German Digital Services Act (DDG). Offering automated translations of legally binding notices introduces compliance risks due to potential mistranslations of liability limits.
> *   **Technical Fallback:** Our system automatically falls back to **English** for legal pages if a user visits them in an unsupported language, so you do not need to worry about this.
