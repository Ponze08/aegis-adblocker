// Aegis — applies the theme before first paint (loaded as a classic script
// in <head>). Preference: localStorage 'aegis.theme' = auto | light | dark
(( ) => {
    let pref = 'auto';
    try { pref = localStorage.getItem('aegis.theme') || 'auto'; } catch { }
    const mql = matchMedia('(prefers-color-scheme: dark)');
    const apply = ( ) => {
        const dark = pref === 'dark' || pref === 'auto' && mql.matches;
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mql.addEventListener('change', ( ) => {
        try { pref = localStorage.getItem('aegis.theme') || 'auto'; } catch { }
        apply();
    });
})();
