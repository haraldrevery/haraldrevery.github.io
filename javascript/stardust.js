const canvas = document.getElementById('sand-canvas');
const ctx = canvas.getContext('2d');
const toggle = document.getElementById('mode-toggle');
const icon = document.getElementById('mode-icon');
const svg = document.getElementById('svg-source');

let particles = [];
let ambientParticles = [];
const particleCount = 8000;
const ambientCount = 5000;
const mouse = { x: -1000, y: -1000, active: false, lastMove: Date.now() };
let width, height, centerX, centerY;
let perspective = 750;

// Lifecycle constants
const CYCLE_DURATION = 25000; // 25 seconds
const DISPERSE_START = 15000; 
const RECONSTRUCT_START = 21000;

// Bounds for top-to-bottom erosion
const LOGO_TOP = -350; 
const LOGO_BOTTOM = 350;

// Performance optimizations
let isDark = document.documentElement.classList.contains('dark');
let frameCount = 0;
const BOID_UPDATE_INTERVAL = 2; // Update boids every 2 frames
const SORT_INTERVAL = 60; // Sort depth every 60 frames (1 second at 60fps)

// Spatial partitioning grid for boid optimization
const GRID_SIZE = 150;
let spatialGrid = new Map();

toggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    isDark = document.documentElement.classList.contains('dark');
    icon.textContent = isDark ? '☀' : '🌙';
});

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    centerX = width / 2;
    centerY = height / 2;
}

function getLogoPoints() {
    const points = [];
    const paths = svg.querySelectorAll('path');
    const samplesPerPath = Math.floor(particleCount / paths.length);
    
    paths.forEach(path => {
        const len = path.getTotalLength();
        
        // Get points along the path outline
        for(let i = 0; i < samplesPerPath * 0.3; i++) {
            const pt = path.getPointAtLength(Math.random() * len);
            const spread = 6;
            points.push({
                x: (pt.x - 500) * 0.7 + (Math.random() - 0.5) * spread - 70, // Shifted 4% left
                y: (pt.y - 550) * 0.7 + (Math.random() - 0.5) * spread,
                z: (Math.random() - 0.5) * 50
            });
        }
        
        // Fill interior with additional points
        const bbox = path.getBBox();
        const fillSamples = samplesPerPath * 0.7;
        let generated = 0;
        let attempts = 0;
        const maxAttempts = fillSamples * 5;
        
        while(generated < fillSamples && attempts < maxAttempts) {
            attempts++;
            const x = bbox.x + Math.random() * bbox.width;
            const y = bbox.y + Math.random() * bbox.height;
            
            // Use a temporary point for hit testing
            const pt = svg.createSVGPoint();
            pt.x = x;
            pt.y = y;
            
            // Check if point is inside the path using isPointInFill
            if (path.isPointInFill && path.isPointInFill(pt)) {
                const spread = 4;
                points.push({
                    x: (x - 500) * 0.7 + (Math.random() - 0.5) * spread - 70, // Shifted 4% left
                    y: (y - 550) * 0.7 + (Math.random() - 0.5) * spread,
                    z: (Math.random() - 0.5) * 50
                });
                generated++;
            }
        }
    });
    
    return points;
}

class Grain {
    constructor(target) {
        this.homeX = target.x;
        this.homeY = target.y;
        this.homeZ = target.z;
        this.x = (Math.random() - 0.5) * width;
        this.y = (Math.random() - 0.5) * height;
        this.z = (Math.random() - 0.5) * 1000;
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.friction = 0.94;
        this.baseSpring = 0.02 + Math.random() * 0.03;
        this.size = Math.random() * 1.5 + 0.4;
        this.noiseOffset = Math.random() * 100;
        
        // Properties for sand-blown reconstruction
        this.reconstructStartX = -600 - Math.random() * 400;
        this.reconstructStartY = this.homeY + (Math.random() - 0.5) * 300;
        this.reconstructVelocity = 3 + Math.random() * 2;
        this.hasStartedReconstruct = false;
        this.reconstructDelay = Math.random() * 2000;
        this.isSettled = false;
        
        // Pre-calculate twinkle phase
        this.twinklePhase = Math.random() * Math.PI * 2;
        
        // Turbulence properties (20% of particles have slow lava lamp-like movement)
        this.isTurbulent = Math.random() < 0.2;
        this.turbulenceOffsetX = Math.random() * 1000;
        this.turbulenceOffsetY = Math.random() * 1000;
        this.turbulenceOffsetZ = Math.random() * 1000;
        this.turbulenceSpeed = 0.0002 + Math.random() * 0.0001; // Very slow
        this.turbulenceRadius = 15 + Math.random() * 25; // Drift radius
    }

