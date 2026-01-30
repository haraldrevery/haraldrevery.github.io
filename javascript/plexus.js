        /* Performance constants */
        const TWO_PI = Math.PI * 2;
        const MOUSE_INFLUENCE_DIST_SQ = 62500;

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
                if (window.bgPlexus) window.bgPlexus.startTime = Date.now();
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
                logoSvg.style.transform = `translateX(-9.81%) rotateX(${currentRotateX}deg) rotateY(${currentRotateY}deg) translateZ(50px)`;
                const shadowColor = html.classList.contains('dark') ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.3)';
                logoSvg.style.filter = `drop-shadow(${currentRotateY * 0.5}px ${currentRotateX * 0.5}px 20px ${shadowColor})`;
            }
            requestAnimationFrame(smoothRotate);
        }
        smoothRotate();

        /* Logo Plexus Animation */
        let plexusRequestId;

        window.restartPlexus = function() {
            if (plexusRequestId) cancelAnimationFrame(plexusRequestId);
            
            const canvas = document.getElementById('plexus-canvas_legacy');
            const svg = document.getElementById('main-logo-svg_legacy');
            if (!canvas || !svg) return;
            
            const ctx = canvas.getContext('2d');
            const width = 1000, height = 1100;
            
            const isDark = html.classList.contains('dark');
            const rgb = isDark ? "255, 255, 255" : "26, 26, 26";
            
            const isMobile = window.innerWidth < 768;
            const targetParticleCount = isMobile ? 96 : 575;
            const connectionDistance = isMobile ? 250 : 140;
            const connDistSq = connectionDistance * connectionDistance;

            const cellSize = connectionDistance;
            const cols = Math.ceil(width / cellSize);
            const rows = Math.ceil(height / cellSize);
            
            const posX = new Float32Array(targetParticleCount);
            const posY = new Float32Array(targetParticleCount);
            const velX = new Float32Array(targetParticleCount);
            const velY = new Float32Array(targetParticleCount);
            const ids = new Int16Array(targetParticleCount);

            let currentParticleCount = 0;
            const startTime = Date.now();
            
            function createParticle(i) {
                posX[i] = Math.random() * width;
                posY[i] = Math.random() * height;
                velX[i] = (Math.random() - 0.5) * 0.8;
                velY[i] = (Math.random() - 0.5) * 0.8;
                ids[i] = i;
            }
            
            function animate() {
                ctx.clearRect(0, 0, width, height);
                
                const progress = Math.min((Date.now() - startTime) / 3000, 1);
                const targetThisFrame = Math.floor(progress * targetParticleCount);
                
                while (currentParticleCount < targetThisFrame) {
                    createParticle(currentParticleCount);
                    currentParticleCount++;
                }

                const grid = Array.from({ length: cols * rows }, () => []);
                
                ctx.fillStyle = `rgba(${rgb}, 0.8)`;
                
                for (let i = 0; i < currentParticleCount; i++) {
                    posX[i] += velX[i];
                    posY[i] += velY[i];
                    if (posX[i] < 0 || posX[i] > width) velX[i] *= -1;
                    if (posY[i] < 0 || posY[i] > height) velY[i] *= -1;
                    
                    ctx.fillRect((posX[i] - 1) | 0, (posY[i] - 1) | 0, 2, 2);

                    const c = Math.floor(posX[i] / cellSize);
                    const r = Math.floor(posY[i] / cellSize);
                    if (c >= 0 && c < cols && r >= 0 && r < rows) {
                        grid[c + r * cols].push(i);
                    }
                }
                
                const bins = Array.from({ length: 11 }, () => new Path2D());
                
                for (let i = 0; i < currentParticleCount; i++) {
                    const x1 = posX[i], y1 = posY[i];
                    const c = Math.floor(x1 / cellSize);
                    const r = Math.floor(y1 / cellSize);
                    const id1 = ids[i];

                    for (let ox = -1; ox <= 1; ox++) {
                        for (let oy = -1; oy <= 1; oy++) {
                            const nc = c + ox, nr = r + oy;
                            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                                const cellParticles = grid[nc + nr * cols];
                                for (let k = 0; k < cellParticles.length; k++) {
                                    const idx2 = cellParticles[k];
                                    const id2 = ids[idx2];
                                    
                                    if (id1 >= id2) continue;

                                    const dx = x1 - posX[idx2], dy = y1 - posY[idx2];
                                    const distSq = dx * dx + dy * dy;

                                    if (distSq < connDistSq) {
                                        const dist = Math.sqrt(distSq);
                                        const alphaBin = Math.floor((1 - dist / connectionDistance) * 10);
                                        if (alphaBin >= 0 && alphaBin <= 10) {
                                            bins[alphaBin].moveTo(x1 | 0, y1 | 0);
                                            bins[alphaBin].lineTo(posX[idx2] | 0, posY[idx2] | 0);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                ctx.lineWidth = 0.8;
                for (let b = 0; b <= 10; b++) {
                    const alpha = (b / 10) * 0.82;  // <--- Change 0.8 to a different multiplier for changing opacity of the lines
                    if (alpha > 0.01) {
                        ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
                        ctx.stroke(bins[b]);
                    }
                }
                
                plexusRequestId = requestAnimationFrame(animate);
            }
            
            animate();
        };

        /* Restart logo animations */
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
                path.style.animation = 'logoDraw_legacy 5s cubic-bezier(.75,.03,.46,.46) forwards';
            });
            
            waves.forEach((wave, index) => {
                setTimeout(() => {
                    wave.style.animation = 'implodingWave_legacy 3.5s cubic-bezier(0.19, 1, 0.22, 1) forwards';
                }, index * 100);
            });
        };

        /* Background Plexus Animation */
        class BackgroundPlexus {
            constructor() {
                this.canvas = document.getElementById('background-plexus-canvas_legacy');
                if (!this.canvas) return;
                
                this.ctx = this.canvas.getContext('2d');
                this.particles = [];
                this.startTime = Date.now();
                this.config = {
                    particleCount: 0,
                    lineDistance: 0,
                    particleSize: 1.59,
                    baseSpeed: 0.4,
                    lineOpacity: 0.2
                };
                this.mouse = { x: -9999, y: -9999 };
                this.cols = 0;
                this.rows = 0;
                
                this.init();
            }

            init() {
                const isMobile = window.innerWidth < 768;
                this.config.particleCount = isMobile ? 96 : 296;
                this.config.lineDistance = isMobile ? 140 : 160;

                this.handleResize();
                
                window.addEventListener('resize', () => this.handleResize());
                window.addEventListener('mousemove', (e) => {
                    this.mouse.x = e.clientX;
                    this.mouse.y = e.clientY;
                });

                this.animate();
            }

            handleResize() {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
                
                const isMobile = window.innerWidth < 768;
                this.config.particleCount = isMobile ? 21 : 296;
                this.config.lineDistance = isMobile ? 250 : 290;
                
                this.cols = Math.ceil(this.canvas.width / this.config.lineDistance);
                this.rows = Math.ceil(this.canvas.height / this.config.lineDistance);
            }

            createParticle(id) {
                return {
                    id: id,
                    x: Math.random() * this.canvas.width,
                    y: Math.random() * this.canvas.height,
                    vx: (Math.random() - 0.5) * this.config.baseSpeed,
                    vy: (Math.random() - 0.5) * this.config.baseSpeed
                };
            }

            animate() {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                const progress = Math.min((Date.now() - this.startTime) / 3000, 1);
                const currentTarget = Math.floor(progress * this.config.particleCount);

                while (this.particles.length < currentTarget) {
                    this.particles.push(this.createParticle(this.particles.length));
                }

                const isDark = html.classList.contains('dark');
                const color = isDark ? '255, 255, 255' : '0, 0, 0';
                this.ctx.fillStyle = `rgba(${color}, 0.4)`;
                
                const grid = Array.from({ length: this.cols * this.rows }, () => []);

                this.particles.forEach((p) => {
                    const dxMouse = p.x - this.mouse.x;
                    const dyMouse = p.y - this.mouse.y;
                    const distSqMouse = dxMouse * dxMouse + dyMouse * dyMouse;
                    const speedMult = distSqMouse < MOUSE_INFLUENCE_DIST_SQ ? 1.96 : 1.0;

                    p.x += p.vx * speedMult; 
                    p.y += p.vy * speedMult;

                    if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
                    if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

                    this.ctx.beginPath();
                    this.ctx.arc(p.x | 0, p.y | 0, this.config.particleSize, 0, TWO_PI);
                    this.ctx.fill();

                    const c = Math.floor(p.x / this.config.lineDistance);
                    const r = Math.floor(p.y / this.config.lineDistance);
                    if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
                        grid[c + r * this.cols].push(p);
                    }
                });

                const bins = Array.from({ length: 11 }, () => new Path2D());
                const connDistSq = this.config.lineDistance * this.config.lineDistance;

                this.particles.forEach(p1 => {
                    const c = Math.floor(p1.x / this.config.lineDistance);
                    const r = Math.floor(p1.y / this.config.lineDistance);

                    for (let ox = -1; ox <= 1; ox++) {
                        for (let oy = -1; oy <= 1; oy++) {
                            const nc = c + ox, nr = r + oy;
                            if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                                const neighbors = grid[nc + nr * this.cols];
                                for (let k = 0; k < neighbors.length; k++) {
                                    const p2 = neighbors[k];
                                    
                                    if (p1.id >= p2.id) continue;

                                    const dx = p1.x - p2.x;
                                    const dy = p1.y - p2.y;
                                    const dSq = dx * dx + dy * dy;

                                    if (dSq < connDistSq) {
                                        const dist = Math.sqrt(dSq);
                                        const binIdx = Math.floor((1 - dist / this.config.lineDistance) * 10);
                                        if (binIdx >= 0 && binIdx <= 10) {
                                            bins[binIdx].moveTo(p1.x | 0, p1.y | 0);
                                            bins[binIdx].lineTo(p2.x | 0, p2.y | 0);
                                        }
                                    }
                                }
                            }
                        }
                    }
                });

                for (let b = 0; b <= 10; b++) {
                    const alpha = (b / 10) * this.config.lineOpacity;
                    if (alpha > 0.01) {
                        this.ctx.lineWidth = (b / 10) * 1.5;
                        this.ctx.strokeStyle = `rgba(${color}, ${alpha})`;
                        this.ctx.stroke(bins[b]);
                    }
                }

                requestAnimationFrame(() => this.animate());
            }
        }

        /* Initialize all animations */
        window.addEventListener('load', () => {
            window.bgPlexus = new BackgroundPlexus();
            setTimeout(() => restartPlexus(), 150);
            setTimeout(() => restartLogoAnimations(), 1);
        });
 