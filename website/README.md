# KoalaSync Website & Invitation Bridge

This directory contains the KoalaSync website. It serves a dual purpose: it is both the **marketing landing page** and the **technical bridge** for joining synchronized rooms.

## Core Roles

### 1. Marketing & Onboarding
Provides a premium, bilingual (EN/DE) overview of features, setup instructions, and direct links to the extension stores.

### 2. The Invitation Bridge (`join.html`)
The website handles incoming invitation links. When a user clicks a link like `sync.koalastuff.net/join.html#join:roomID:pass`, the website:
- **Detects the Extension**: Verifies if KoalaSync is installed via the `bridge.js` content script.
- **Privacy-First Handshake**: The room credentials (ID/Password) are stored in the **URL Hash (#)**. This ensures the sensitive credentials **never reach the web server** and are processed entirely within the user's browser.
- **Auto-Join**: If the extension is detected, it automatically triggers the join flow without requiring user input.

## Architecture

The website is 100% **Static HTML, CSS, and JS**. 
- **Zero Backend**: No Node.js, PHP, or databases are required to host the website.
- **Zero Tracking**: All assets (fonts, icons) are self-hosted to prevent third-party tracking.
- **Responsive**: Fully optimized for mobile with a native-feel hamburger menu.

## Hosting with Caddy

Caddy is the recommended web server. It provides automatic HTTPS and high-performance static file serving.

### Recommended Caddyfile

For a more comprehensive configuration that includes the Relay Server reverse proxy, see the root [Caddyfile.example](../Caddyfile.example).

```caddy
sync.koalastuff.net {
    root * /var/www/koalasync/website
    file_server
    encode zstd gzip

    # Static Caching for high-performance PageSpeed (1 year with validation)
    @static {
        file
        path *.ico *.css *.js *.png *.svg *.webp
    }
    header @static Cache-Control "public, max-age=31536000, must-revalidate"

    # Security Headers & Content Security Policy (CSP)
    header {
        # Strict Content Security Policy (restricts scripts and connections to self, forbids frames)
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none';"
        # Prevent FLoC tracking
        Permissions-Policy interest-cohort=()
        # Security best practices
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy no-referrer-when-downgrade
    }
}
```

## Local Development

1. Open `index.html` directly in any browser.
2. To test the invitation flow locally, use a local server (e.g., `npx serve .`) and navigate to `http://localhost:5000/join.html#join:test-room:test-pass`.