    update(phase, progress, windX, windY, cycleTime) {
        let springMult = 1;
        let activeWindX = windX;
        let activeWindY = windY;

        if (phase === 'DISPERSE') {
            this.isSettled = false;
            const erosionThreshold = LOGO_TOP + (progress * (LOGO_BOTTOM - LOGO_TOP + 100));
            
            if (this.homeY < erosionThreshold) {
                springMult = 0.001;
                activeWindX += 4 + Math.sin(this.noiseOffset) * 2;
                activeWindY += 1.5 + Math.cos(this.noiseOffset) * 1;
                this.friction = 0.98;
            }
        } else if (phase === 'RECONSTRUCT') {
            const reconstructProgress = cycleTime - RECONSTRUCT_START;
            
            if (!this.hasStartedReconstruct && reconstructProgress > this.reconstructDelay) {
                this.hasStartedReconstruct = true;
                this.isSettled = false;
                this.x = this.reconstructStartX;
                this.y = this.reconstructStartY;
                this.z = (Math.random() - 0.5) * 100;
                this.vx = this.reconstructVelocity + Math.random() * 2;
                this.vy = (Math.random() - 0.5) * 0.5;
            }
            
            if (this.hasStartedReconstruct) {
                const dx = this.homeX - this.x;
                const dy = this.homeY - this.y;
                const distSq = dx*dx + dy*dy;
                
                if (distSq > 2500) { // dist > 50
                    activeWindX += 0.5 + Math.sin(Date.now() * 0.003 + this.noiseOffset) * 0.3;
                    activeWindY += Math.sin(Date.now() * 0.004 + this.noiseOffset) * 0.2;
                    springMult = 0.15;
                    this.friction = 0.96;
                } else if (!this.isSettled) {
                    springMult = 1.5;
                    this.friction = 0.85;
                    
                    const speedSq = this.vx*this.vx + this.vy*this.vy;
                    if (speedSq < 0.25 && distSq < 100) { // speed < 0.5, dist < 10
                        this.isSettled = true;
                    }
                } else {
                    springMult = 3.0;
                    this.friction = 0.82;
                }
            } else {
                springMult = 0.001;
                this.friction = 0.98;
            }
        } else {
            if (!this.isSettled) {
                this.hasStartedReconstruct = false;
                this.isSettled = true;
            }
        }

        // Apply turbulence to home position for turbulent particles
        let targetX = this.homeX;
        let targetY = this.homeY;
        let targetZ = this.homeZ;
        
        if (this.isTurbulent) {
            // Create slow, smooth turbulence using multiple sine waves (lava lamp effect)
            const time = Date.now();
            const t = time * this.turbulenceSpeed;
            
            // Calculate turbulence offset
            const turbX = Math.sin(t + this.turbulenceOffsetX) * this.turbulenceRadius * 0.7 +
                          Math.sin(t * 0.7 + this.turbulenceOffsetX * 0.3) * this.turbulenceRadius * 0.3;
            
            const turbY = Math.cos(t + this.turbulenceOffsetY) * this.turbulenceRadius * 0.7 +
                          Math.cos(t * 0.8 + this.turbulenceOffsetY * 0.5) * this.turbulenceRadius * 0.3;
            
            const turbZ = Math.sin(t * 0.9 + this.turbulenceOffsetZ) * this.turbulenceRadius * 0.5 +
                          Math.cos(t * 0.6 + this.turbulenceOffsetZ * 0.7) * this.turbulenceRadius * 0.3;
            
            // Apply turbulence in stable phase, but fade it out during disperse
            if (phase === 'STABLE' && this.isSettled) {
                targetX += turbX;
                targetY += turbY;
                targetZ += turbZ;
            } else if (phase === 'DISPERSE') {
                // Fade out turbulence smoothly at start of disperse to prevent "suck in"
                const fadeOut = Math.max(0, 1 - progress * 3); // Quick fade in first 33% of disperse
                targetX += turbX * fadeOut;
                targetY += turbY * fadeOut;
                targetZ += turbZ * fadeOut;
            }
        }

        let dx = targetX - this.x;
        let dy = targetY - this.y;
        let dz = targetZ - this.z;

        this.vx += dx * (this.baseSpring * springMult);
        this.vy += dy * (this.baseSpring * springMult);
        this.vz += dz * (this.baseSpring * springMult);

        this.vx += activeWindX;
        this.vy += activeWindY;

        if (mouse.active) {
            const mdx = this.x - (mouse.x - centerX);
            const mdy = this.y - (mouse.y - centerY);
            const distSq = mdx*mdx + mdy*mdy;
            if (distSq < 16900) {
                const force = (130 - Math.sqrt(distSq)) / 130;
                this.vx += mdx * force * 0.8;
                this.vy += mdy * force * 0.8;
            }
        }

        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vz *= this.friction;

        this.x += this.vx;
        this.y += this.vy;
        this.z += this.vz;
    }

