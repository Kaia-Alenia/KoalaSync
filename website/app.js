// KoalaSync Landing Page Logic

document.addEventListener('DOMContentLoaded', () => {
    // Scroll Reveal Logic (IntersectionObserver for performance)
    const revealElements = document.querySelectorAll('[data-reveal]');
    
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        rootMargin: '0px 0px -150px 0px',
        threshold: 0.1
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // Navbar scroll effect
    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            nav.style.padding = '0.75rem 0';
            nav.style.background = 'rgba(15, 23, 42, 0.9)';
        } else {
            nav.style.padding = '1rem 0';
            nav.style.background = 'rgba(30, 41, 59, 0.7)';
        }
    });

    // Smooth scroll for anchors
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Invite Detection & Bridge
    const checkInvite = () => {
        const isJoinPage = window.location.pathname.includes('join.html');
        
        // Use a short timeout to let the bridge script initialize its dataset attribute
        setTimeout(() => {
            const isInstalled = document.documentElement.dataset.koalasyncInstalled === 'true';
            
            if (window.location.hash.startsWith('#join:')) {
                const parts = window.location.hash.split(':');
                if (parts.length >= 3) {
                    const roomId = parts[1];
                    const password = parts[2];
                    const serverFlag = parts[3] || '0';
                    const serverUrl = parts[4] ? decodeURIComponent(parts[4]) : '';
                    
                    if (isJoinPage) {
                        const displayRoom = document.getElementById('display-room-id');
                        const actions = document.getElementById('join-actions');
                        if (displayRoom) displayRoom.textContent = roomId;
                        
                        if (actions) {
                            if (!isInstalled) {
                                const isFirefox = navigator.userAgent.includes('Firefox');
                                if (isFirefox) {
                                    actions.innerHTML = `
                                        <div class="join-card-actions">
                                            <a href="https://addons.mozilla.org/de/firefox/addon/koalasync/" class="btn btn-primary btn-firefox">
                                                <img src="assets/firefox.svg" alt="Firefox" width="20" style="display: block;">
                                                <span lang="en">GET IT ON MOZILLA ADD-ONS</span><span lang="de">IM FIREFOX ADD-ON STORE HERUNTERLADEN</span>
                                            </a>
                                            <a href="https://github.com/shik3i/KoalaSync" target="_blank" class="btn btn-secondary">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true" style="display: block;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                                                <span lang="en">Download via GitHub</span><span lang="de">Über GitHub herunterladen</span>
                                            </a>
                                        </div>
                                        <p style="text-align:center; font-size:0.8rem; opacity:0.7; margin-top: 1.2rem; color: var(--text-muted);">
                                            <span lang="en">The extension is required to join and sync videos.</span>
                                            <span lang="de">Die Erweiterung ist erforderlich, um beizutreten und Videos zu synchronisieren.</span>
                                        </p>
                                    `;
                                } else {
                                    actions.innerHTML = `
                                        <div class="join-card-actions">
                                            <a href="https://chromewebstore.google.com/detail/koalasync/obbnmkmlaaddodakcbdljknjpagklifc" class="btn btn-primary">
                                                <img src="assets/chrome.svg" alt="Chrome" width="20" style="display: block;">
                                                <span lang="en">GET IT ON CHROME WEBSTORE</span><span lang="de">IM CHROME WEB STORE HERUNTERLADEN</span>
                                            </a>
                                            <a href="https://github.com/shik3i/KoalaSync" target="_blank" class="btn btn-secondary">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true" style="display: block;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                                                <span lang="en">Download via GitHub</span><span lang="de">Über GitHub herunterladen</span>
                                            </a>
                                        </div>
                                        <p style="text-align:center; font-size:0.8rem; opacity:0.7; margin-top: 1.2rem; color: var(--text-muted);">
                                            <span lang="en">The extension is required to join and sync videos.</span>
                                            <span lang="de">Die Erweiterung ist erforderlich, um beizutreten und Videos zu synchronisieren.</span>
                                        </p>
                                    `;
                                }
                            } else {
                                actions.innerHTML = `
                                    <div class="joining-spinner" style="text-align:center; padding: 1rem;">
                                        <div class="join-spinner"></div>
                                        <div style="font-weight: 600; color: var(--accent);">
                                            <span lang="en">Joining room automatically...</span><span lang="de">Raum wird automatisch betreten...</span>
                                        </div>
                                        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                                            <span lang="en">Your extension is taking care of it.</span><span lang="de">Deine Erweiterung kümmert sich darum.</span>
                                        </p>
                                    </div>
                                `;
                                
                                // AUTO-TRIGGER JOIN
                                setTimeout(() => {
                                    window.dispatchEvent(new CustomEvent('KOALASYNC_JOIN_REQUEST', {
                                        detail: { 
                                            roomId, 
                                            password,
                                            useCustomServer: serverFlag === '1',
                                            serverUrl: serverUrl
                                        }
                                    }));
                                }, 500);
                            }
                        }
                    } else {
                        // Fallback banner for index.html
                        if (!document.getElementById('koala-banner')) {
                            const banner = document.createElement('div');
                            banner.className = 'invite-banner';
                            banner.id = 'koala-banner';

                            const container = document.createElement('div');
                            container.className = 'container';
                            container.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';

                            const inviteSpan = document.createElement('span');
                            inviteSpan.appendChild(document.createTextNode('🎫 Invitation for '));
                            const boldRoom = document.createElement('b');
                            boldRoom.textContent = roomId;
                            inviteSpan.appendChild(boldRoom);
                            inviteSpan.appendChild(document.createTextNode(' detected!'));

                            const joinLink = document.createElement('a');
                            joinLink.href = 'join.html' + window.location.hash;
                            joinLink.className = 'btn-banner';
                            joinLink.textContent = 'OPEN JOIN PAGE';

                            container.appendChild(inviteSpan);
                            container.appendChild(joinLink);
                            banner.appendChild(container);
                            document.body.prepend(banner);
                        }
                    }

                    // Global listener for Join Button
                    document.addEventListener('click', (e) => {
                        if (e.target && e.target.id === 'webJoinBtn') {
                            e.target.textContent = 'JOINING...';
                            e.target.disabled = true;
                            window.dispatchEvent(new CustomEvent('KOALASYNC_JOIN_REQUEST', {
                                detail: { 
                                    roomId, 
                                    password,
                                    useCustomServer: serverFlag === '1',
                                    serverUrl: serverUrl
                                }
                            }));
                        }
                    });
                }
            }
        }, 600); // 600ms delay to ensure bridge.js has set the dataset
    };

    // Listen for status from Extension
    window.addEventListener('KOALASYNC_STATUS', (e) => {
        const { success, message } = e.detail;
        const isJoinPage = window.location.pathname.includes('join.html');
        
        if (isJoinPage) {
            const icon = document.getElementById('join-status-icon');
            const title = document.getElementById('join-title');
            const actions = document.getElementById('join-actions');
            const desc = document.getElementById('join-desc');
            const ring = document.getElementById('status-ring');

            if (success) {
                if (ring) ring.classList.remove('active-pulse');
                if (icon) {
                    icon.textContent = '✅';
                    icon.style.transform = 'scale(1.2)';
                }
                const isDE = document.documentElement.classList.contains('lang-de');
                title.textContent = isDE ? 'Erfolgreich!' : 'Success!';
                desc.innerHTML = isDE
                    ? 'Verbunden! <br><span style="color:var(--accent); font-weight:bold;">Wähle jetzt einen Video-Tab in der Erweiterung aus.</span>'
                    : 'Connected! <br><span style="color:var(--accent); font-weight:bold;">Now select a video tab in the extension.</span>';
                
                let count = 3;
                const updateCountdown = () => {
                    if (count <= 0) {
                        window.close();
                        desc.textContent = isDE ? 'Beitritt erfolgreich! Du kannst diesen Tab jetzt manuell schließen.' : 'Joined successfully! You can close this tab manually.';
                    } else {
                        count--;
                        setTimeout(updateCountdown, 1000);
                    }
                };
                setTimeout(updateCountdown, 1000);
                
                const closeLabel = isDE ? 'TAB JETZT SCHLIESSEN' : 'CLOSE TAB NOW';
                actions.innerHTML = `
                    <div class="join-card-actions">
                        <button class="btn btn-success" onclick="window.close()">${closeLabel}</button>
                    </div>
                `;
            } else {
                if (ring) ring.classList.remove('active-pulse');
                if (icon) {
                    icon.textContent = '❌';
                    icon.style.transform = 'scale(1.2)';
                }
                const isDE = document.documentElement.classList.contains('lang-de');
                title.textContent = isDE ? 'Fehler' : 'Error';
                desc.textContent = isDE ? `Beitritt fehlgeschlagen: ${message}` : `Join failed: ${message}`;
                const retryLabel = isDE ? 'ERNEUT VERSUCHEN' : 'TRY AGAIN';
                actions.innerHTML = `
                    <div class="join-card-actions">
                        <button class="btn btn-primary" onclick="location.reload()">${retryLabel}</button>
                    </div>
                `;
            }
        } else {
            const banner = document.getElementById('koala-banner');
            if (banner) {
                if (success) {
                    banner.style.background = 'var(--success)';
                    banner.innerHTML = '<div class="container">✅ Joined! This tab will close in 2s...</div>';
                    setTimeout(() => window.close(), 2000);
                } else {
                    banner.style.background = 'var(--error)';
                    banner.innerHTML = '';
                    const errDiv = document.createElement('div');
                    errDiv.className = 'container';
                    errDiv.textContent = '❌ Error: ' + message;
                    banner.appendChild(errDiv);
                }
            }
        }
    });

    const updateDynamicVersion = async () => {
        try {
            const response = await fetch('version.json');
            if (!response.ok) return;
            const data = await response.json();
            const { version, date } = data;
            if (!version || !date) return;

            const releaseDate = new Date(date);
            const now = new Date();
            const diffMs = now - releaseDate;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor(diffMs / (1000 * 60));

            let relativeTimeEn = '';
            let relativeTimeDe = '';

            if (diffDays > 0) {
                relativeTimeEn = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
                relativeTimeDe = `vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
            } else if (diffHours > 0) {
                relativeTimeEn = `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
                relativeTimeDe = `vor ${diffHours} ${diffHours === 1 ? 'Stunde' : 'Stunden'}`;
            } else if (diffMins > 0) {
                relativeTimeEn = `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
                relativeTimeDe = `vor ${diffMins} ${diffMins === 1 ? 'Minute' : 'Minuten'}`;
            } else {
                relativeTimeEn = 'just now';
                relativeTimeDe = 'gerade eben';
            }

            const badgeEn = document.querySelector('.version-text-en');
            const badgeDe = document.querySelector('.version-text-de');

            if (badgeEn) {
                badgeEn.textContent = `v${version} OUT NOW • ${relativeTimeEn}`;
            }
            if (badgeDe) {
                badgeDe.textContent = `v${version} JETZT VERFÜGBAR • ${relativeTimeDe}`;
            }

            // Update Schema.org structured data dynamically
            const schemaScript = document.getElementById('schema-software');
            if (schemaScript) {
                try {
                    const schema = JSON.parse(schemaScript.textContent);
                    schema.softwareVersion = version;
                    schemaScript.textContent = JSON.stringify(schema, null, 2);
                } catch (err) {
                    console.warn('Failed to dynamically update schema version:', err);
                }
            }
        } catch (e) {
            console.warn('Failed to fetch dynamic version info:', e);
        }
    };

    // Extension Mockup Tab Switcher
    const mockTabs = document.querySelectorAll('.mock-tab');
    const mockScreens = document.querySelectorAll('.mock-screen');
    
    mockTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            mockTabs.forEach(t => t.classList.remove('active'));
            mockScreens.forEach(s => s.classList.remove('active'));
            
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            const targetScreen = document.getElementById(targetId);
            if (targetScreen) {
                targetScreen.classList.add('active');
            }
        });
    });

    // Terminal Tab Switcher
    const termTabBtns = document.querySelectorAll('.terminal-tab-btn');
    const termPanes = document.querySelectorAll('.terminal-pane');
    
    termTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            termTabBtns.forEach(b => b.classList.remove('active'));
            termPanes.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const targetPaneId = btn.getAttribute('data-tab');
            const targetPane = document.getElementById(targetPaneId);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });

    // Terminal Clipboard Copy
    const copyBtn = document.querySelector('.terminal-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const activePane = document.querySelector('.terminal-pane.active');
            if (!activePane) return;
            const codeElement = activePane.querySelector('code');
            if (!codeElement) return;
            
            const textToCopy = codeElement.innerText || codeElement.textContent;
            
            navigator.clipboard.writeText(textToCopy).then(() => {
                const isDE = document.documentElement.classList.contains('lang-de');
                const originalHTML = copyBtn.innerHTML;
                
                copyBtn.innerHTML = isDE ? '✅ Kopiert!' : '✅ Copied!';
                copyBtn.disabled = true;
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    copyBtn.disabled = false;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        });
    }

    // Mobile Hamburger Menu Toggle
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (hamburger && navLinks) {
        // Initialize accessibility attribute
        hamburger.setAttribute('aria-expanded', 'false');
        
        hamburger.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('open');
            hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    }

    // Language Selection Umschalter
    const toggleLanguage = (e) => {
        if (e) e.preventDefault();
        const html = document.documentElement;
        const currentIsEnglish = html.classList.contains('lang-en');
        const newLang = currentIsEnglish ? 'de' : 'en';
        html.classList.remove('lang-en', 'lang-de');
        html.classList.add('lang-' + newLang);
        html.lang = newLang;
        localStorage.setItem('koala_lang', newLang);
        
        // Update titles dynamically based on page
        var path = window.location.pathname;
        var isIndex = path === '/' || path.endsWith('index.html') || path.split('/').pop() === '';
        var isJoin = path.endsWith('join.html');
        
        if (isIndex) {
            const titles = { 
                en: 'KoalaSync | Real-time Video Synchronization for Friends', 
                de: 'KoalaSync | Echtzeit-Video-Synchronisation für Freunde' 
            };
            document.title = titles[newLang] || titles.en;
        } else if (isJoin) {
            const titles = { 
                en: 'Join Room | KoalaSync', 
                de: 'Raum beitreten | KoalaSync' 
            };
            document.title = titles[newLang] || titles.en;
        }
    };

    document.querySelectorAll('.lang-toggle').forEach(btn => {
        btn.addEventListener('click', toggleLanguage);
    });

    // Impressum Email Obfuscation Click Reveal
    document.querySelectorAll('.email-reveal').forEach(el => {
        el.addEventListener('click', function() {
            const user = this.getAttribute('data-user');
            const domain = this.getAttribute('data-domain');
            if (user && domain) {
                this.innerHTML = `${user}@${domain}`;
            }
        });
    });

    // Automated Store/Local Badge Linking based on User-Agent
    const detectBrowserAndElevateBadge = () => {
        const isFirefox = navigator.userAgent.includes('Firefox');
        const isChrome = navigator.userAgent.includes('Chrome') || navigator.userAgent.includes('Chromium');
        const chromeBtns = document.querySelectorAll('.btn-primary');
        const firefoxBtns = document.querySelectorAll('.btn-firefox');

        if (isFirefox && chromeBtns.length > 0 && firefoxBtns.length > 0) {
            // User is on Firefox: Elevate Firefox button to primary, make Chrome secondary
            chromeBtns.forEach(btn => {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            });
            
            firefoxBtns.forEach(btn => {
                // Put Firefox first in visual order
                btn.style.order = '-1';
                
                // Add subtle focus scale effect
                btn.style.transform = 'scale(1.05)';
                btn.addEventListener('mouseleave', () => {
                    btn.style.transform = 'scale(1)';
                });
                btn.addEventListener('mouseenter', () => {
                    btn.style.transform = 'scale(1.05) translateY(-2px)';
                });
            });
        } else if (isChrome && chromeBtns.length > 0 && firefoxBtns.length > 0) {
            // User is on Chrome: Make Firefox secondary
            firefoxBtns.forEach(btn => {
                btn.classList.remove('btn-firefox');
                btn.classList.add('btn-secondary');
                btn.style.color = 'var(--text)';
                btn.style.background = 'var(--card)';
                btn.style.border = '1px solid var(--glass-border)';
                btn.style.boxShadow = 'none';
            });
        }
    };

    detectBrowserAndElevateBadge();
    checkInvite();
    updateDynamicVersion();
});
