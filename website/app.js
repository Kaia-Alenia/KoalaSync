// KoalaSync Landing Page Logic

document.addEventListener('DOMContentLoaded', () => {
    // Scroll Reveal Logic
    const revealElements = document.querySelectorAll('[data-reveal]');
    
    const revealOnScroll = () => {
        const windowHeight = window.innerHeight;
        revealElements.forEach(el => {
            const elementTop = el.getBoundingClientRect().top;
            const revealPoint = 150;

            if (elementTop < windowHeight - revealPoint) {
                el.classList.add('revealed');
            }
        });
    };

    // Initial check
    revealOnScroll();

    // Scroll listener
    window.addEventListener('scroll', revealOnScroll);

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
                                        <a href="https://addons.mozilla.org/de/firefox/addon/koalasync/" class="primary btn-firefox" style="text-align:center; text-decoration:none; display:block; padding: 1.2rem; border-radius: 12px; font-weight: 700;">GET IT ON MOZILLA ADD-ONS</a>
                                        <a href="https://github.com/shik3i/KoalaSync" style="text-align:center; color:#e66000; text-decoration:underline; font-size:0.85rem; margin-top:0.8rem; display:block; font-weight: 600;">Download via GitHub</a>
                                        <p style="text-align:center; font-size:0.8rem; opacity:0.7; margin-top: 1.2rem; color: var(--text-muted);">
                                            <span lang="en">The extension is required to join and sync videos.</span>
                                            <span lang="de">Die Erweiterung ist erforderlich, um beizutreten und Videos zu synchronisieren.</span>
                                        </p>
                                    `;
                                } else {
                                    actions.innerHTML = `
                                        <a href="#" class="primary" style="text-align:center; text-decoration:none; display:block; padding: 1.2rem; background: var(--accent); color: white; border-radius: 12px; font-weight: 700;">GET IT ON CHROME WEBSTORE</a>
                                        <a href="https://github.com/shik3i/KoalaSync" style="text-align:center; color:var(--accent); text-decoration:underline; font-size:0.85rem; margin-top:0.8rem; display:block; font-weight: 600;">Download via GitHub</a>
                                        <p style="text-align:center; font-size:0.8rem; opacity:0.7; margin-top: 1.2rem; color: var(--text-muted);">
                                            <span lang="en">The extension is required to join and sync videos.</span>
                                            <span lang="de">Die Erweiterung ist erforderlich, um beizutreten und Videos zu synchronisieren.</span>
                                        </p>
                                    `;
                                }
                            } else {
                                actions.innerHTML = `
                                    <div class="joining-spinner" style="text-align:center; padding: 1rem;">
                                        <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">🚀</div>
                                        <div style="font-weight: 600; color: var(--accent);">Joining room automatically...</div>
                                        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Your extension is taking care of it.</p>
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

            if (success) {
                if (icon) icon.textContent = '✅';
                const isDE = document.documentElement.classList.contains('lang-de');
                title.textContent = isDE ? 'Erfolgreich!' : 'Success!';
                
                let count = 3;
                const updateCountdown = () => {
                    const closingMsg = isDE 
                        ? `Du bist dem Raum beigetreten. <br><span style="color:var(--accent); font-weight:bold;">Dieser Tab schließt sich in ${count} Sekunden...</span>`
                        : `You joined the room. <br><span style="color:var(--accent); font-weight:bold;">This tab will close in ${count} seconds...</span>`;
                    desc.innerHTML = closingMsg;
                    if (count <= 0) {
                        window.close();
                        desc.textContent = isDE ? 'Beitritt erfolgreich! Du kannst diesen Tab jetzt manuell schließen.' : 'Joined successfully! You can close this tab manually.';
                    } else {
                        count--;
                        setTimeout(updateCountdown, 1000);
                    }
                };
                updateCountdown();
                
                const closeLabel = isDE ? 'TAB JETZT SCHLIESSEN' : 'CLOSE TAB NOW';
                actions.innerHTML = `<button class="primary" onclick="window.close()" style="background:var(--success); width: 100%;">${closeLabel}</button>`;
            } else {
                if (icon) icon.textContent = '❌';
                const isDE = document.documentElement.classList.contains('lang-de');
                title.textContent = isDE ? 'Fehler' : 'Error';
                desc.textContent = isDE ? `Beitritt fehlgeschlagen: ${message}` : `Join failed: ${message}`;
                const retryLabel = isDE ? 'ERNEUT VERSUCHEN' : 'TRY AGAIN';
                actions.innerHTML = `<button class="primary" onclick="location.reload()" style="width: 100%;">${retryLabel}</button>`;
            }
        } else {
            const banner = document.getElementById('koala-banner');
            if (banner) {
                if (success) {
                    banner.style.background = 'var(--success)';
                    banner.innerHTML = '<div class="container">✅ Joined! This tab will close in 3s...</div>';
                    setTimeout(() => window.close(), 3000);
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
        } catch (e) {
            console.warn('Failed to fetch dynamic version info:', e);
        }
    };

    checkInvite();
    updateDynamicVersion();
});