    draw(time) {
        const scale = perspective / (perspective + this.z);
        const px = this.x * scale + centerX;
        const py = this.y * scale + centerY;

        if (px < 0 || px > width || py < 0 || py > height) return;

        // Use pre-calculated twinkle phase with time offset
        const twinkle = (Math.sin(time * 0.01 + this.twinklePhase) + 1) * 0.2;
        const opacity = Math.min(1, Math.max(0.1, (scale * 0.7) + twinkle));
        
        ctx.fillStyle = isDark ? `rgba(255,255,255,${opacity})` : `rgba(26,26,26,${opacity})`;
        ctx.fillRect(px, py, this.size * scale, this.size * scale);
    }
}

// Spatial grid functions for boid optimization
function getGridKey(x, y) {
    const gx = Math.floor((x + width * 0.75) / GRID_SIZE);
    const gy = Math.floor((y + height * 0.75) / GRID_SIZE);
    return `${gx},${gy}`;
}

function updateSpatialGrid() {
    spatialGrid.clear();
    ambientParticles.forEach(particle => {
        const key = getGridKey(particle.x, particle.y);
        if (!spatialGrid.has(key)) {
            spatialGrid.set(key, []);
        }
        spatialGrid.get(key).push(particle);
    });
}

function getNearbyParticles(particle) {
    const neighbors = [];
    const gx = Math.floor((particle.x + width * 0.75) / GRID_SIZE);
    const gy = Math.floor((particle.y + height * 0.75) / GRID_SIZE);
    
    // Check 3x3 grid around particle
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const key = `${gx + dx},${gy + dy}`;
            const cellParticles = spatialGrid.get(key);
            if (cellParticles) {
                neighbors.push(...cellParticles);
            }
        }
    }
    return neighbors;
}

class AmbientParticle {
    constructor() {
        this.x = (Math.random() - 0.5) * width * 1.5;
        this.y = (Math.random() - 0.5) * height * 1.5;
        this.z = (Math.random() - 0.5) * 800;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.vz = (Math.random() - 0.5) * 0.2;
        this.size = Math.random() * 1.2 + 0.3;
        this.noiseOffset = Math.random() * 1000;
        this.personalSpace = 80 + Math.random() * 30;
        this.alignmentStrength = 0.04;
        this.cohesionStrength = 0.002; // Reduced from 0.01 to prevent large clusters
        this.separationStrength = 0.12; // Increased from 0.08 to keep particles more spread out
        this.twinklePhase = Math.random() * Math.PI * 2;
    }

