/* Performance constants */
const TWO_PI = Math.PI * 2;
const SPEED_BOOST_RADIUS_SQ = 62500;
const SPEED_BOOST_RADIUS = 250; // Precomputed Math.sqrt(62500)

/* 24-Hour Stability Safeguards */
class AnimationHealthMonitor {
    constructor() {
        this.startTime = Date.now();
        this.frameCount = 0;
        this.lastFrameTime = Date.now();
        this.fpsHistory = [];
        this.memoryCheckInterval = null;
        this.autoRestartInterval = null;
        this.MAX_SEGMENT_TOTAL = 50000; // Global segment cap
        this.HEALTH_CHECK_INTERVAL = 30000; // Check every 30 seconds
        this.AUTO_RESTART_INTERVAL = 60 * 60 * 1000; // Restart every hour
        this.LOW_FPS_THRESHOLD = 20;
        this.LOW_FPS_DURATION = 5000; // 5 seconds of low FPS triggers optimization
        this.lowFpsStartTime = null;
        
        this.init();
    }
    
    init() {
        // Periodic health checks
        this.memoryCheckInterval = setInterval(() => this.healthCheck(), this.HEALTH_CHECK_INTERVAL);
        
        // Auto-restart every 4 hours for memory cleanup
        this.autoRestartInterval = setInterval(() => this.safeRestart(), this.AUTO_RESTART_INTERVAL);
        
        // Visibility API - pause when tab hidden to save resources
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });
    }
    
    trackFrame() {
        this.frameCount++;
        const now = Date.now();
        const delta = now - this.lastFrameTime;
        
        if (delta > 0) {
            const fps = 1000 / delta;
            this.fpsHistory.push(fps);
            
            // Keep only last 60 frames
            if (this.fpsHistory.length > 60) {
                this.fpsHistory.shift();
            }
            
            // Check for sustained low FPS
            const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
            if (avgFps < this.LOW_FPS_THRESHOLD) {
                if (!this.lowFpsStartTime) {
                    this.lowFpsStartTime = now;
                } else if (now - this.lowFpsStartTime > this.LOW_FPS_DURATION) {
                    this.optimizePerformance();
                    this.lowFpsStartTime = null;
                }
            } else {
                this.lowFpsStartTime = null;
            }
        }
        
        this.lastFrameTime = now;
    }
    
    healthCheck() {
        // Check total segments across all trails
        if (window.allTrails) {
            const totalSegments = window.allTrails.reduce((sum, trail) => sum + trail.segments.length, 0);
            
            if (totalSegments > this.MAX_SEGMENT_TOTAL) {
                console.warn('Segment limit reached, optimizing...');
                this.optimizeTrails();
            }
        }
        
        // Memory check (if available)
        if (performance.memory) {
            const memoryUsage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
            if (memoryUsage > 0.9) {
                console.warn('High memory usage detected, initiating cleanup...');
                this.safeRestart();
            }
        }
    }
    
    optimizeTrails() {
        if (!window.allTrails) return;
        
        // Reduce segment lengths for trails that are too long
        window.allTrails.forEach(trail => {
            if (trail.segments.length > trail.maxLength * 1.2) {
                trail.segments = trail.segments.slice(0, trail.maxLength);
            }
        });
    }
    
    optimizePerformance() {
        // Reduce trail count slightly if performance is suffering
        if (window.allTrails && window.allTrails.length > 100) {
            const removeCount = Math.floor(window.allTrails.length * 0.1);
            window.allTrails.splice(-removeCount);
            console.log(`Performance optimization: reduced trails by ${removeCount}`);
        }
    }
    
    safeRestart() {
        console.log('Performing scheduled restart for memory cleanup...');
        
        // Clear all trails
        if (window.allTrails) {
            window.allTrails.length = 0;
        }
        
        // Restart animations
        if (window.restartPlexus) restartPlexus();
        if (window.restartLogoAnimations) restartLogoAnimations();
        if (window.bgTrails) {
            window.bgTrails.trails.length = 0;
            window.bgTrails.startTime = Date.now();
        }
        
        // Reset stats
        this.frameCount = 0;
        this.fpsHistory = [];
    }
    
    pause() {
        // Animations will naturally pause when requestAnimationFrame stops being called
        // This is handled by visibility API automatically
    }
    
    resume() {
        // Reset timers to prevent jumps
        this.lastFrameTime = Date.now();
    }
    
    destroy() {
        if (this.memoryCheckInterval) clearInterval(this.memoryCheckInterval);
        if (this.autoRestartInterval) clearInterval(this.autoRestartInterval);
    }
}

