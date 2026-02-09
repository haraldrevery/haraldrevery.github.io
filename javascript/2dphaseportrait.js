    const app = {
        canvas: null,
        ctx: null,
        // NEW: Canvases for time series plots
        canvasXvsT: null,
        ctxXvsT: null,
        canvasYvsT: null,
        ctxYvsT: null,
        trajectories: [],
        params: [1, 1, 1, 1, 1],
        integrator: 'euler', // NEW: Track current integrator
        jacobianPoint: null, // NEW: Track point where Jacobian was calculated
        
        init() {
            this.canvas = document.getElementById('phase-portrait');
            this.ctx = this.canvas.getContext('2d');
            
            // NEW: Initialize time series canvases
            this.canvasXvsT = document.getElementById('x-vs-t-plot');
            this.ctxXvsT = this.canvasXvsT.getContext('2d');
            this.canvasYvsT = document.getElementById('y-vs-t-plot');
            this.ctxYvsT = this.canvasYvsT.getContext('2d');
            
            this.setupParamSliders();
            this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
            
            // Add event listeners for equations to auto-clear analysis
            document.getElementById('x-dot').addEventListener('input', () => this.autoClearAnalysis());
            document.getElementById('y-dot').addEventListener('input', () => this.autoClearAnalysis());
            this.plot();
        },
        
        // NEW: Set integrator method
        setIntegrator(method) {
            this.integrator = method;
            
            // Update button states
            document.getElementById('euler-btn').classList.toggle('active', method === 'euler');
            document.getElementById('rk4-btn').classList.toggle('active', method === 'rk4');
        },
        
        loadPreset(name) {
            const presets = {
                'limit-cycle': {
                    xDot: '-a*y - b*x*(x^2 + y^2 - 1)',
                    yDot: 'a*x - b*y*(x^2 + y^2 - 1)'
                },
                'saddle': {
                    xDot: 'a*x',
                    yDot: '-b*y'
                },
                'spiral': {
                    xDot: '-a*x - b*y',
                    yDot: 'b*x - a*y'
                },
                'pendulum': {
                    xDot: 'a*y',
                    yDot: '-sin(c*x) - 0.1*y/b'
                }
            };
            
            if (presets[name]) {
                document.getElementById('x-dot').value = presets[name].xDot;
                document.getElementById('y-dot').value = presets[name].yDot;
                this.plot();
            }
        },

        calculateStability() {
            // 1. Get values from inputs
            const a = parseFloat(document.getElementById('jac-a').value) || 0;
            const b = parseFloat(document.getElementById('jac-b').value) || 0;
            const c = parseFloat(document.getElementById('jac-c').value) || 0;
            const d = parseFloat(document.getElementById('jac-d').value) || 0;

            const resultDiv = document.getElementById('stability-results');
            
            // 2. Calculate Trace and Determinant
            const trace = a + d;
            const det = a * d - b * c;
            const discriminant = trace * trace - 4 * det;
            
            let html = `<strong>Matrix:</strong> [${a}, ${b}; ${c}, ${d}]<br>`;
            html += `<strong>Trace (τ):</strong> ${trace.toFixed(4)}<br>`;
            html += `<strong>Determinant (Δ):</strong> ${det.toFixed(4)}<br>`;
            html += `<strong>Discriminant:</strong> ${discriminant.toFixed(4)}<br><br>`;
            
            // 3. Calculate Eigenvalues
            if (discriminant >= 0) {
                const lambda1 = (trace + Math.sqrt(discriminant)) / 2;
                const lambda2 = (trace - Math.sqrt(discriminant)) / 2;
                html += `<strong>Eigenvalues:</strong><br>`;
                html += `λ₁ = ${lambda1.toFixed(4)}<br>`;
                html += `λ₂ = ${lambda2.toFixed(4)}<br><br>`;
                
                // Calculate eigenvectors for real eigenvalues
                const calculateEigenvector = (lambda) => {
                    // For eigenvalue λ, solve (A - λI)v = 0
                    const m11 = a - lambda;
                    const m12 = b;
                    const m21 = c;
                    const m22 = d - lambda;
                    
                    // Find non-zero row
                    if (Math.abs(m11) > 1e-10 || Math.abs(m12) > 1e-10) {
                        // Use first row: m11*v1 + m12*v2 = 0
                        if (Math.abs(m12) > 1e-10) {
                            return [-m12, m11];
                        } else {
                            return [0, 1];
                        }
                    } else if (Math.abs(m21) > 1e-10 || Math.abs(m22) > 1e-10) {
                        // Use second row: m21*v1 + m22*v2 = 0
                        if (Math.abs(m22) > 1e-10) {
                            return [m22, -m21];
                        } else {
                            return [0, 1];
                        }
                    }
                    return [1, 0];
                };
                
                const v1 = calculateEigenvector(lambda1);
                const v2 = calculateEigenvector(lambda2);
                
                // Normalize eigenvectors
                const norm1 = Math.sqrt(v1[0]*v1[0] + v1[1]*v1[1]);
                const norm2 = Math.sqrt(v2[0]*v2[0] + v2[1]*v2[1]);
                
                html += `<strong>Eigenvectors:</strong><br>`;
                html += `v₁ = [${(v1[0]/norm1).toFixed(4)}, ${(v1[1]/norm1).toFixed(4)}]<br>`;
                html += `v₂ = [${(v2[0]/norm2).toFixed(4)}, ${(v2[1]/norm2).toFixed(4)}]<br><br>`;
                
                } else {
                    const realPart = trace / 2;
                    const imagPart = Math.sqrt(-discriminant) / 2;
                    html += `<strong>Eigenvalues (Complex):</strong><br>`;
                    html += `λ₁ = ${realPart.toFixed(4)} + ${imagPart.toFixed(4)}i<br>`;
                    html += `λ₂ = ${realPart.toFixed(4)} - ${imagPart.toFixed(4)}i<br><br>`;

                    // NEW: Calculate Complex Eigenvectors
                    // Using the relation (A - λI)v = 0. For row 1: (a - λ)v1 + b*v2 = 0
                    // If we pick v1 = b, then v2 = λ - a
                    if (Math.abs(b) > 1e-10) {
                        const v2_real = realPart - a;
                        const v2_imag = imagPart;
                        
                        html += `<strong>Complex Eigenvector (v₁):</strong><br>`;
                        html += `v₁ = [${b.toFixed(4)}, ${v2_real.toFixed(4)} + ${v2_imag.toFixed(4)}i]<br>`;
                        html += `<small>(Rotation axis determined by real/imag parts)</small><br><br>`;
                    }
                }
            
            // 4. Classify the fixed point
            html += `<strong>Classification:</strong> `;
            if (det < 0) {
                html += 'Saddle Point (unstable)';
            } else if (det > 0) {
                if (discriminant > 0) {
                    if (trace < 0) {
                        html += 'Stable Node';
                    } else if (trace > 0) {
                        html += 'Unstable Node';
                    } else {
                        html += 'Linear Center (non-hyperbolic - check higher-order terms)';
                    }
                } else {
                    if (trace < 0) {
                        html += 'Stable Spiral';
                    } else if (trace > 0) {
                        html += 'Unstable Spiral';
                    } else {
                        html += 'Linear Center (non-hyperbolic - check higher-order terms)';
                    }
                }
            } else {
                html += 'Non-isolated fixed points';
            }
            
            resultDiv.innerHTML = html;
            resultDiv.style.display = 'block';
        },
        
        // NEW: Calculate Jacobian matrix at a point using numerical derivatives
        calculateJacobianAtPoint(x, y) {
            const xDotExpr = document.getElementById('x-dot').value;
            const yDotExpr = document.getElementById('y-dot').value;
            
            if (!xDotExpr || !yDotExpr) {
                alert('Please enter both differential equations first');
                return;
            }
            
            const vectorField = this.createVectorField(xDotExpr, yDotExpr);
            const precision = parseInt(document.getElementById('jacobian-precision').value) || 3;
            
            // Use finite differences to compute Jacobian
            const h = 1e-6; // Small step for numerical derivative
            
            // Get function values at different points
            // vectorField returns [f(x,y), g(x,y)] where f = ẋ and g = ẏ
            const [f_x, g_x] = vectorField(x, y);
            const [f_xph, g_xph] = vectorField(x + h, y);
            const [f_xmh, g_xmh] = vectorField(x - h, y);
            const [f_yph, g_yph] = vectorField(x, y + h);
            const [f_ymh, g_ymh] = vectorField(x, y - h);
            
            // Central difference: f'(x) ≈ (f(x+h) - f(x-h)) / (2h)
            // Jacobian components:
            // ∂f/∂x
            const df_dx = (f_xph - f_xmh) / (2 * h);
            // ∂f/∂y
            const df_dy = (f_yph - f_ymh) / (2 * h);
            // ∂g/∂x
            const dg_dx = (g_xph - g_xmh) / (2 * h);
            // ∂g/∂y
            const dg_dy = (g_yph - g_ymh) / (2 * h);
            
            // safety check to prevent bad numerical results
            if (!isFinite(df_dx) || !isFinite(df_dy) || !isFinite(dg_dx) || !isFinite(dg_dy)) {
                alert("Could not compute Jacobian at this point (possible singularity or numerical overflow).");
                return;
            }     
            // Jacobian matrix J = [[∂f/∂x, ∂f/∂y], [∂g/∂x, ∂g/∂y]]
            const J = [[df_dx, df_dy], [dg_dx, dg_dy]];
            
            // Store point for visualization
            this.jacobianPoint = { x, y };
            
            // Calculate eigenvalues
            const trace = J[0][0] + J[1][1];
            const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
            const discriminant = trace * trace - 4 * det;
            
            // Display results
            this.displayJacobianAnalysis(x, y, J, trace, det, discriminant, precision);
            
            
            // Calculate and display index
            this.calculateIndex(x, y, vectorField, precision);
            // Redraw to show the marker
            this.plot();
        },
        
        // NEW: Display Jacobian analysis results
        displayJacobianAnalysis(x, y, J, trace, det, discriminant, precision) {
            const content = document.getElementById('jacobian-content');
            const display = document.getElementById('jacobian-display');
            
            let html = `<strong>Point:</strong> (${x.toFixed(precision)}, ${y.toFixed(precision)})<br><br>`;
            
            html += `<strong>Jacobian Matrix:</strong><br>`;
            html += `J = [${J[0][0].toFixed(precision)}, ${J[0][1].toFixed(precision)}]<br>`;
            html += `    [${J[1][0].toFixed(precision)}, ${J[1][1].toFixed(precision)}]<br><br>`;
            
            html += `<strong>Trace (τ):</strong> ${trace.toFixed(precision)}<br>`;
            html += `<strong>Determinant (Δ):</strong> ${det.toFixed(precision)}<br>`;
            html += `<strong>Discriminant:</strong> ${discriminant.toFixed(precision)}<br><br>`;
            
            // Calculate and display eigenvalues
            if (discriminant >= 0) {
                const lambda1 = (trace + Math.sqrt(discriminant)) / 2;
                const lambda2 = (trace - Math.sqrt(discriminant)) / 2;
                html += `<strong>Eigenvalues (Real):</strong><br>`;
                html += `λ₁ = ${lambda1.toFixed(precision)}<br>`;
                html += `λ₂ = ${lambda2.toFixed(precision)}<br><br>`;
            } else {
                const realPart = trace / 2;
                const imagPart = Math.sqrt(-discriminant) / 2;
                html += `<strong>Eigenvalues (Complex):</strong><br>`;
                html += `λ₁ = ${realPart.toFixed(precision)} + ${imagPart.toFixed(precision)}i<br>`;
                html += `λ₂ = ${realPart.toFixed(precision)} - ${imagPart.toFixed(precision)}i<br><br>`;
            }
            
            // Classify the stability
            html += `<strong>Classification:</strong> `;
            if (Math.abs(det) < 1e-6) {
                html += 'Degenerate (det ≈ 0)';
            } else if (det < 0) {
                html += 'Saddle Point (unstable)';
            } else if (det > 0) {
                if (discriminant > 0) {
                    if (trace < 0) {
                        html += 'Stable Node';
                    } else if (trace > 0) {
                        html += 'Unstable Node';
                    } else {
                        html += 'Linear Center (non-hyperbolic - check higher-order terms)';
                    }
                } else {
                    if (trace < 0) {
                        html += 'Stable Spiral';
                    } else if (trace > 0) {
                        html += 'Unstable Spiral';
                    } else {
                        html += 'Linear Center (non-hyperbolic - check higher-order terms)';
                    }
                }
            }
            
            content.innerHTML = html;
            display.style.display = 'block';
        },
        
        // NEW: Clear Jacobian analysis display
        clearJacobianAnalysis() {
            this.jacobianPoint = null;
            document.getElementById('jacobian-display').style.display = 'none';
            document.getElementById('index-content').style.display = 'none';
            document.getElementById('index-recalc-button').style.display = 'none';
            this.plot();
        },
        
        // Calculate the index of a closed curve around a point
        calculateIndex(x, y, vectorField, precision) {
            const radius = parseFloat(document.getElementById('index-radius').value) || 0.2; // Distance from the point to integrate around
            const resolution = 1000; // Number of sample points around the circle
            
            // Create a circle of sample points around (x, y)
            const angles = [];
            for (let i = 0; i < resolution; i++) {
                angles.push((2 * Math.PI * i) / resolution);
            }
            
            // Sample the vector field along the circle
            const vectorAngles = [];
            for (let i = 0; i < resolution; i++) {
                const sampleX = x + radius * Math.cos(angles[i]);
                const sampleY = y + radius * Math.sin(angles[i]);
                
                const [vx, vy] = vectorField(sampleX, sampleY);
                
                // Calculate the angle of the vector
                const angle = Math.atan2(vy, vx);
                vectorAngles.push(angle);
            }
            
            // Unwrap the angles to handle 2π jumps
            const unwrappedAngles = [vectorAngles[0]];
            for (let i = 1; i < vectorAngles.length; i++) {
                let diff = vectorAngles[i] - vectorAngles[i - 1];
                
                // Adjust for 2π jumps
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                
                unwrappedAngles.push(unwrappedAngles[i - 1] + diff);
            }
            
            // Calculate total rotation
            const totalRotation = (unwrappedAngles[unwrappedAngles.length - 1] - unwrappedAngles[0]) / (2 * Math.PI);
            const index = Math.round(totalRotation); // Index should be an integer
            
            // Display the index
            this.displayIndex(x, y, radius, totalRotation, index, precision);
        },
        
        // Display index calculation results
        displayIndex(x, y, radius, totalRotation, index, precision) {
            const indexContent = document.getElementById('index-content');
            
            let html = `<strong>Index Theory (Poincaré Index):</strong><br><br>`;
            html += `<strong>Integration Circle:</strong><br>`;
            html += `Center: (${x.toFixed(precision)}, ${y.toFixed(precision)})<br>`;
            html += `Radius: ${radius.toFixed(precision)}<br><br>`;
            html += `<strong>Total Rotation:</strong> ${totalRotation.toFixed(precision)} revolutions<br>`;
            html += `<strong>Index:</strong> ${index}<br><br>`;
            
            // Add interpretation
            html += `<strong>Interpretation:</strong><br>`;
            if (Math.abs(index) < 0.1) {
                html += `No fixed point inside the circle (index ≈ 0)<br>`;
            } else if (index === 1) {
                html += `Typical fixed point: source, sink, or spiral (index = +1)<br>`;
            } else if (index === -1) {
                html += `Saddle point (index = -1)<br>`;
            } else {
                html += `Complex behavior with index = ${index}<br>`;
            }
            
            indexContent.innerHTML = html;
            indexContent.style.display = 'block';
            document.getElementById('index-recalc-button').style.display = 'block';
        },
        
        // Recalculate index with new radius (without needing to click again)
        recalculateIndex() {
            if (!this.jacobianPoint) {
                alert('No point selected. Please click on the phase portrait first.');
                return;
            }
            
            const xDotExpr = document.getElementById('x-dot').value;
            const yDotExpr = document.getElementById('y-dot').value;
            
            if (!xDotExpr || !yDotExpr) {
                alert('Please enter both differential equations first');
                return;
            }
            
            const vectorField = this.createVectorField(xDotExpr, yDotExpr);
            const precision = parseInt(document.getElementById('jacobian-precision').value) || 3;
            
            // Recalculate index at the stored point
            this.calculateIndex(this.jacobianPoint.x, this.jacobianPoint.y, vectorField, precision);
        },
        
        
        
        // Auto-clear analysis when system changes
        autoClearAnalysis() {
            if (this.jacobianPoint !== null) {
                this.jacobianPoint = null;
                document.getElementById('jacobian-display').style.display = 'none';
                document.getElementById('index-content').style.display = 'none';
                document.getElementById('index-recalc-button').style.display = 'none';
            }
        },
        
        
 setupParamSliders() {
    for (let i = 0; i < 5; i++) {
        const minInput = document.getElementById(`param-min-${i}`);
        const maxInput = document.getElementById(`param-max-${i}`);
        const slider = document.getElementById(`param-slider-${i}`);
        const valueDisplay = document.getElementById(`param-value-${i}`);

        if (!minInput || !maxInput || !slider || !valueDisplay) continue;

        // Initialize current value from slider
        this.params[i] = parseFloat(slider.value) || 1.0;
        valueDisplay.textContent = this.params[i].toFixed(2);

        // --- FIX: Enable clicking on the value display ---
        // The CSS has 'pointer-events: none', so we must override it here
        valueDisplay.style.pointerEvents = 'auto'; 
        valueDisplay.style.cursor = 'pointer';
        valueDisplay.title = 'Click to enter custom value';

        // CLICK LISTENER: Handle direct value entry
        valueDisplay.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling issues

            // Create temporary input field
            const inputField = document.createElement('input');
            inputField.type = 'number';
            inputField.step = 'any';
            inputField.value = this.params[i]; // Use raw number, not fixed string
            
            // Style matches the display but as an input
            inputField.style.cssText = `
                position: absolute;
                top: -24px;
                left: 50%;
                transform: translateX(-50%);
                width: 80px;
                padding: 2px 4px;
                font-family: var(--font-mono);
                font-size: 0.75rem;
                font-weight: 600;
                text-align: center;
                border: 1px solid #ccc;
                border-radius: 4px;
                background: white;
                color: black;
                z-index: 100;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;

            // Dark mode support for the input
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                inputField.style.background = '#333';
                inputField.style.color = '#fff';
                inputField.style.border = '1px solid #666';
            }

            // HIDE the text display while editing
            valueDisplay.style.visibility = 'hidden'; 
            valueDisplay.parentElement.appendChild(inputField);
            inputField.focus();
            inputField.select();

            // LOGIC: Validate and update limits
            const commitChange = () => {
                let val = parseFloat(inputField.value);

                if (Number.isFinite(val)) {
                    let currentMin = parseFloat(minInput.value);
                    let currentMax = parseFloat(maxInput.value);

                    // 1. Expand limits if necessary
                    if (val < currentMin) {
                        currentMin = val;
                        minInput.value = val; // Update UI Input
                        slider.min = val;     // Update Slider Attribute
                    }
                    if (val > currentMax) {
                        currentMax = val;
                        maxInput.value = val; // Update UI Input
                        slider.max = val;     // Update Slider Attribute
                    }

                    // 2. Recalculate step to ensure smooth sliding over new range
                    slider.step = (currentMax - currentMin) / 200;

                    // 3. Update the internal state and slider position
                    this.params[i] = val;
                    slider.value = val;
                    valueDisplay.textContent = val.toFixed(2);
                }

                // Cleanup: Remove input, show display, update plot
                if (inputField.parentElement) {
                    inputField.remove();
                }
                valueDisplay.style.visibility = 'visible';
                this.plot();
                this.autoClearAnalysis();
            };

            // Commit on Enter, Cancel on Escape
            inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    commitChange();
                } else if (e.key === 'Escape') {
                    inputField.remove();
                    valueDisplay.style.visibility = 'visible';
                }
            });

            // Commit on clicking away (blur)
            inputField.addEventListener('blur', () => {
                commitChange();
            });
        });

        // --- EXISTING LOGIC: Handle Min/Max input changes ---
        const updateSliderRange = () => {
            let min = parseFloat(minInput.value);
            let max = parseFloat(maxInput.value);

            if (isNaN(min)) min = -10;
            if (isNaN(max)) max = 10;
            
            // Prevent min >= max
            if (min >= max) {
                max = min + 1;
                maxInput.value = max;
            }

            slider.min = min;
            slider.max = max;
            slider.step = (max - min) / 200;

            // Clamp current parameter if it falls outside new range
            let current = this.params[i];
            if (current < min) current = min;
            if (current > max) current = max;

            this.params[i] = current;
            slider.value = current;
            valueDisplay.textContent = current.toFixed(2);
            
            this.plot();
            this.autoClearAnalysis();
        };

        minInput.addEventListener('change', updateSliderRange);
        maxInput.addEventListener('change', updateSliderRange);

        // --- EXISTING LOGIC: Handle Slider drag ---
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.params[i] = val;
            valueDisplay.textContent = val.toFixed(2);
            this.plot();
            this.autoClearAnalysis();
        });
    }
},
        
        createVectorField(xDotExpr, yDotExpr) {
            const [a, b, c, d, q] = this.params;
            
            // Make Math functions available (sin, cos, tan, exp, log, sqrt, abs, etc.)
            const sin = Math.sin;
            const cos = Math.cos;
            const tan = Math.tan;
            const exp = Math.exp;
            const log = Math.log;
            const sqrt = Math.sqrt;
            const abs = Math.abs;
            const arcsin = Math.asin;
            const arccos = Math.acos;
            const arctan = Math.atan;
            const arctan2 = Math.atan2;
            const sinh = Math.sinh;
            const cosh = Math.cosh;
            const tanh = Math.tanh;
            const pow = Math.pow;
            const PI = Math.PI;
            const e = Math.E;
            
            return (x, y) => {
                try {
                    const dx = eval(xDotExpr.replace(/\^/g, '**'));
                    const dy = eval(yDotExpr.replace(/\^/g, '**'));
                    return [dx, dy];
                } catch (e) {
                    return [0, 0];
                }
            };
        },
        
        handleCanvasClick(event) {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            
            const canvasX = (event.clientX - rect.left) * scaleX;
            const canvasY = (event.clientY - rect.top) * scaleY;
            
            const [worldX, worldY] = this.canvasToWorld(canvasX, canvasY);
            
            document.getElementById('traj-x').value = worldX.toFixed(2);
            document.getElementById('traj-y').value = worldY.toFixed(2);
            
            // NEW: Calculate and display Jacobian at clicked point
            this.calculateJacobianAtPoint(worldX, worldY);
        },
        
        worldToCanvas(x, y) {
            const xMin = parseFloat(document.getElementById('x-min').value);
            const xMax = parseFloat(document.getElementById('x-max').value);
            const yMin = parseFloat(document.getElementById('y-min').value);
            const yMax = parseFloat(document.getElementById('y-max').value);
            
            const canvasX = ((x - xMin) / (xMax - xMin)) * this.canvas.width;
            const canvasY = ((yMax - y) / (yMax - yMin)) * this.canvas.height;
            
            return [canvasX, canvasY];
        },
        
        canvasToWorld(canvasX, canvasY) {
            const xMin = parseFloat(document.getElementById('x-min').value);
            const xMax = parseFloat(document.getElementById('x-max').value);
            const yMin = parseFloat(document.getElementById('y-min').value);
            const yMax = parseFloat(document.getElementById('y-max').value);
            
            const x = xMin + (canvasX / this.canvas.width) * (xMax - xMin);
            const y = yMax - (canvasY / this.canvas.height) * (yMax - yMin);
            
            return [x, y];
        },
        
        drawArrow(x, y, dx, dy, color, scale = 1.0) {
            const mag = Math.sqrt(dx * dx + dy * dy);
            if (mag === 0 || !isFinite(mag)) return;
            
            const nx = dx / mag;
            const ny = dy / mag;
            
            const arrowLength = 15 * scale;
            const headLength = 5 * scale;
            
            const [cx, cy] = this.worldToCanvas(x, y);
            const [ex, ey] = [cx + nx * arrowLength, cy - ny * arrowLength];
            
            this.ctx.strokeStyle = color;
            this.ctx.fillStyle = color;
            this.ctx.lineWidth = 1.5;
            
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy);
            this.ctx.lineTo(ex, ey);
            this.ctx.stroke();
            
            const angle = Math.atan2(-ny, nx);
            this.ctx.beginPath();
            this.ctx.moveTo(ex, ey);
            this.ctx.lineTo(
                ex - headLength * Math.cos(angle - Math.PI / 6),
                ey + headLength * Math.sin(angle - Math.PI / 6)
            );
            this.ctx.lineTo(
                ex - headLength * Math.cos(angle + Math.PI / 6),
                ey + headLength * Math.sin(angle + Math.PI / 6)
            );
            this.ctx.closePath();
            this.ctx.fill();
        },
        
        // NEW: Calculate dynamic resolution based on integration time
        calculateTrajectorySteps(tMax) {
            // Goal: Maintain constant density of points (steps per unit time)
            const stepsPerUnitTime = 100; // e.g., 100 calculations per t=1.0
            
            // Calculate required steps
            let steps = Math.ceil(tMax * stepsPerUnitTime);
            
            // Clamp between a safe minimum and a higher maximum for performance
            // 2000 was too low; 10,000 is safe for modern browsers
            return Math.max(200, Math.min(steps, 10000));
        },
        
        // MODIFIED: Now uses selected integrator method
        computeTrajectory(vectorField, x0, y0, tMax, steps) {
            if (this.integrator === 'rk4') {
                return this.computeTrajectoryRK4(vectorField, x0, y0, tMax, steps);
            } else {
                return this.computeTrajectoryEuler(vectorField, x0, y0, tMax, steps);
            }
        },
        
        // Original Euler method
        computeTrajectoryEuler(vectorField, x0, y0, tMax, steps) {
            const dt = tMax / steps;
            const trajectory = [[x0, y0]];
            let x = x0, y = y0;
            
            for (let i = 0; i < steps; i++) {
                const [dx, dy] = vectorField(x, y);
                if (!isFinite(dx) || !isFinite(dy)) break;
                
                x += dx * dt;
                y += dy * dt;
                trajectory.push([x, y]);
            }
            
            return trajectory;
        },
        
        // NEW: 4th-order Runge-Kutta (RK4) method
        computeTrajectoryRK4(vectorField, x0, y0, tMax, steps) {
            const dt = tMax / steps;
            const trajectory = [[x0, y0]];
            let x = x0, y = y0;
            
            for (let i = 0; i < steps; i++) {
                // RK4 coefficients
                const [k1x, k1y] = vectorField(x, y);
                if (!isFinite(k1x) || !isFinite(k1y)) break;
                
                const [k2x, k2y] = vectorField(x + 0.5 * k1x * dt, y + 0.5 * k1y * dt);
                if (!isFinite(k2x) || !isFinite(k2y)) break;
                
                const [k3x, k3y] = vectorField(x + 0.5 * k2x * dt, y + 0.5 * k2y * dt);
                if (!isFinite(k3x) || !isFinite(k3y)) break;
                
                const [k4x, k4y] = vectorField(x + k3x * dt, y + k3y * dt);
                if (!isFinite(k4x) || !isFinite(k4y)) break;
                
                // Update position using weighted average
                x += (dt / 6) * (k1x + 2*k2x + 2*k3x + k4x);
                y += (dt / 6) * (k1y + 2*k2y + 2*k3y + k4y);
                
                trajectory.push([x, y]);
            }
            
            return trajectory;
        },
        
        // NEW: Draw grid with axis labels and numbers
        drawGrid() {
            const xMin = parseFloat(document.getElementById('x-min').value);
            const xMax = parseFloat(document.getElementById('x-max').value);
            const yMin = parseFloat(document.getElementById('y-min').value);
            const yMax = parseFloat(document.getElementById('y-max').value);
            
            // Determine text color based on theme
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const textColor = isDark ? '#e0e0e0' : '#333';
            const gridColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
            const axisColor = isDark ? '#888' : '#333';
            
            // Draw grid lines
            this.ctx.strokeStyle = gridColor;
            this.ctx.lineWidth = 1;
            
            const xStep = (xMax - xMin) / 10;
            for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
                const [cx, cy1] = this.worldToCanvas(x, yMin);
                const [_, cy2] = this.worldToCanvas(x, yMax);
                
                this.ctx.beginPath();
                this.ctx.moveTo(cx, cy1);
                this.ctx.lineTo(cx, cy2);
                this.ctx.stroke();
            }
            
            const yStep = (yMax - yMin) / 10;
            for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
                const [cx1, cy] = this.worldToCanvas(xMin, y);
                const [cx2, _] = this.worldToCanvas(xMax, y);
                
                this.ctx.beginPath();
                this.ctx.moveTo(cx1, cy);
                this.ctx.lineTo(cx2, cy);
                this.ctx.stroke();
            }
            
            // Draw axes (x=0 and y=0)
            this.ctx.strokeStyle = axisColor;
            this.ctx.lineWidth = 2;
            
            if (yMin <= 0 && yMax >= 0) {
                const [cx1, cy] = this.worldToCanvas(xMin, 0);
                const [cx2, _] = this.worldToCanvas(xMax, 0);
                this.ctx.beginPath();
                this.ctx.moveTo(cx1, cy);
                this.ctx.lineTo(cx2, cy);
                this.ctx.stroke();
            }
            
            if (xMin <= 0 && xMax >= 0) {
                const [cx, cy1] = this.worldToCanvas(0, yMin);
                const [_, cy2] = this.worldToCanvas(0, yMax);
                this.ctx.beginPath();
                this.ctx.moveTo(cx, cy1);
                this.ctx.lineTo(cx, cy2);
                this.ctx.stroke();
            }
            
            // NEW: Add axis labels and tick numbers
            this.ctx.fillStyle = textColor;
            this.ctx.font = '12px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            
            // X-axis tick labels
            for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
                if (Math.abs(x) < xStep / 10) continue; // Skip origin
                const [cx, cy] = this.worldToCanvas(x, 0);
                const yOffset = (yMin <= 0 && yMax >= 0) ? cy + 5 : this.canvas.height - 20;
                this.ctx.fillText(x.toFixed(1), cx, yOffset);
            }
            
            // Y-axis tick labels
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
                if (Math.abs(y) < yStep / 10) continue; // Skip origin
                const [cx, cy] = this.worldToCanvas(0, y);
                const xOffset = (xMin <= 0 && xMax >= 0) ? cx - 10 : 10;
                this.ctx.fillText(y.toFixed(1), xOffset, cy);
            }
            
            // NEW: Axis labels (X and Y)
            this.ctx.font = 'bold 14px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            const [xLabelX, xLabelY] = this.worldToCanvas(xMax - (xMax - xMin) * 0.05, 0);
            const yOffsetLabel = (yMin <= 0 && yMax >= 0) ? xLabelY + 25 : this.canvas.height - 10;
            this.ctx.fillText('x', xLabelX, yOffsetLabel);
            
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            const [yLabelX, yLabelY] = this.worldToCanvas(0, yMax - (yMax - yMin) * 0.05);
            const xOffsetLabel = (xMin <= 0 && xMax >= 0) ? yLabelX + 10 : 20;
            this.ctx.fillText('y', xOffsetLabel, yLabelY);
        },
        
        // Draw legend in upper right corner
        drawLegend() {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const textColor = isDark ? '#e0e0e0' : '#333';
            const bgColor = isDark ? 'rgba(26, 26, 26, 0.85)' : 'rgba(255, 255, 255, 0.85)';
            const xNullclineColor = isDark ? '#ff6b6b' : '#e74c3c';
            const yNullclineColor = isDark ? '#4ecdc4' : '#3498db';
            
            const padding = 15;
            const lineLength = 40;
            const lineSpacing = 25;
            const legendX = this.canvas.width - padding - 150;
            const legendY = padding + 10;
            
            // Draw background box
            this.ctx.fillStyle = bgColor;
            this.ctx.fillRect(legendX - 10, legendY - 10, 160, 65);
            this.ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(legendX - 10, legendY - 10, 160, 65);
            
            // Draw x-nullcline legend
            this.ctx.globalAlpha = 0.4;
            this.ctx.strokeStyle = xNullclineColor;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(legendX, legendY);
            this.ctx.lineTo(legendX + lineLength, legendY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            this.ctx.globalAlpha = 1.0;
            this.ctx.fillStyle = textColor;
            this.ctx.font = '13px monospace';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('dx/dt = 0', legendX + lineLength + 10, legendY);
            
            // Draw y-nullcline legend
            this.ctx.globalAlpha = 0.4;
            this.ctx.strokeStyle = yNullclineColor;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(legendX, legendY + lineSpacing);
            this.ctx.lineTo(legendX + lineLength, legendY + lineSpacing);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            this.ctx.globalAlpha = 1.0;
            this.ctx.fillStyle = textColor;
            this.ctx.fillText('dy/dt = 0', legendX + lineLength + 10, legendY + lineSpacing);
        },
        
        // NEW: Plot nullclines (curves where dx/dt = 0 and dy/dt = 0)
        plotNullclines(vectorField) {
            const xMin = parseFloat(document.getElementById('x-min').value);
            const xMax = parseFloat(document.getElementById('x-max').value);
            const yMin = parseFloat(document.getElementById('y-min').value);
            const yMax = parseFloat(document.getElementById('y-max').value);
            
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const xNullclineColor = isDark ? '#ff6b6b' : '#e74c3c';  // Red for x-nullcline
            const yNullclineColor = isDark ? '#4ecdc4' : '#3498db';  // Blue for y-nullcline
            const fixedPointColor = isDark ? '#ffd700' : '#f39c12'; // Gold for fixed points
            
            // Resolution for nullcline detection
            const gridSize = 100;
            const xStep = (xMax - xMin) / gridSize;
            const yStep = (yMax - yMin) / gridSize;
            
            // Create grid of values
            const xDotGrid = [];
            const yDotGrid = [];
            
            for (let i = 0; i <= gridSize; i++) {
                xDotGrid[i] = [];
                yDotGrid[i] = [];
                for (let j = 0; j <= gridSize; j++) {
                    const x = xMin + i * xStep;
                    const y = yMin + j * yStep;
                    const [dx, dy] = vectorField(x, y);
                    xDotGrid[i][j] = isFinite(dx) ? dx : NaN;
                    yDotGrid[i][j] = isFinite(dy) ? dy : NaN;
                }
            }
            
            // Helper function to find zero crossings using marching squares
            const findZeroCrossings = (grid, color) => {
                this.ctx.globalAlpha = 0.4; // Lower opacity for nullclines
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]); // Dotted line
                
                for (let i = 0; i < gridSize; i++) {
                    for (let j = 0; j < gridSize; j++) {
                        const v00 = grid[i][j];
                        const v10 = grid[i + 1][j];
                        const v01 = grid[i][j + 1];
                        const v11 = grid[i + 1][j + 1];
                        
                        if (!isFinite(v00) || !isFinite(v10) || !isFinite(v01) || !isFinite(v11)) continue;
                        
                        // Check for sign changes (zero crossing)
                        const edges = [];
                        
                        // Bottom edge (between v00 and v10)
                        if (v00 * v10 < 0) {
                            const t = v00 / (v00 - v10);
                            const x = xMin + (i + t) * xStep;
                            const y = yMin + j * yStep;
                            edges.push([x, y]);
                        }
                        
                        // Right edge (between v10 and v11)
                        if (v10 * v11 < 0) {
                            const t = v10 / (v10 - v11);
                            const x = xMin + (i + 1) * xStep;
                            const y = yMin + (j + t) * yStep;
                            edges.push([x, y]);
                        }
                        
                        // Top edge (between v01 and v11)
                        if (v01 * v11 < 0) {
                            const t = v01 / (v01 - v11);
                            const x = xMin + (i + t) * xStep;
                            const y = yMin + (j + 1) * yStep;
                            edges.push([x, y]);
                        }
                        
                        // Left edge (between v00 and v01)
                        if (v00 * v01 < 0) {
                            const t = v00 / (v00 - v01);
                            const x = xMin + i * xStep;
                            const y = yMin + (j + t) * yStep;
                            edges.push([x, y]);
                        }
                        
                        // Draw line segments
                        if (edges.length === 2) {
                            const [x1, y1] = edges[0];
                            const [x2, y2] = edges[1];
                            const [cx1, cy1] = this.worldToCanvas(x1, y1);
                            const [cx2, cy2] = this.worldToCanvas(x2, y2);
                            
                            this.ctx.beginPath();
                            this.ctx.moveTo(cx1, cy1);
                            this.ctx.lineTo(cx2, cy2);
                            this.ctx.stroke();
                        }
                    }
                }
                
                this.ctx.setLineDash([]); // Reset to solid line
                this.ctx.globalAlpha = 1.0; // Reset opacity
            };
            
            // Draw x-nullcline (where dx/dt = 0)
            findZeroCrossings(xDotGrid, xNullclineColor);
            
            // Draw y-nullcline (where dy/dt = 0)
            findZeroCrossings(yDotGrid, yNullclineColor);
        },
        
        plot() {
            // NEW: Set canvas background based on theme
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.ctx.fillStyle = isDark ? '#1a1a1a' : 'white';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.drawGrid();
            
            const xDotExpr = document.getElementById('x-dot').value;
            const yDotExpr = document.getElementById('y-dot').value;
            
            if (!xDotExpr || !yDotExpr) {
                console.log('Please enter both equations');
                return;
            }
            
            const vectorField = this.createVectorField(xDotExpr, yDotExpr);
            
            const xMin = parseFloat(document.getElementById('x-min').value);
            const xMax = parseFloat(document.getElementById('x-max').value);
            const yMin = parseFloat(document.getElementById('y-min').value);
            const yMax = parseFloat(document.getElementById('y-max').value);
            const resolution = parseInt(document.getElementById('resolution').value);
            
            const xStep = (xMax - xMin) / resolution;
            const yStep = (yMax - yMin) / resolution;
            
            let maxMag = 0;
            for (let i = 0; i <= resolution; i++) {
                for (let j = 0; j <= resolution; j++) {
                    const x = xMin + i * xStep;
                    const y = yMin + j * yStep;
                    const [dx, dy] = vectorField(x, y);
                    const mag = Math.sqrt(dx * dx + dy * dy);
                    if (isFinite(mag) && mag > maxMag) maxMag = mag;
                }
            }
            
            for (let i = 0; i <= resolution; i++) {
                for (let j = 0; j <= resolution; j++) {
                    const x = xMin + i * xStep;
                    const y = yMin + j * yStep;
                    const [dx, dy] = vectorField(x, y);
                    
                    if (isFinite(dx) && isFinite(dy)) {
                        const mag = Math.sqrt(dx * dx + dy * dy);
                        const normalizedScale = mag / maxMag;
                        
                        const hue = 240 - normalizedScale * 120;
                        const color = `hsl(${hue}, 70%, 50%)`;
                        
                        this.drawArrow(x, y, dx, dy, color, 0.8);
                    }
                }
            }
            
            // NEW: Draw nullclines if enabled
            if (document.getElementById('show-nullclines').checked) {
                this.plotNullclines(vectorField);
                this.drawLegend(); // Draw legend after nullclines
            }
            
            // Draw trajectories with dynamic resolution
            this.trajectories.forEach((traj, idx) => {
                // NEW: Use dynamic resolution based on integration time
                const steps = this.calculateTrajectorySteps(traj.tMax);
                
                const trajectory = this.computeTrajectory(
                    vectorField,
                    traj.x0,
                    traj.y0,
                    traj.tMax,
                    steps
                );
                
                // Store trajectory data for time series plots
                traj.trajectoryData = trajectory;
                traj.steps = steps;
                
                this.ctx.strokeStyle = traj.color;
                this.ctx.lineWidth = 2.5;
                this.ctx.beginPath();
                
                trajectory.forEach(([x, y], i) => {
                    const [cx, cy] = this.worldToCanvas(x, y);
                    if (i === 0) {
                        this.ctx.moveTo(cx, cy);
                    } else {
                        this.ctx.lineTo(cx, cy);
                    }
                });
                
                this.ctx.stroke();
                
                const [cx0, cy0] = this.worldToCanvas(traj.x0, traj.y0);
                this.ctx.fillStyle = traj.color;
                this.ctx.beginPath();
                this.ctx.arc(cx0, cy0, 6, 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.strokeStyle = 'white';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                
                if (trajectory.length > 0) {
                    const [xEnd, yEnd] = trajectory[trajectory.length - 1];
                    const [cxEnd, cyEnd] = this.worldToCanvas(xEnd, yEnd);
                    this.ctx.fillStyle = traj.color;
                    this.ctx.beginPath();
                    this.ctx.moveTo(cxEnd, cyEnd - 8);
                    this.ctx.lineTo(cxEnd - 6, cyEnd + 4);
                    this.ctx.lineTo(cxEnd + 6, cyEnd + 4);
                    this.ctx.closePath();
                    this.ctx.fill();
                    this.ctx.strokeStyle = 'white';
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
            });
            
            // NEW: Plot time series if trajectories exist
            if (this.trajectories.length > 0) {
                this.plotTimeSeries();
            }
        },
        
        // NEW: Plot x(t) and y(t) time series subplots
        plotTimeSeries() {
            const subplotsWrapper = document.getElementById('subplots-wrapper');
            subplotsWrapper.style.display = 'block';
            
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const bgColor = isDark ? '#1a1a1a' : 'white';
            const textColor = isDark ? '#e0e0e0' : '#333';
            const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            
            // Plot x vs t
            this.ctxXvsT.fillStyle = bgColor;
            this.ctxXvsT.fillRect(0, 0, this.canvasXvsT.width, this.canvasXvsT.height);
            this.plotTimeSeriesHelper(this.canvasXvsT, this.ctxXvsT, 'x', textColor, gridColor);
            
            // Plot y vs t
            this.ctxYvsT.fillStyle = bgColor;
            this.ctxYvsT.fillRect(0, 0, this.canvasYvsT.width, this.canvasYvsT.height);
            this.plotTimeSeriesHelper(this.canvasYvsT, this.ctxYvsT, 'y', textColor, gridColor);
        },
        
        // NEW: Helper function to plot individual time series (x or y vs t)
        plotTimeSeriesHelper(canvas, ctx, variable, textColor, gridColor) {
            const width = canvas.width;
            const height = canvas.height;
            const padding = 50;
            
            // Find global min/max for the chosen variable across all trajectories
            let globalMin = Infinity;
            let globalMax = -Infinity;
            let maxTime = 0;
            
            this.trajectories.forEach(traj => {
                const idx = variable === 'x' ? 0 : 1;
                traj.trajectoryData.forEach(point => {
                    const value = point[idx];
                    if (isFinite(value)) {
                        globalMin = Math.min(globalMin, value);
                        globalMax = Math.max(globalMax, value);
                    }
                });
                maxTime = Math.max(maxTime, traj.tMax);
            });
            
            // Add padding to range
            const range = globalMax - globalMin;
            globalMin -= range * 0.1;
            globalMax += range * 0.1;
            
            // Draw grid
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1;
            
            for (let i = 0; i <= 5; i++) {
                const y = padding + (height - 2 * padding) * i / 5;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(width - padding, y);
                ctx.stroke();
                
                const x = padding + (width - 2 * padding) * i / 5;
                ctx.beginPath();
                ctx.moveTo(x, padding);
                ctx.lineTo(x, height - padding);
                ctx.stroke();
            }
            
            // Draw axes
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, height - padding);
            ctx.lineTo(width - padding, height - padding);
            ctx.stroke();
            
            // Labels
            ctx.fillStyle = textColor;
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`${variable} vs t`, width / 2, 10);
            
            ctx.font = '12px monospace';
            ctx.fillText('t', width - padding + 15, height - padding + 5);
            
            ctx.save();
            ctx.translate(15, height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(variable, 0, 0);
            ctx.restore();
            
            // Tick labels
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (let i = 0; i <= 5; i++) {
                const t = maxTime * i / 5;
                const x = padding + (width - 2 * padding) * i / 5;
                ctx.fillText(t.toFixed(1), x, height - padding + 5);
            }
            
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let i = 0; i <= 5; i++) {
                const value = globalMax - (globalMax - globalMin) * i / 5;
                const y = padding + (height - 2 * padding) * i / 5;
                ctx.fillText(value.toFixed(2), padding - 5, y);
            }
            
            // Plot trajectories
            this.trajectories.forEach(traj => {
                ctx.strokeStyle = traj.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                
                const idx = variable === 'x' ? 0 : 1;
                const dt = traj.tMax / traj.steps;
                
                traj.trajectoryData.forEach((point, i) => {
                    const t = i * dt;
                    const value = point[idx];
                    
                    if (isFinite(value)) {
                        const x = padding + (t / maxTime) * (width - 2 * padding);
                        const y = padding + (1 - (value - globalMin) / (globalMax - globalMin)) * (height - 2 * padding);
                        
                        if (i === 0) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                    }
                });
                
                ctx.stroke();
            });
        },
        
        // MODIFIED: Now handles backward integration
        addTrajectory() {
            const x0 = parseFloat(document.getElementById('traj-x').value);
            const y0 = parseFloat(document.getElementById('traj-y').value);
            const tMax = parseFloat(document.getElementById('traj-time').value);
            const integrateBackward = document.getElementById('backward-integration').checked;
            
            if (!isFinite(x0) || !isFinite(y0) || !isFinite(tMax)) {
                alert('Please enter valid numbers for the trajectory');
                return;
            }
            
            const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
            const color = colors[this.trajectories.length % colors.length];
            
            this.trajectories.push({ x0, y0, tMax, color, integrateBackward });
            this.updateTrajectoryList();
            this.plot();
        },
        
        removeTrajectory(index) {
            this.trajectories.splice(index, 1);
            this.updateTrajectoryList();
            
            // NEW: Hide subplots if no trajectories remain
            if (this.trajectories.length === 0) {
                document.getElementById('subplots-wrapper').style.display = 'none';
            }
            
            this.plot();
        },
        
        clearTrajectories() {
            this.trajectories = [];
            this.updateTrajectoryList();
            
            // NEW: Hide subplots when clearing all trajectories
            document.getElementById('subplots-wrapper').style.display = 'none';
            
            this.plot();
        },
        
        updateTrajectoryList() {
            const list = document.getElementById('trajectory-list');
            const clearBtn = document.getElementById('clear-traj-btn');
            
            if (this.trajectories.length === 0) {
                list.innerHTML = '';
                clearBtn.style.display = 'none';
                return;
            }
            
            clearBtn.style.display = 'block';
            
            list.innerHTML = this.trajectories.map((traj, idx) => `
                <div class="trajectory-item">
                    <span style="color: ${traj.color}; font-weight: bold;">
                        ● (${traj.x0.toFixed(2)}, ${traj.y0.toFixed(2)})${traj.integrateBackward ? ' ⟲' : ''}
                    </span>
                    <button class="plotter-button" onclick="app.removeTrajectory(${idx})">Remove</button>
                </div>
            `).join('');
        }
    };
    
    // MODIFIED plot() to handle backward integration
    const originalPlot = app.plot;
    app.plot = function() {
        // Call original plot
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.ctx.fillStyle = isDark ? '#1a1a1a' : 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawGrid();
        
        const xDotExpr = document.getElementById('x-dot').value;
        const yDotExpr = document.getElementById('y-dot').value;
        
        if (!xDotExpr || !yDotExpr) {
            console.log('Please enter both equations');
            return;
        }
        
        const vectorField = this.createVectorField(xDotExpr, yDotExpr);
        
        const xMin = parseFloat(document.getElementById('x-min').value);
        const xMax = parseFloat(document.getElementById('x-max').value);
        const yMin = parseFloat(document.getElementById('y-min').value);
        const yMax = parseFloat(document.getElementById('y-max').value);
        const resolution = parseInt(document.getElementById('resolution').value);
        
        const xStep = (xMax - xMin) / resolution;
        const yStep = (yMax - yMin) / resolution;
        
        let maxMag = 0;
        for (let i = 0; i <= resolution; i++) {
            for (let j = 0; j <= resolution; j++) {
                const x = xMin + i * xStep;
                const y = yMin + j * yStep;
                const [dx, dy] = vectorField(x, y);
                const mag = Math.sqrt(dx * dx + dy * dy);
                if (isFinite(mag) && mag > maxMag) maxMag = mag;
            }
        }
        
        for (let i = 0; i <= resolution; i++) {
            for (let j = 0; j <= resolution; j++) {
                const x = xMin + i * xStep;
                const y = yMin + j * yStep;
                const [dx, dy] = vectorField(x, y);
                
                if (isFinite(dx) && isFinite(dy)) {
                    const mag = Math.sqrt(dx * dx + dy * dy);
                    const normalizedScale = mag / maxMag;
                    
                    const hue = 240 - normalizedScale * 120;
                    const color = `hsl(${hue}, 70%, 50%)`;
                    
                    this.drawArrow(x, y, dx, dy, color, 0.8);
                }
            }
        }
        
        // Draw nullclines if enabled
        if (document.getElementById('show-nullclines').checked) {
            this.plotNullclines(vectorField);
            this.drawLegend();
        }
        
        // Draw trajectories with support for backward integration
        this.trajectories.forEach((traj, idx) => {
            const steps = this.calculateTrajectorySteps(traj.tMax);
            
            // Forward trajectory
            const forwardTrajectory = this.computeTrajectory(
                vectorField,
                traj.x0,
                traj.y0,
                traj.tMax,
                steps
            );
            
            let combinedTrajectory = forwardTrajectory;
            
            // If backward integration is enabled, compute backward trajectory
            if (traj.integrateBackward) {
                // Create reversed vector field for backward integration
                const backwardVectorField = (x, y) => {
                    const [dx, dy] = vectorField(x, y);
                    return [-dx, -dy];
                };
                
                const backwardTrajectory = this.computeTrajectory(
                    backwardVectorField,
                    traj.x0,
                    traj.y0,
                    traj.tMax,
                    steps
                );
                
                // Combine: reverse backward trajectory and concatenate with forward
                combinedTrajectory = [...backwardTrajectory.slice().reverse(), ...forwardTrajectory.slice(1)];
            }
            
            // Store trajectory data for time series plots (using forward only for now)
            traj.trajectoryData = forwardTrajectory;
            traj.steps = steps;
            
            this.ctx.strokeStyle = traj.color;
            this.ctx.lineWidth = 2.5;
            this.ctx.beginPath();
            
            combinedTrajectory.forEach(([x, y], i) => {
                const [cx, cy] = this.worldToCanvas(x, y);
                if (i === 0) {
                    this.ctx.moveTo(cx, cy);
                } else {
                    this.ctx.lineTo(cx, cy);
                }
            });
            
            this.ctx.stroke();
            
            // Draw starting point
            const [cx0, cy0] = this.worldToCanvas(traj.x0, traj.y0);
            this.ctx.fillStyle = traj.color;
            this.ctx.beginPath();
            this.ctx.arc(cx0, cy0, 6, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw arrow at end of forward trajectory
            if (forwardTrajectory.length > 0) {
                const [xEnd, yEnd] = forwardTrajectory[forwardTrajectory.length - 1];
                const [cxEnd, cyEnd] = this.worldToCanvas(xEnd, yEnd);
                this.ctx.fillStyle = traj.color;
                this.ctx.beginPath();
                this.ctx.moveTo(cxEnd, cyEnd - 8);
                this.ctx.lineTo(cxEnd - 6, cyEnd + 4);
                this.ctx.lineTo(cxEnd + 6, cyEnd + 4);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.strokeStyle = 'white';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
        });
        
        // NEW: Draw marker at Jacobian analysis point
        if (this.jacobianPoint) {
            const [jx, jy] = this.worldToCanvas(this.jacobianPoint.x, this.jacobianPoint.y);
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const markerColor = isDark ? '#FFD700' : '#FF6B00'; // Gold in dark mode, orange in light
            
            // Draw crosshair marker
            this.ctx.strokeStyle = markerColor;
            this.ctx.lineWidth = 2.5;
            const size = 12;
            
            // Horizontal line
            this.ctx.beginPath();
            this.ctx.moveTo(jx - size, jy);
            this.ctx.lineTo(jx + size, jy);
            this.ctx.stroke();
            
            // Vertical line
            this.ctx.beginPath();
            this.ctx.moveTo(jx, jy - size);
            this.ctx.lineTo(jx, jy + size);
            this.ctx.stroke();
            
            // Center circle
            this.ctx.fillStyle = markerColor;
            this.ctx.beginPath();
            this.ctx.arc(jx, jy, 4, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // White outline for visibility
            this.ctx.strokeStyle = isDark ? '#000' : '#FFF';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
        
        // Plot time series if trajectories exist
        if (this.trajectories.length > 0) {
            this.plotTimeSeries();
        }
    };
    
    window.addEventListener('load', () => {
        app.init();
    });