    updateBoid(neighbors, time) {
        // Boid behaviors
        let separationX = 0, separationY = 0, separationZ = 0;
        let alignmentX = 0, alignmentY = 0, alignmentZ = 0;
        let cohesionX = 0, cohesionY = 0, cohesionZ = 0;
        let closeNeighbors = 0;
        let totalNeighbors = 0;

        // Use spatial grid neighbors instead of all particles
        for (let i = 0; i < neighbors.length; i++) {
            const other = neighbors[i];
            if (other === this) continue;
            
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dz = other.z - this.z;
            const distSq = dx*dx + dy*dy + dz*dz;

            // Separation - avoid crowding
            if (distSq < this.personalSpace * this.personalSpace && distSq > 0) {
                const dist = Math.sqrt(distSq);
                const force = (this.personalSpace - dist) / this.personalSpace;
                separationX -= (dx / dist) * force;
                separationY -= (dy / dist) * force;
                separationZ -= (dz / dist) * force;
                closeNeighbors++;
            }

            // Alignment and Cohesion - only for nearby particles
            if (distSq < 10000) { // dist < 100 (reduced from 150 to keep clusters smaller)
                alignmentX += other.vx;
                alignmentY += other.vy;
                alignmentZ += other.vz;
                
                cohesionX += other.x;
                cohesionY += other.y;
                cohesionZ += other.z;
                totalNeighbors++;
            }
        }

        // Apply separation
        if (closeNeighbors > 0) {
            this.vx += separationX * this.separationStrength;
            this.vy += separationY * this.separationStrength;
            this.vz += separationZ * this.separationStrength;
        }

        // Add repulsion if too many neighbors (prevents large clusters)
        if (totalNeighbors > 8) {
            const repulsionFactor = (totalNeighbors - 8) * 0.02;
            this.vx += separationX * repulsionFactor;
            this.vy += separationY * repulsionFactor;
            this.vz += separationZ * repulsionFactor;
        }

        // Apply alignment - steer towards average velocity
        if (totalNeighbors > 0) {
            const invTotal = 1 / totalNeighbors;
            alignmentX *= invTotal;
            alignmentY *= invTotal;
            alignmentZ *= invTotal;
            
            this.vx += (alignmentX - this.vx) * this.alignmentStrength;
            this.vy += (alignmentY - this.vy) * this.alignmentStrength;
            this.vz += (alignmentZ - this.vz) * this.alignmentStrength;

            // Apply cohesion - steer towards center of mass
            cohesionX *= invTotal;
            cohesionY *= invTotal;
            cohesionZ *= invTotal;
            
            this.vx += (cohesionX - this.x) * this.cohesionStrength;
            this.vy += (cohesionY - this.y) * this.cohesionStrength;
            this.vz += (cohesionZ - this.z) * this.cohesionStrength;
        }

        // Gentle drifting wind with perlin-like noise
        const windX = Math.sin(time * 0.0003 + this.noiseOffset * 0.01) * 0.05;
        const windY = Math.cos(time * 0.0002 + this.noiseOffset * 0.015) * 0.03;
        const windZ = Math.sin(time * 0.00025 + this.noiseOffset * 0.012) * 0.02;

        this.vx += windX;
        this.vy += windY;
        this.vz += windZ;

        // Limit speed using squared comparison first
        const speedSq = this.vx*this.vx + this.vy*this.vy + this.vz*this.vz;
        const maxSpeedSq = 2.25; // 1.5^2
        if (speedSq > maxSpeedSq) {
            const speed = Math.sqrt(speedSq);
            const maxSpeed = 1.5;
            const scale = maxSpeed / speed;
            this.vx *= scale;
            this.vy *= scale;
            this.vz *= scale;
        }

        // Apply friction
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.vz *= 0.98;

        // Update position
        this.x += this.vx;
        this.y += this.vy;
        this.z += this.vz;

        // Wrap around edges
        const margin = width * 0.75;
        if (this.x < -margin) this.x = margin;
        if (this.x > margin) this.x = -margin;
        if (this.y < -margin) this.y = margin;
        if (this.y > margin) this.y = -margin;
        if (this.z < -400) this.z = 400;
        if (this.z > 400) this.z = -400;
    }

