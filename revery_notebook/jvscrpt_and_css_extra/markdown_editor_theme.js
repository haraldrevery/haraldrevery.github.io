(function () {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var theme = 'system';
    try {
      var stored = localStorage.getItem('revery_md_settings');
      if (stored) {
        var s = JSON.parse(stored);
        if (s.themeMode) theme = s.themeMode;
      }
    } catch(e) {}

    function applyTheme() {
      // 1. Determine the exact active theme state
      var activeTheme = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      
      // 2. Apply Custom CSS data-theme & native browser scrollbar color scheme
      document.documentElement.setAttribute('data-theme', activeTheme);
      document.documentElement.style.colorScheme = activeTheme;
      
      // 3. Keep Tailwind (or other framework) strictly synced by managing the .dark class
      if (activeTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }

    applyTheme();

    mq.addEventListener('change', function (e) {
      if (theme === 'system') applyTheme();
    });

    // Expose the setter so menus.js can update it live without a refresh
    window.setThemeMode = function(newTheme) {
      theme = newTheme;
      applyTheme();
    };
  })();