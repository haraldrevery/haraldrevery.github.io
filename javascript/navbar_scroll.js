  (function() {
    // Only run this if the browser is Safari/Firefox (no scroll-timeline support)
    if (!CSS.supports('animation-timeline: scroll()')) {
      const nav = document.querySelector('.navi_mechanic');
      
      // Prepare the nav for JS animation
      nav.classList.add('js-animated-nav');

      const updateNav = () => {
        if (window.scrollY > 50) {
          nav.style.transform = 'translateY(0)';
          nav.style.opacity = '1';
        } else {
          nav.style.transform = 'translateY(-110%)';
          nav.style.opacity = '0';
        }
      };

      // Run immediately to set initial state (e.g., if user refreshes while scrolled down)
      updateNav();
      
      window.addEventListener('scroll', updateNav, { passive: true });
    }
  })();