// Initialize health monitor
window.healthMonitor = new AnimationHealthMonitor();
window.allTrails = []; // Global trail registry for monitoring

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
    
    // Clean up before restart to prevent memory accumulation
    if (window.allTrails) {
        window.allTrails.length = 0;
    }
    
    // Restart animations on mode change
    setTimeout(() => {
        if (window.restartPlexus) restartPlexus();
        if (window.restartLogoAnimations) restartLogoAnimations();
        if (window.bgTrails) {
            window.bgTrails.trails.length = 0;
            window.bgTrails.startTime = Date.now();
        }
    }, 50);
});

updateIcon();

/* 3D mouse rotation */
let targetRotateX = 0, targetRotateY = 0;
let currentRotateX = 0, currentRotateY = 0;
const logoSvg = document.getElementById('main-logo-svg_legacy');

// Throttle mousemove for rotation (60fps max)
let lastRotateUpdate = 0;
document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastRotateUpdate < 16) return; // ~60fps
    lastRotateUpdate = now;
    
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

// Throttle global mouse tracking (60fps max)
let lastMouseUpdate = 0;
document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastMouseUpdate < 16) return; // ~60fps
    lastMouseUpdate = now;
    
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
        
        // Precompute opacity classes
        this.opacityClasses = [0.25, 0.50, 0.75, 1.0];
        
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
        
        this.alpha = this.opacityClasses[Math.floor(Math.random() * this.opacityClasses.length)];
        
        // Precompute line width based on alpha
        this.lineWidth = this.alpha > 0.8 ? this.thicknessConfig.thick : this.thicknessConfig.thin;
    }
    update(mx, my) {
        const dx = mx - this.x;
        const dy = my - this.y;
        const dSq = dx * dx + dy * dy;

        if (dSq < SPEED_BOOST_RADIUS_SQ) {
            const boost = (1 - Math.sqrt(dSq) / SPEED_BOOST_RADIUS) * 5.5;
            this.currentSpeed += (this.baseSpeed + boost - this.currentSpeed) * 0.1;
        } else {
            this.currentSpeed += (this.baseSpeed - this.currentSpeed) * 0.05;
        }

        this.angle += this.va;
        if (Math.random() < 0.01) this.va = (Math.random() - 0.5) * 0.08;
        
        this.x += Math.cos(this.angle) * this.currentSpeed;
        this.y += Math.sin(this.angle) * this.currentSpeed;

        this.segments.unshift({x: this.x, y: this.y});
        
        // Enforce max length with safety margin
        while (this.segments.length > this.maxLength) {
            this.segments.pop();
        }

        // Simplified wrapping logic
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
        ctx.lineWidth = this.lineWidth; // Use precomputed value
        
        ctx.moveTo(this.segments[0].x, this.segments[0].y);
        
        // Optimized loop
        const len = this.segments.length;
        for (let i = 1; i < len; i++) {
            const p1 = this.segments[i-1];
            const p2 = this.segments[i];
            
            // Check for wrapping discontinuity
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            if (dx * dx + dy * dy > 90000) { // 300^2 = 90000
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
    if (plexusRequestId) {
        cancelAnimationFrame(plexusRequestId);
        plexusRequestId = null;
    }
    
    const canvas = document.getElementById('plexus-canvas_legacy');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true }); // Performance hints
    const width = 1000, height = 1100;
    
    const trailCount = window.innerWidth < 768 ? 100 : 529;
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
        thick: 1.5,
        thin: 0.9
    };
    
    // Cache color strings and mouse position
    let cachedRgb = '';
    let cachedIsDark = html.classList.contains('dark');
    cachedRgb = cachedIsDark ? "255, 255, 255" : "0, 0, 0";
    
    let lastFrameTime = Date.now();
    const MAX_DELTA = 100; // Prevent huge jumps if tab was inactive

    function animate() {
        // Frame limiter - skip if tab is hidden
        if (document.hidden) {
            plexusRequestId = requestAnimationFrame(animate);
            return;
        }
        
        const now = Date.now();
        const delta = Math.min(now - lastFrameTime, MAX_DELTA);
        lastFrameTime = now;
        
        // Track frame for health monitoring
        if (window.healthMonitor) window.healthMonitor.trackFrame();
        
        ctx.clearRect(0, 0, width, height);
        
        const progress = Math.min((Date.now() - startTime) / initiationDuration, 1);
        const currentTarget = Math.floor(progress * trailCount);
        
        while (trails.length < currentTarget) {
            const newTrail = new Trail(width, height, svgLengthConfig, svgThicknessConfig);
            trails.push(newTrail);
            window.allTrails.push(newTrail); // Register globally for monitoring
        }

        // Check if dark mode changed (less frequent check)
        const isDark = html.classList.contains('dark');
        if (isDark !== cachedIsDark) {
            cachedIsDark = isDark;
            cachedRgb = isDark ? "255, 255, 255" : "0, 0, 0";
        }
        
        const mx = globalMouseX + width / 2;
        const my = globalMouseY + height / 2;

        const len = trails.length;
        for (let i = 0; i < len; i++) {
            trails[i].update(mx, my);
            trails[i].draw(ctx, cachedRgb, progress);
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
        
        this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: true }); // Performance hints
        this.trails = [];
        this.startTime = Date.now();
        this.animationId = null;
        this.lastFrameTime = Date.now();
        this.MAX_DELTA = 100; // Prevent huge jumps
        
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
        
        // Cache color string
        this.cachedIsDark = html.classList.contains('dark');
        this.cachedRgb = this.cachedIsDark ? "255, 255, 255" : "0, 0, 0";
        
        this.init();
    }

    init() {
        const isMobile = window.innerWidth < 768;
        this.config.trailCount = isMobile ? 21 : 250;

        this.handleResize();
        
        // Debounce resize handler
        let resizeTimeout;
        const resizeHandler = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.handleResize(), 150);
        };
        
        window.addEventListener('resize', resizeHandler);
        
        // Store handler for cleanup
        this.resizeHandler = resizeHandler;

        this.animate();
    }

    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Reset trails on significant resize to prevent visual glitches
        if (this.trails.length > 0) {
            this.trails.forEach(trail => {
                trail.width = this.canvas.width;
                trail.height = this.canvas.height;
            });
        }
    }

    animate() {
        // Skip frame if tab is hidden
        if (document.hidden) {
            this.animationId = requestAnimationFrame(() => this.animate());
            return;
        }
        
        const now = Date.now();
        const delta = Math.min(now - this.lastFrameTime, this.MAX_DELTA);
        this.lastFrameTime = now;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const progress = Math.min((Date.now() - this.startTime) / this.config.initiationDuration, 1);
        const currentTarget = Math.floor(progress * this.config.trailCount);
        
        while (this.trails.length < currentTarget) {
            const newTrail = new Trail(this.canvas.width, this.canvas.height, this.backgroundLengthConfig, this.backgroundThicknessConfig);
            this.trails.push(newTrail);
            window.allTrails.push(newTrail); // Register globally for monitoring
        }

        // Check if dark mode changed (less frequent check)
        const isDark = html.classList.contains('dark');
        if (isDark !== this.cachedIsDark) {
            this.cachedIsDark = isDark;
            this.cachedRgb = isDark ? "255, 255, 255" : "0, 0, 0";
        }
        
        const mx = globalMouseX + this.canvas.width / 2;
        const my = globalMouseY + this.canvas.height / 2;

        const len = this.trails.length;
        for (let i = 0; i < len; i++) {
            this.trails[i].update(mx, my);
            this.trails[i].draw(this.ctx, this.cachedRgb, progress);
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        this.trails = [];
    }
}

/* Initialize all animations */
window.addEventListener('load', () => {
    try {
        window.bgTrails = new BackgroundTrails();
        setTimeout(() => {
            try {
                restartPlexus();
            } catch (e) {
                console.error('Error starting plexus animation:', e);
            }
        }, 150);
        setTimeout(() => {
            try {
                restartLogoAnimations();
            } catch (e) {
                console.error('Error starting logo animations:', e);
            }
        }, 1);
    } catch (e) {
        console.error('Error initializing animations:', e);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.healthMonitor) {
        window.healthMonitor.destroy();
    }
    if (window.bgTrails) {
        window.bgTrails.destroy();
    }
    if (plexusRequestId) {
        cancelAnimationFrame(plexusRequestId);
    }
});