(function() {
    var html = document.documentElement;
    var path = window.location.pathname;

    // Mapping of browser language codes to KoalaSync locale directories
    var langMap = {
        'de': 'de',
        'fr': 'fr',
        'es': 'es',
        'pt': 'pt-BR',
        'ru': 'ru'
    };

    // Check if we are on the root index page (either "/" or "/index.html" at the root)
    var isRootIndex = path === '/' || path === '/index.html' || path === '';

    if (isRootIndex) {
        var savedLang = localStorage.getItem('koala_lang');
        var browserLang = navigator.language.split('-')[0];
        var preferredLang = savedLang || langMap[browserLang] || 'en';

        if (preferredLang !== 'en') {
            window.location.replace(preferredLang + '/');
            return;
        }
    }

    var htmlClasses = html.className.split(' ');
    var activeLang = null;
    var hasStaticLang = false;
    for (var i = 0; i < htmlClasses.length; i++) {
        if (htmlClasses[i].indexOf('lang-') === 0) {
            hasStaticLang = true;
            var langPart = htmlClasses[i].substring(5);
            activeLang = langPart === 'pt-br' ? 'pt-BR' : langPart;
            break;
        }
    }

    if (hasStaticLang) {
        localStorage.setItem('koala_lang', activeLang);
    } else {
        var savedLang = localStorage.getItem('koala_lang');
        var browserLang = navigator.language.split('-')[0];
        activeLang = savedLang || langMap[browserLang] || 'en';

        // Dynamic utility pages currently only support English and German markup.
        // Fallback to English for any other language to avoid bilingual text duplication.
        if (activeLang !== 'de') {
            activeLang = 'en';
        }

        html.classList.add('lang-' + activeLang);
        html.lang = activeLang;
    }

    // Update titles dynamically based on page
    var isIndex = path === '/' || path.endsWith('index.html') || path.split('/').pop() === '';
    var isJoin = path.includes('join');

    if (isIndex) {
        var titles = {
            en: 'KoalaSync | Real-time Video Synchronization for Friends',
            de: 'KoalaSync | Echtzeit-Video-Synchronisation für Freunde'
        };
        document.title = titles[activeLang] || titles.en;
    } else if (isJoin) {
        var titles = {
            en: 'Join Room | KoalaSync',
            de: 'Raum beitreten | KoalaSync'
        };
        document.title = titles[activeLang] || titles.en;
    }
})();
