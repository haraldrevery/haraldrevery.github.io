/* Performance constants */
const TWO_PI = Math.PI * 2;
const SPEED_BOOST_RADIUS_SQ = 62500;

/* Dark Mode Toggle */
const html = document.documentElement;
const modeToggle = document.getElementById('mode-toggle_legacy');
const modeIcon = document.getElementById('mode-icon_legacy');

function updateIcon() {
    modeIcon.textContent = html.classList.contains('dark') ? '☀' : '🌙';
}

modeToggle.addEventListener('click', () => {
    html.classList.toggle('dark');
    updateIcon();
    
    // Restart animations on mode change
    setTimeout(() => {
        if (window.restartPlexus) restartPlexus();
        if (window.restartLogoAnimations) restartLogoAnimations();
        if (window.bgTrails) window.bgTrails.startTime = Date.now();
    }, 50);
});

updateIcon();

/* 3D mouse rotation */
let targetRotateX = 0, targetRotateY = 0;
let currentRotateX = 0, currentRotateY = 0;
const logoSvg = document.getElementById('main-logo-svg_legacy');

document.addEventListener('mousemove', (e) => {
    targetRotateY = ((e.clientX / window.innerWidth) - 0.5) * 40;
    targetRotateX = ((e.clientY / window.innerHeight) - 0.5) * -40;
});

document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget && !e.toElement) {
        targetRotateY = 0;
        targetRotateX = 0;
    }
});

function smoothRotate() {
    if (logoSvg) {
        currentRotateX += (targetRotateX - currentRotateX) * 0.29;
        currentRotateY += (targetRotateY - currentRotateY) * 0.29;
        logoSvg.style.transform = `translateX(-9.81%) rotateX(${currentRotateX.toFixed(2)}deg) rotateY(${currentRotateY.toFixed(2)}deg) translateZ(50px)`;
        const shadowAlpha = document.documentElement.classList.contains('dark') ? 0.1 : 0.3;
        logoSvg.style.filter = `drop-shadow(${(currentRotateY * 0.5).toFixed(1)}px ${(currentRotateX * 0.5).toFixed(1)}px 20px rgba(0,0,0,${shadowAlpha}))`;
    }
    requestAnimationFrame(smoothRotate);
}
smoothRotate();

/* MAIN ANIMATION: Trails (Lines) */
let plexusRequestId;
let globalMouseX = 0, globalMouseY = 0;

document.addEventListener('mousemove', (e) => {
  globalMouseX = (e.clientX - window.innerWidth / 2);
  globalMouseY = (e.clientY - window.innerHeight / 2);
});

class Trail {
    constructor(width, height, lengthConfig = null, thicknessConfig = null) {
        this.width = width;
        this.height = height;
        this.lengthConfig = lengthConfig || {
            long: { min: 1400, max: 1800, probability: 0.10 },
            medium: { min: 500, max: 700, probability: 0.25 },
            short: { min: 170, max: 270 }
        };
        this.thicknessConfig = thicknessConfig || {
            thick: 1.3,
            thin: 0.8
        };
        this.reset();
    }
    reset() {
        this.x = Math.random() * this.width;
        this.y = Math.random() * this.height;
        this.segments = []; 
        
        const rand = Math.random();
        const config = this.lengthConfig;
        
        if (rand < config.long.probability) {
            this.maxLength = Math.floor(Math.random() * (config.long.max - config.long.min)) + config.long.min; 
        } else if (rand < config.medium.probability) {
            this.maxLength = Math.floor(Math.random() * (config.medium.max - config.medium.min)) + config.medium.min;
        } else {
            this.maxLength = Math.floor(Math.random() * (config.short.max - config.short.min)) + config.short.min;
        }
        
        this.baseSpeed = Math.random() < 0.4 ? (Math.random() * 0.4 + 0.3) : (Math.random() * 1.6 + 0.8);
        this.currentSpeed = this.baseSpeed;
        this.angle = Math.random() * TWO_PI;
        this.va = (Math.random() - 0.5) * 0.05; 
        
        const opacityClasses = [0.25, 0.50, 0.75, 1.0];
        this.alpha = opacityClasses[Math.floor(Math.random() * opacityClasses.length)];
    }
    update(mx, my) {
        const dx = mx - this.x;
        const dy = my - this.y;
        const dSq = dx * dx + dy * dy;

        if (dSq < SPEED_BOOST_RADIUS_SQ) {
            const boost = (1 - Math.sqrt(dSq) / 250) * 5.5;
            this.currentSpeed += (this.baseSpeed + boost - this.currentSpeed) * 0.1;
        } else {
            this.currentSpeed += (this.baseSpeed - this.currentSpeed) * 0.05;
        }

        this.angle += this.va;
        if (Math.random() < 0.01) this.va = (Math.random() - 0.5) * 0.08;
        
        this.x += Math.cos(this.angle) * this.currentSpeed;
        this.y += Math.sin(this.angle) * this.currentSpeed;

        this.segments.unshift({x: this.x, y: this.y});
        if (this.segments.length > this.maxLength) this.segments.pop();

        if (this.x < -600) this.x = this.width + 550;
        else if (this.x > this.width + 600) this.x = -550;
        if (this.y < -600) this.y = this.height + 550;
        else if (this.y > this.height + 600) this.y = -550;
    }
    draw(ctx, rgb, globalProgress) {
        if (this.segments.length < 2) return;
        
        ctx.beginPath();
        const currentAlpha = this.alpha * globalProgress;
        ctx.strokeStyle = `rgba(${rgb}, ${currentAlpha})`;
        ctx.lineWidth = this.alpha > 0.8 ? this.thicknessConfig.thick : this.thicknessConfig.thin;
        
        ctx.moveTo(this.segments[0].x, this.segments[0].y);
        
        for (let i = 1; i < this.segments.length; i++) {
            const p1 = this.segments[i-1];
            const p2 = this.segments[i];
            if (Math.abs(p1.x - p2.x) > 300 || Math.abs(p1.y - p2.y) > 300) {
               ctx.stroke();
               ctx.beginPath();
               ctx.moveTo(p2.x, p2.y);
               continue;
            }
            ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
    }
}

window.restartPlexus = function() {
    if (plexusRequestId) cancelAnimationFrame(plexusRequestId);
    
    const canvas = document.getElementById('plexus-canvas_legacy');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = 1000, height = 1100;
    
    const trailCount = window.innerWidth < 768 ? 100 : 496;
    const trails = [];
    const startTime = Date.now();
    const initiationDuration = 3600; 

    // Custom length configuration for SVG (logo) lines
    const svgLengthConfig = {
        long: { min: 1400, max: 2196, probability: 0.10 },
        medium: { min: 500, max: 960, probability: 0.25 },
        short: { min: 170, max: 270 }
    };

    // Custom thickness configuration for SVG (logo) lines
    const svgThicknessConfig = {
        thick: 1.6,
        thin: 1.0
    };

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        const progress = Math.min((Date.now() - startTime) / initiationDuration, 1);
        const currentTarget = Math.floor(progress * trailCount);
        
        while (trails.length < currentTarget) {
            trails.push(new Trail(width, height, svgLengthConfig, svgThicknessConfig));
        }

        const isDark = html.classList.contains('dark');
        const rgb = isDark ? "255, 255, 255" : "0, 0, 0";
        const mx = globalMouseX + width / 2;
        const my = globalMouseY + height / 2;

        for (let i = 0; i < trails.length; i++) {
            trails[i].update(mx, my);
            trails[i].draw(ctx, rgb, progress);
        }

        plexusRequestId = requestAnimationFrame(animate);
    }
    animate();
};

