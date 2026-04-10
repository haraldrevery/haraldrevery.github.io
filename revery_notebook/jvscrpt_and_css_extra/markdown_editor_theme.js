  (function () {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', function (e) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    });
  })();