    draw(time) {
        const scale = perspective / (perspective + this.z);
        const px = this.x * scale + centerX;
        const py = this.y * scale + centerY;

        if (px < -100 || px > width + 100 || py < -100 || py > height + 100) return;

        const twinkle = (Math.sin(time * 0.008 + this.twinklePhase) + 1) * 0.15;
        const opacity = Math.min(0.4, Math.max(0.05, (scale * 0.3) + twinkle));
        
        ctx.fillStyle = isDark ? `rgba(255,255,255,${opacity})` : `rgba(26,26,26,${opacity})`;
        ctx.fillRect(px, py, this.size * scale, this.size * scale);
    }
}

function animate() {
    ctx.clearRect(0, 0, width, height);
    
    const now = Date.now() % CYCLE_DURATION;
    const time = Date.now();
    let phase = 'STABLE';
    let progress = 0;

    if (now > DISPERSE_START && now < RECONSTRUCT_START) {
        phase = 'DISPERSE';
        progress = (now - DISPERSE_START) / (RECONSTRUCT_START - DISPERSE_START);
    } else if (now >= RECONSTRUCT_START) {
        phase = 'RECONSTRUCT';
    }

    const windX = Math.sin(time * 0.001) * 0.1;
    const windY = Math.cos(time * 0.0008) * 0.05;

    // Update spatial grid periodically for boid optimization
    if (frameCount % BOID_UPDATE_INTERVAL === 0) {
        updateSpatialGrid();
        
        // Update ambient particles with boid behavior using spatial grid
        ambientParticles.forEach(p => {
            const neighbors = getNearbyParticles(p);
            p.updateBoid(neighbors, time);
        });
    } else {
        // Just update positions on non-boid frames
        ambientParticles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;
            
            // Wrap around edges
            const margin = width * 0.75;
            if (p.x < -margin) p.x = margin;
            if (p.x > margin) p.x = -margin;
            if (p.y < -margin) p.y = margin;
            if (p.y > margin) p.y = -margin;
            if (p.z < -400) p.z = 400;
            if (p.z > 400) p.z = -400;
        });
    }

    // Depth sort less frequently
    if (frameCount % SORT_INTERVAL === 0) {
        particles.sort((a, b) => b.z - a.z);
        ambientParticles.sort((a, b) => b.z - a.z);
    }

    // Draw ambient particles first (background)
    for (let i = 0; i < ambientParticles.length; i++) {
        ambientParticles[i].draw(time);
    }

    // Draw logo particles
    for (let i = 0; i < particles.length; i++) {
        particles[i].update(phase, progress, windX, windY, now);
        particles[i].draw(time);
    }

    frameCount++;
    requestAnimationFrame(animate);
}

function setup() {
    resize();
    const targets = getLogoPoints();
    particles = targets.map(t => new Grain(t));
    
    // Create ambient background particles
    for (let i = 0; i < ambientCount; i++) {
        ambientParticles.push(new AmbientParticle());
    }
    
    // Initialize spatial grid
    updateSpatialGrid();
    
    window.addEventListener('resize', resize);
    
    // Throttle mouse events
    let mouseMoveTimeout;
    window.addEventListener('mousemove', e => {
        if (!mouseMoveTimeout) {
            mouseMoveTimeout = setTimeout(() => {
                mouse.x = e.clientX;
                mouse.y = e.clientY;
                mouse.active = true;
                mouseMoveTimeout = null;
            }, 16); // ~60fps
        }
    });
    
    animate();
}

setup();