/* LOGO EFFECTS: Wave & Stroke Reset */
window.restartLogoAnimations = function() {
  const logoGroup = document.querySelector('#logo-shape-definition_legacy.animate-logo_legacy');
  const waves = document.querySelectorAll('.wave-echo_legacy');
  if (!logoGroup) return;

  const logoPaths = logoGroup.querySelectorAll('path');
  
  logoPaths.forEach(path => {
    path.style.animation = 'none';
    path.style.strokeDashoffset = '4000';
    path.style.fillOpacity = '0';
  });
  
  waves.forEach(wave => {
    wave.style.animation = 'none';
    wave.style.transform = 'scale(5)'; 
    wave.style.opacity = '0';
    wave.style.strokeWidth = '0.5px';
  });
  
  void logoGroup.offsetWidth;
  
  logoPaths.forEach(path => {
    path.style.animation = 'logoDraw_legacy 6s cubic-bezier(.75,.03,.46,.46) forwards';
  });
  
  waves.forEach((wave, index) => {
    setTimeout(() => {
      wave.style.animation = 'implodingWave_legacy 3.5s cubic-bezier(0.19, 1, 0.22, 1) forwards';
    }, index * 144);
  });
};

/* Background Trails Animation */
class BackgroundTrails {
    constructor() {
        this.canvas = document.getElementById('background-plexus-canvas_legacy');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.trails = [];
        this.startTime = Date.now();
        this.config = {
            trailCount: 0,
            initiationDuration: 3600
        };
        
        // Custom length configuration for background lines
        this.backgroundLengthConfig = {
            long: { min: 800, max: 2996, probability: 0.12 },
            medium: { min: 300, max: 800, probability: 0.40 },
            short: { min: 100, max: 200 }
        };
        
        // Custom thickness configuration for background lines
        this.backgroundThicknessConfig = {
            thick: 0.8,
            thin: 0.5
        };
        
        this.init();
    }

    init() {
        const isMobile = window.innerWidth < 768;
        this.config.trailCount = isMobile ? 21 : 250;

        this.handleResize();
        
        window.addEventListener('resize', () => this.handleResize());

        this.animate();
    }

    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const progress = Math.min((Date.now() - this.startTime) / this.config.initiationDuration, 1);
        const currentTarget = Math.floor(progress * this.config.trailCount);
        
        while (this.trails.length < currentTarget) {
            this.trails.push(new Trail(this.canvas.width, this.canvas.height, this.backgroundLengthConfig, this.backgroundThicknessConfig));
        }

        const isDark = html.classList.contains('dark');
        const rgb = isDark ? "255, 255, 255" : "0, 0, 0";
        const mx = globalMouseX + this.canvas.width / 2;
        const my = globalMouseY + this.canvas.height / 2;

        for (let trail of this.trails) {
            trail.update(mx, my);
            trail.draw(this.ctx, rgb, progress);
        }

        requestAnimationFrame(() => this.animate());
    }
}

/* Initialize all animations */
window.addEventListener('load', () => {
    window.bgTrails = new BackgroundTrails();
    setTimeout(() => restartPlexus(), 150);
    setTimeout(() => restartLogoAnimations(), 1);
});