const app = {
    canvasMain: null,
    ctxMain: null,
    canvasIntegral: null,
    ctxIntegral: null,
    canvasDerivative: null,
    ctxDerivative: null,
    params: { a: 1, b: 1, c: 1, d: 1, q: 1 },
    clickedPoints: { main: null, integral: null, derivative: null },
    
    init() {
        // Initialize canvases
        this.canvasMain = document.getElementById('main-plot');
        this.ctxMain = this.canvasMain.getContext('2d');
        this.canvasIntegral = document.getElementById('integral-plot');
        this.ctxIntegral = this.canvasIntegral.getContext('2d');
        this.canvasDerivative = document.getElementById('derivative-plot');
        this.ctxDerivative = this.canvasDerivative.getContext('2d');
        
        // Setup click listeners for coordinate display
        this.setupClickListeners();
        
        // Setup parameter sliders
        this.setupParamSliders();
        
        // Initial plot
        this.plot();
    },
    
    setupClickListeners() {
        const handleCanvasClick = (canvas, canvasType) => {
            canvas.addEventListener('click', (event) => {
                const rect = canvas.getBoundingClientRect();
                
                // Account for canvas scaling (canvas internal size vs display size)
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const x = (event.clientX - rect.left) * scaleX;
                const y = (event.clientY - rect.top) * scaleY;
                
                // Store the clicked point for this canvas
                this.clickedPoints[canvasType] = { x, y };
                
                // Redraw the plot to show the coordinate
                this.plot();
            });
        };
        
        handleCanvasClick(this.canvasMain, 'main');
        handleCanvasClick(this.canvasIntegral, 'integral');
        handleCanvasClick(this.canvasDerivative, 'derivative');
    },
    
    setupParamSliders() {
        const paramNames = ['a', 'b', 'c', 'd', 'q'];
        
        paramNames.forEach(param => {
            const slider = document.getElementById(`param-${param}-slider`);
            const minInput = document.getElementById(`param-${param}-min`);
            const maxInput = document.getElementById(`param-${param}-max`);
            const valueDisplay = document.getElementById(`param-${param}-value`);
            
            // Update slider range when min/max change
            const updateSliderRange = () => {
                const min = parseFloat(minInput.value);
                const max = parseFloat(maxInput.value);
                slider.min = min;
                slider.max = max;
                
                // Clamp current value to new range
                const currentValue = parseFloat(slider.value);
                if (currentValue < min) slider.value = min;
                if (currentValue > max) slider.value = max;
                
                this.params[param] = parseFloat(slider.value);
                valueDisplay.textContent = parseFloat(slider.value).toFixed(2);
                this.plot();
            };
            
            minInput.addEventListener('change', updateSliderRange);
            maxInput.addEventListener('change', updateSliderRange);
            
            // Update value when slider changes
            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                this.params[param] = value;
                valueDisplay.textContent = value.toFixed(2);
                this.plot();
            });
            
            // Make value display clickable to edit
            valueDisplay.style.cursor = 'pointer';
            valueDisplay.addEventListener('click', () => {
                const currentValue = this.params[param];
                const newValue = prompt(`Enter new value for ${param}:`, currentValue);
                
                if (newValue !== null && newValue.trim() !== '') {
                    const parsedValue = parseFloat(newValue);
                    
                    if (!isNaN(parsedValue)) {
                        let min = parseFloat(slider.min);
                        let max = parseFloat(slider.max);
                        
                        // If value exceeds max, update max
                        if (parsedValue > max) {
                            max = parsedValue;
                            maxInput.value = max;
                            slider.max = max;
                        }
                        
                        // If value is below min, update min
                        if (parsedValue < min) {
                            min = parsedValue;
                            minInput.value = min;
                            slider.min = min;
                        }
                        
                        slider.value = parsedValue;
                        this.params[param] = parsedValue;
                        valueDisplay.textContent = parsedValue.toFixed(2);
                        this.plot();
                    } else {
                        alert('Please enter a valid number.');
                    }
                }
            });
            
            // Initialize
            this.params[param] = parseFloat(slider.value);
            valueDisplay.textContent = parseFloat(slider.value).toFixed(2);
        });
    },
    
    parseFunction(expr) {
        // Remove all whitespace to prevent crashes from spaces
        let processed = expr.replace(/\s+/g, '');
        
        // Replace common mathematical notation
        processed = processed
            .replace(/\^/g, '**')
            .replace(/PI/g, 'Math.PI')
            .replace(/\be\b/g, 'Math.E');
        
        // Replace arcsin, arccos, arctan with asin, acos, atan FIRST (before adding Math. prefix)
        processed = processed.replace(/\barcsin\(/g, 'asin(');
        processed = processed.replace(/\barccos\(/g, 'acos(');
        processed = processed.replace(/\barctan\(/g, 'atan(');
        
        // Replace function names
        const mathFunctions = [
            'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
            'sinh', 'cosh', 'tanh',
            'sqrt', 'abs', 'exp', 'log', 'pow',
            'floor', 'ceil', 'round'
        ];
        
        mathFunctions.forEach(func => {
            const regex = new RegExp(`\\b${func}\\(`, 'g');
            processed = processed.replace(regex, `Math.${func}(`);
        });
        
        return processed;
    },
    
    evaluateFunction(expr, x) {
        try {
            const processed = this.parseFunction(expr);
            const { a, b, c, d, q } = this.params;
            // Use Function constructor instead of eval for safer evaluation
            // This creates a function with explicit parameters and limited scope
            const func = new Function('x', 'a', 'b', 'c', 'd', 'q', 'Math', `'use strict'; return (${processed});`);
            return func(x, a, b, c, d, q, Math);
        } catch (error) {
            return NaN;
        }
    },
    
    // Analytical derivative calculation
    analyticalDerivative(expr) {
        // This function computes the symbolic derivative of an expression
        // Returns a function string that can be evaluated
        
        try {
            // Remove whitespace
            expr = expr.trim();
            
            // Create derivative function
            return (x) => {
                // Adaptive step size: scales with x to avoid catastrophic cancellation
                // For x near 0, use a small but safe value; for large x, scale appropriately
                const h = Math.max(1e-7, Math.abs(x) * 1e-6);
                const { a, b, c, d, q } = this.params;
                
                // Numerical derivative using central difference for accuracy
                const f1 = this.evaluateFunction(expr, x + h);
                const f2 = this.evaluateFunction(expr, x - h);
                
                return (f1 - f2) / (2 * h);
            };
        } catch (error) {
            return () => NaN;
        }
    },
    
    // Pattern-based symbolic derivative (for common patterns)
    getSymbolicDerivative(expr) {
        // This returns a string expression for common derivative patterns
        expr = expr.trim();
        
        // Polynomial: a*x^n -> a*n*x^(n-1)
        const polyMatch = expr.match(/^([abcdq]?)\*?x\*\*(\d+)$/);
        if (polyMatch) {
            const coef = polyMatch[1] || '1';
            const power = parseInt(polyMatch[2]);
            if (power === 1) return coef;
            if (power === 2) return `${coef === '1' ? '' : coef + '*'}2*x`;
            return `${coef === '1' ? '' : coef + '*'}${power}*x**${power - 1}`;
        }
        
        // Linear: a*x + b -> a
        const linearMatch = expr.match(/^([abcdq]?)\*?x\s*[\+\-]\s*[abcdq\d\.]+$/);
        if (linearMatch) {
            return linearMatch[1] || '1';
        }
        
        // Just x -> 1
        if (expr === 'x') return '1';
        
        // Constant -> 0
        if (!expr.includes('x')) return '0';
        
        // Trig functions
        if (expr.match(/^Math\.sin\(x\)$/)) return 'Math.cos(x)';
        if (expr.match(/^Math\.cos\(x\)$/)) return '-Math.sin(x)';
        if (expr.match(/^Math\.tan\(x\)$/)) return '1/(Math.cos(x)**2)';
        
        // Exponential
        if (expr.match(/^Math\.exp\(x\)$/)) return 'Math.exp(x)';
        
        // Logarithm
        if (expr.match(/^Math\.log\(x\)$/)) return '1/x';
        
        // Couldn't find pattern, return null to use numerical
        return null;
    },
    
    // Pattern-based symbolic integral (for common patterns)
    getSymbolicIntegral(expr) {
        // This returns a string expression for common integral patterns
        expr = expr.trim();
        
        // Polynomial: x^n -> x^(n+1)/(n+1)
        const polyMatch = expr.match(/^([abcdq]?)\*?x\*\*(\d+)$/);
        if (polyMatch) {
            const coef = polyMatch[1] || '1';
            const power = parseInt(polyMatch[2]);
            const newPower = power + 1;
            return `${coef === '1' ? '' : coef + '*'}(x**${newPower})/${newPower}`;
        }
        
        // Linear: a*x -> a*x^2/2
        if (expr.match(/^([abcdq])\*?x$/)) {
            const coef = expr.match(/^([abcdq])/)[1];
            return `${coef}*x**2/2`;
        }
        
        // Just x -> x^2/2
        if (expr === 'x') return 'x**2/2';
        
        // Constant
        const constMatch = expr.match(/^([abcde\d\.]+)$/);
        if (constMatch) {
            return `${constMatch[1]}*x`;
        }
        
        // 1/x -> log(x)
        if (expr === '1/x') return 'Math.log(Math.abs(x))';
        
        // Trig functions
        if (expr.match(/^Math\.sin\(x\)$/)) return '-Math.cos(x)';
        if (expr.match(/^Math\.cos\(x\)$/)) return 'Math.sin(x)';
        if (expr.match(/^Math\.exp\(x\)$/)) return 'Math.exp(x)';
        
        // Couldn't find pattern, return null to use numerical
        return null;
    },
    
    numericalIntegral(expr, xMin, xMax, numPoints = 30) {
        // Get selected integration method
        const method = document.getElementById('integration-method')?.value || 'trapezoidal';
        
        if (method === 'trapezoidal') {
            // Cumulative Trapezoidal rule - faster
            const dx = (xMax - xMin) / numPoints;
            let sum = 0;
            
            for (let i = 0; i <= numPoints; i++) {
                const x = xMin + i * dx;
                const y = this.evaluateFunction(expr, x);
                
                if (isNaN(y) || !isFinite(y)) continue;
                
                if (i === 0 || i === numPoints) {
                    sum += y / 2;
                } else {
                    sum += y;
                }
            }
            
            return sum * dx;
        } else {
            // Simpson's rule - more accurate
            const n = numPoints % 2 === 0 ? numPoints : numPoints + 1; // must be even
            const h = (xMax - xMin) / n;
            
            let sum = this.evaluateFunction(expr, xMin) + this.evaluateFunction(expr, xMax);
            
            for (let i = 1; i < n; i++) {
                const x = xMin + i * h;
                const y = this.evaluateFunction(expr, x);
                
                if (!isFinite(y)) continue;
                
                if (i % 2 === 0) {
                    sum += 2 * y;
                } else {
                    sum += 4 * y;
                }
            }
            
            return (h / 3) * sum;
        }
    },
    
    computeIntegralFunction(expr, xArray) {
        // Try to use symbolic integral first
        const symbolicIntegral = this.getSymbolicIntegral(expr);
        
        if (symbolicIntegral) {
            // Use symbolic integration
            const xMin = xArray[0];
            const integralAtMin = this.evaluateFunction(symbolicIntegral, xMin);
            
            return xArray.map(x => {
                const integralAtX = this.evaluateFunction(symbolicIntegral, x);
                return integralAtX - integralAtMin;
            });
        } else {
            // Fall back to numerical integration with adaptive sampling
            const integralValues = [];
            const xMin = xArray[0];
            const sampleInterval = Math.max(1, Math.floor(xArray.length / 100));
            
            const samplePoints = [];
            const sampleIntegrals = [];
            
            for (let i = 0; i < xArray.length; i += sampleInterval) {
                const xCurrent = xArray[i];
                const integralValue = this.numericalIntegral(expr, xMin, xCurrent);
                samplePoints.push(i);
                sampleIntegrals.push(integralValue);
            }
            
            if (samplePoints[samplePoints.length - 1] !== xArray.length - 1) {
                const xCurrent = xArray[xArray.length - 1];
                const integralValue = this.numericalIntegral(expr, xMin, xCurrent);
                samplePoints.push(xArray.length - 1);
                sampleIntegrals.push(integralValue);
            }
            
            for (let i = 0; i < xArray.length; i++) {
                let lowerIdx = 0;
                let upperIdx = 0;
                
                for (let j = 0; j < samplePoints.length - 1; j++) {
                    if (i >= samplePoints[j] && i <= samplePoints[j + 1]) {
                        lowerIdx = j;
                        upperIdx = j + 1;
                        break;
                    }
                }
                
                if (samplePoints.includes(i)) {
                    const idx = samplePoints.indexOf(i);
                    integralValues.push(sampleIntegrals[idx]);
                } else {
                    const t = (i - samplePoints[lowerIdx]) / (samplePoints[upperIdx] - samplePoints[lowerIdx]);
                    const interpolated = sampleIntegrals[lowerIdx] + t * (sampleIntegrals[upperIdx] - sampleIntegrals[lowerIdx]);
                    integralValues.push(interpolated);
                }
            }
            
            return integralValues;
        }
    },
    
    computeAnalyticalIntegralFunction(integralExpr, xArray) {
        // Compute integral using user-provided analytical formula
        // The formula should be the antiderivative, we'll compute F(x) - F(xMin)
        const xMin = xArray[0];
        const integralAtMin = this.evaluateFunction(integralExpr, xMin);
        
        return xArray.map(x => {
            const integralAtX = this.evaluateFunction(integralExpr, x);
            return integralAtX - integralAtMin;
        });
    },
    
    computeDerivativeFunction(expr, xArray) {
        // Try to use symbolic derivative first
        const symbolicDerivative = this.getSymbolicDerivative(expr);
        
        if (symbolicDerivative) {
            // Use symbolic differentiation
            return xArray.map(x => this.evaluateFunction(symbolicDerivative, x));
        } else {
            // Fall back to numerical differentiation
            const h = (xArray[xArray.length - 1] - xArray[0]) / (xArray.length - 1);
            
            return xArray.map((x, i) => {
                if (i === 0) {
                    // Forward difference at the start
                    const f0 = this.evaluateFunction(expr, xArray[i]);
                    const f1 = this.evaluateFunction(expr, xArray[i + 1]);
                    return (f1 - f0) / h;
                } else if (i === xArray.length - 1) {
                    // Backward difference at the end
                    const f0 = this.evaluateFunction(expr, xArray[i - 1]);
                    const f1 = this.evaluateFunction(expr, xArray[i]);
                    return (f1 - f0) / h;
                } else {
                    // Central difference in the middle
                    const f0 = this.evaluateFunction(expr, xArray[i - 1]);
                    const f1 = this.evaluateFunction(expr, xArray[i + 1]);
                    return (f1 - f0) / (2 * h);
                }
            });
        }
    },
    
    plot() {
        const xMin = parseFloat(document.getElementById('x-min').value);
        const xMax = parseFloat(document.getElementById('x-max').value);
        const yMin = parseFloat(document.getElementById('y-min').value);
        const yMax = parseFloat(document.getElementById('y-max').value);
        const autoScaleY = document.getElementById('auto-scale-y').checked;
        const numPoints = parseInt(document.getElementById('plot-points').value) || 200;
        const computeIntegrals = document.getElementById('compute-integrals').checked;
        
        const funcF = document.getElementById('func-f').value.trim();
        const funcG = document.getElementById('func-g').value.trim();
        const funcH = document.getElementById('func-h').value.trim();
        const funcU = document.getElementById('func-u').value.trim();
        
        // Get analytical derivative/integral inputs
        const funcFDeriv = document.getElementById('func-f-deriv').value.trim();
        const funcGDeriv = document.getElementById('func-g-deriv').value.trim();
        const funcHDeriv = document.getElementById('func-h-deriv').value.trim();
        const funcUDeriv = document.getElementById('func-u-deriv').value.trim();
        
        const funcFInteg = document.getElementById('func-f-integ').value.trim();
        const funcGInteg = document.getElementById('func-g-integ').value.trim();
        const funcHInteg = document.getElementById('func-h-integ').value.trim();
        const funcUInteg = document.getElementById('func-u-integ').value.trim();
        
        // Generate x values
        const xValues = [];
        const dx = (xMax - xMin) / (numPoints - 1);
        
        for (let i = 0; i < numPoints; i++) {
            xValues.push(xMin + i * dx);
        }
        
        // Evaluate functions (skip if empty)
        const fValues = funcF ? xValues.map(x => this.evaluateFunction(funcF, x)) : [];
        const gValues = funcG ? xValues.map(x => this.evaluateFunction(funcG, x)) : [];
        const hValues = funcH ? xValues.map(x => this.evaluateFunction(funcH, x)) : [];
        const uValues = funcU ? xValues.map(x => this.evaluateFunction(funcU, x)) : [];
        
        // Compute derivatives using analytical formulas if provided, otherwise use automatic computation
        const fDerivValues = funcF ? (funcFDeriv ? xValues.map(x => this.evaluateFunction(funcFDeriv, x)) : this.computeDerivativeFunction(funcF, xValues)) : [];
        const gDerivValues = funcG ? (funcGDeriv ? xValues.map(x => this.evaluateFunction(funcGDeriv, x)) : this.computeDerivativeFunction(funcG, xValues)) : [];
        const hDerivValues = funcH ? (funcHDeriv ? xValues.map(x => this.evaluateFunction(funcHDeriv, x)) : this.computeDerivativeFunction(funcH, xValues)) : [];
        const uDerivValues = funcU ? (funcUDeriv ? xValues.map(x => this.evaluateFunction(funcUDeriv, x)) : this.computeDerivativeFunction(funcU, xValues)) : [];
        
        // Compute integrals if enabled
        let FValues = [];
        let GValues = [];
        let HValues = [];
        let UValues = [];
        
        if (computeIntegrals) {
            FValues = funcF ? (funcFInteg ? this.computeAnalyticalIntegralFunction(funcFInteg, xValues) : this.computeIntegralFunction(funcF, xValues)) : [];
            GValues = funcG ? (funcGInteg ? this.computeAnalyticalIntegralFunction(funcGInteg, xValues) : this.computeIntegralFunction(funcG, xValues)) : [];
            HValues = funcH ? (funcHInteg ? this.computeAnalyticalIntegralFunction(funcHInteg, xValues) : this.computeIntegralFunction(funcH, xValues)) : [];
            UValues = funcU ? (funcUInteg ? this.computeAnalyticalIntegralFunction(funcUInteg, xValues) : this.computeIntegralFunction(funcU, xValues)) : [];
        }
        
        // Auto-scale Y if enabled
        let mainYMin = yMin;
        let mainYMax = yMax;
        let integralYMin = yMin;
        let integralYMax = yMax;
        let derivativeYMin = yMin;
        let derivativeYMax = yMax;
        
        if (autoScaleY) {
            // Find min/max for main functions
            const allMainValues = [...fValues, ...gValues, ...hValues, ...uValues].filter(isFinite);
            if (allMainValues.length > 0) {
                mainYMin = Math.min(...allMainValues);
                mainYMax = Math.max(...allMainValues);
                const mainMargin = (mainYMax - mainYMin) * 0.1;
                mainYMin -= mainMargin;
                mainYMax += mainMargin;
            }
            
            // Find min/max for integrals
            if (computeIntegrals) {
                const allIntegralValues = [...FValues, ...GValues, ...HValues, ...UValues].filter(isFinite);
                if (allIntegralValues.length > 0) {
                    integralYMin = Math.min(...allIntegralValues);
                    integralYMax = Math.max(...allIntegralValues);
                    const integralMargin = (integralYMax - integralYMin) * 0.1;
                    integralYMin -= integralMargin;
                    integralYMax += integralMargin;
                }
            }
            
            // Find min/max for derivatives
            const allDerivValues = [...fDerivValues, ...gDerivValues, ...hDerivValues, ...uDerivValues].filter(isFinite);
            if (allDerivValues.length > 0) {
                derivativeYMin = Math.min(...allDerivValues);
                derivativeYMax = Math.max(...allDerivValues);
                const derivMargin = (derivativeYMax - derivativeYMin) * 0.1;
                derivativeYMin -= derivMargin;
                derivativeYMax += derivMargin;
            }
        }
        
        // Plot main functions (filter out empty datasets)
        const mainDatasets = [
            { data: fValues, color: '#2ecc71', label: 'f(x)', active: funcF },
            { data: gValues, color: '#f39c12', label: 'g(x)', active: funcG },
            { data: hValues, color: '#3498db', label: 'h(x)', active: funcH },
            { data: uValues, color: '#e73c3c', label: 'u(x)', active: funcU }
        ].filter(ds => ds.active);
        
        this.plotCanvas(this.ctxMain, this.canvasMain, xValues, mainDatasets, xMin, xMax, mainYMin, mainYMax);
        
        // Plot integrals (or show message if disabled)
        if (computeIntegrals) {
            const integralDatasets = [
                { data: FValues, color: '#2ecc71', label: 'F(x) = ∫f', active: funcF },
                { data: GValues, color: '#f39c12', label: 'G(x) = ∫g', active: funcG },
                { data: HValues, color: '#3498db', label: 'H(x) = ∫h', active: funcH },
                { data: UValues, color: '#e73c3c', label: 'U(x) = ∫u', active: funcU }
            ].filter(ds => ds.active);
            
            this.plotCanvas(this.ctxIntegral, this.canvasIntegral, xValues, integralDatasets, xMin, xMax, integralYMin, integralYMax);
        } else {
            // Clear integral canvas and show message
            this.ctxIntegral.clearRect(0, 0, this.canvasIntegral.width, this.canvasIntegral.height);
            const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.ctxIntegral.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
            this.ctxIntegral.font = '30px HaraldMono, monospace';
            this.ctxIntegral.textAlign = 'center';
            this.ctxIntegral.textBaseline = 'middle';
            this.ctxIntegral.fillText('Integrals disabled', this.canvasIntegral.width / 2, this.canvasIntegral.height / 2);
            this.ctxIntegral.font = '30px HaraldMono, monospace';
            this.ctxIntegral.fillText('(enable in settings)', this.canvasIntegral.width / 2, this.canvasIntegral.height / 2 + 25);
        }
        
        // Plot derivatives (filter out empty datasets)
        const derivativeDatasets = [
            { data: fDerivValues, color: '#2ecc71', label: "f'(x)", active: funcF },
            { data: gDerivValues, color: '#f39c12', label: "g'(x)", active: funcG },
            { data: hDerivValues, color: '#3498db', label: "h'(x)", active: funcH },
            { data: uDerivValues, color: '#e73c3c', label: "u'(x)", active: funcU }
        ].filter(ds => ds.active);
        
        this.plotCanvas(this.ctxDerivative, this.canvasDerivative, xValues, derivativeDatasets, xMin, xMax, derivativeYMin, derivativeYMax);
    },
    
    plotCanvas(ctx, canvas, xValues, dataSets, xMin, xMax, yMin, yMax) {
        const width = canvas.width;
        const height = canvas.height;
        const padding = 60;
        const plotWidth = width - 2 * padding;
        const plotHeight = height - 2 * padding;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Check for dark mode
        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const textColor = isDarkMode ? '#FFFFFF' : '#000000';
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
        const axisColor = isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';
        
        // Helper functions
        const xToCanvas = (x) => padding + ((x - xMin) / (xMax - xMin)) * plotWidth;
        const yToCanvas = (y) => height - padding - ((y - yMin) / (yMax - yMin)) * plotHeight;
        
        // Draw grid
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        
        // Vertical grid lines
        const xStep = this.calculateNiceStep(xMin, xMax, 10);
        for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
            const canvasX = xToCanvas(x);
            ctx.beginPath();
            ctx.moveTo(canvasX, padding);
            ctx.lineTo(canvasX, height - padding);
            ctx.stroke();
        }
        
        // Horizontal grid lines
        const yStep = this.calculateNiceStep(yMin, yMax, 8);
        for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
            const canvasY = yToCanvas(y);
            ctx.beginPath();
            ctx.moveTo(padding, canvasY);
            ctx.lineTo(width - padding, canvasY);
            ctx.stroke();
        }
        
        // Draw axes
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 2;
        
        // X-axis
        if (yMin <= 0 && yMax >= 0) {
            const y0 = yToCanvas(0);
            ctx.beginPath();
            ctx.moveTo(padding, y0);
            ctx.lineTo(width - padding, y0);
            ctx.stroke();
        }
        
        // Y-axis
        if (xMin <= 0 && xMax >= 0) {
            const x0 = xToCanvas(0);
            ctx.beginPath();
            ctx.moveTo(x0, padding);
            ctx.lineTo(x0, height - padding);
            ctx.stroke();
        }
        
        // Draw axis labels
        ctx.fillStyle = textColor;
        ctx.font = '28px HaraldMono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        // X-axis labels
        for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
            const canvasX = xToCanvas(x);
            ctx.fillText(x.toFixed(1), canvasX, height - padding + 10);
        }
        
        // Y-axis labels
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
            const canvasY = yToCanvas(y);
            ctx.fillText(y.toFixed(1), padding - 10, canvasY);
        }
        
        // Plot data sets
        dataSets.forEach(({ data, color, label }) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            
            let firstPoint = true;
            for (let i = 0; i < xValues.length; i++) {
                const x = xValues[i];
                const y = data[i];
                
                if (!isFinite(y)) {
                    firstPoint = true;
                    continue;
                }
                
                const canvasX = xToCanvas(x);
                const canvasY = yToCanvas(y);
                
                if (firstPoint) {
                    ctx.moveTo(canvasX, canvasY);
                    firstPoint = false;
                } else {
                    ctx.lineTo(canvasX, canvasY);
                }
            }
            
            ctx.stroke();
        });
        
        // Draw coordinate display if a point was clicked
        const canvasType = canvas === this.canvasMain ? 'main' : 
                          canvas === this.canvasIntegral ? 'integral' : 'derivative';
        const clickedPoint = this.clickedPoints[canvasType];
        
        if (clickedPoint) {
            const plotX = xMin + ((clickedPoint.x - padding) / plotWidth) * (xMax - xMin);
            const plotY = yMax - ((clickedPoint.y - padding) / plotHeight) * (yMax - yMin);
            
            // Draw the coordinate text above the clicked point
            const coordText = `(${plotX.toFixed(2)}, ${plotY.toFixed(2)})`;
            ctx.font = '24px HaraldMono, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            
            // Draw background for better readability
            const textMetrics = ctx.measureText(coordText);
            const textWidth = textMetrics.width;
            const textHeight = 24;
            const bgPadding = 5;
            
            ctx.fillStyle = isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(
                clickedPoint.x - textWidth/2 - bgPadding,
                clickedPoint.y - textHeight - bgPadding - 10,
                textWidth + 2*bgPadding,
                textHeight + 2*bgPadding
            );
            
            // Draw border
            ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(
                clickedPoint.x - textWidth/2 - bgPadding,
                clickedPoint.y - textHeight - bgPadding - 10,
                textWidth + 2*bgPadding,
                textHeight + 2*bgPadding
            );
            
            // Draw text
            ctx.fillStyle = textColor;
            ctx.fillText(coordText, clickedPoint.x, clickedPoint.y - 10);
            
            // Draw a small circle at the clicked point
            ctx.fillStyle = isDarkMode ? '#FFFFFF' : '#000000';
            ctx.beginPath();
            ctx.arc(clickedPoint.x, clickedPoint.y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw legend
        const legendX = width - padding - 10;
        const legendY = padding + 10;
        const legendLineLength = 30;
        const legendSpacing = 25;
        
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '28px HaraldMono, monospace';
        
        dataSets.forEach(({ color, label }, index) => {
            const y = legendY + index * legendSpacing;
            
            // Draw line
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(legendX - legendLineLength, y);
            ctx.lineTo(legendX, y);
            ctx.stroke();
            
            // Draw label
            ctx.fillStyle = textColor;
            ctx.fillText(label, legendX - legendLineLength - 10, y);
        });
    },
    
    calculateNiceStep(min, max, targetSteps) {
        const range = max - min;
        const roughStep = range / targetSteps;
        const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
        const normalizedStep = roughStep / magnitude;
        
        let niceStep;
        if (normalizedStep <= 1) niceStep = 1;
        else if (normalizedStep <= 2) niceStep = 2;
        else if (normalizedStep <= 5) niceStep = 5;
        else niceStep = 10;
        
        return niceStep * magnitude;
    }
};

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    app.init();
});