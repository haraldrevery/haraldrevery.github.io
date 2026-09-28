/* Settings menu on the wallpaper pages (h/wallpaper_*.html)
 *
 * The menu opens without script (it is a <details>) and the QR code and
 * address switches are pure CSS (h/wallpaper_settings.css). This covers the
 * rest:
 *
 * - Theme. Each wallpaper's own script is wired to its old sun/moon toggle
 *   (now hidden) and does what that animation needs on a theme change —
 *   physarum rebuilds its palette, plexus and line restart — so the theme
 *   switch clicks that toggle rather than flipping the class itself.
 * - Presses inside the menu are kept from reaching window, where topography,
 *   halftone and physarum listen for pointerdown to drop a ripple.
 * - A press anywhere else, or Escape, closes the menu.
 *
 * Nothing is remembered: every load starts dark, with the QR code and the
 * address showing (the inputs carry autocomplete="off" so a reload doesn't
 * restore them either).
 */
(() => {
    const menu = document.querySelector('.wallpaper-settings details');
    const oldToggle = document.getElementById('mode-toggle_legacy') || document.getElementById('mode-toggle');

    menu.addEventListener('change', e => {
        if (e.target.name !== 'wallpaper-theme') return;
        const wantDark = e.target.value === 'dark';
        if (wantDark !== document.documentElement.classList.contains('dark')) oldToggle.click();
    });

    menu.addEventListener('pointerdown', e => e.stopPropagation());

    document.addEventListener('pointerdown', e => {
        if (menu.open && !menu.contains(e.target)) menu.open = false;
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !menu.open) return;
        const hadFocus = menu.contains(document.activeElement);
        menu.open = false;
        if (hadFocus) menu.querySelector('summary').focus();
    });
})();
