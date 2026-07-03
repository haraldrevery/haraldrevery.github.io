    (() => {
        const html = document.documentElement;
        const modeToggle = document.getElementById('mode-toggle_legacy');
        const modeIcon = document.getElementById('mode-icon_legacy');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        let isDark = prefersDark;

        function applyMode(dark) {
            isDark = dark;
            html.classList.toggle('dark', dark);
            modeIcon.textContent = dark ? '☀' : '🌙';
        }
        applyMode(prefersDark);
        modeToggle.addEventListener('click', () => applyMode(!isDark));

        const tickGroup = document.getElementById('clock-ticks');
        const R = 270;
        for (let i = 0; i < 60; i++) {
            const isMajor = i % 5 === 0;
            const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
            const outer = R - 2;
            const inner = outer - (isMajor ? 16 : 8);

            const x1 = Math.cos(angle) * inner;
            const y1 = Math.sin(angle) * inner;
            const x2 = Math.cos(angle) * outer;
            const y2 = Math.sin(angle) * outer;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1.toFixed(2));
            line.setAttribute('y1', y1.toFixed(2));
            line.setAttribute('x2', x2.toFixed(2));
            line.setAttribute('y2', y2.toFixed(2));
            line.setAttribute('stroke-width', isMajor ? '1.8' : '0.9');
            line.setAttribute('class', isMajor ? 'clock-tick-major' : 'clock-tick-minor');
            tickGroup.appendChild(line);
        }

        const arc = document.getElementById('clock-progress-arc');
        const circumference = 2 * Math.PI * R;
        arc.style.strokeDasharray = circumference;
        arc.style.strokeDashoffset = circumference;

        const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const DAYS_SV   = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
        const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];

        const UI_STRINGS = {
            en: {
                timerBtn:    'Timer',
                alarmBtn:    'Alarm',
                settingsBtn: 'Settings',
                startTimer:  'Start Timer',
                setAlarm:    'Set Alarm',
                cancel:      'Cancel',
                alarmLabel:  'set alarm time (24 h)',
                timerActive: 'TIMER ACTIVE',
            },
            sv: {
                timerBtn:    'Timer',
                alarmBtn:    'Alarm',
                settingsBtn: 'Inställningar',
                startTimer:  'Starta timer',
                setAlarm:    'Ställ in alarm',
                cancel:      'Avbryt',
                alarmLabel:  'ange alarmtid (24 h)',
                timerActive: 'NEDRÄKNING',
            }
        };

        let currentLang = (function () {
            try { return localStorage.getItem('clock-lang') || 'en'; } catch (e) { return 'en'; }
        })();

        function getISOWeek(date) {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const day = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - day);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        }

        function pad(n) { return String(n).padStart(2, '0'); }
        function tzLabel() {
            const off = -new Date().getTimezoneOffset();
            const sign = off >= 0 ? '+' : '-';
            const abs = Math.abs(off);
            return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
        }
        function ordinal(n) {
            const s = ['th','st','nd','rd'];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
        }

        const timeEl = document.getElementById('clock-time');
        const dateEl = document.getElementById('clock-date');
        const tzEl   = document.getElementById('clock-timezone');

        let lastSec = -1;
        tzEl.textContent = tzLabel();

<<<<<<< HEAD
        // ── Hourglass state ──────────────────────────────────────
        let animStyle = (function () {
            try { return localStorage.getItem('clock-anim') || 'ring'; } catch (e) { return 'ring'; }
        })();
        let hgFlipCount   = 0;   // monotonically increasing; even = upright, odd = inverted
        let lastHour      = -1;
        let hgInitialized = false;
        // ────────────────────────────────────────────────────────

=======
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
        let isTimerMode  = false;
        let isAlarming   = false;
        let timerEndMs   = 0;
        let timerTotalMs = 0;

        // Alarm state
        let alarmIsSet  = false;
        let alarmHour   = -1;
        let alarmMinute = -1;

        const modal      = document.getElementById('timer-modal');
        const btnStart   = document.getElementById('btn-start');
        const btnCancel  = document.getElementById('btn-cancel');
        const inHr       = document.getElementById('t-hr');
        const inMin      = document.getElementById('t-min');
        const inSec      = document.getElementById('t-sec');
        const alarmSound = document.getElementById('alarm-sound');

<<<<<<< HEAD
        // List of available alarm sounds
        const alarmSoundList = [
            '/audio/mp3/timer_alarm_1.mp3',
=======
        // List of available alarm sounds (edit paths to match your actual files)
        const alarmSoundList = [
            '/audio/mp3/timer_alarm_1.mp3',      // keep original as fallback
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
            '/audio/mp3/timer_alarm_2.mp3',
            '/audio/mp3/timer_alarm_3.mp3'
        ];

        function playRandomAlarmSound() {
            const randomIndex = Math.floor(Math.random() * alarmSoundList.length);
            const selectedSound = alarmSoundList[randomIndex];
            alarmSound.src = selectedSound;
<<<<<<< HEAD
            alarmSound.load();
=======
            alarmSound.load();                  // optional but ensures new src is ready
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
            alarmSound.play().catch(e => console.log("Audio play prevented:", e));
        }

        // Mode tab elements
        const modeTimerBtn    = document.getElementById('mode-timer-btn');
        const modeAlarmBtn    = document.getElementById('mode-alarm-btn');
        const modeSettingsBtn = document.getElementById('mode-settings-btn');
        const timerSection    = document.getElementById('timer-section');
        const alarmSection    = document.getElementById('alarm-section');
        const settingsSection = document.getElementById('settings-section');
        const inAHr           = document.getElementById('a-hr');
        const inAMin          = document.getElementById('a-min');
        const langEnBtn       = document.getElementById('lang-en-btn');
        const langSvBtn       = document.getElementById('lang-sv-btn');
        const alarmLabelEl    = document.getElementById('alarm-label');

<<<<<<< HEAD
        // ── Hourglass DOM refs ───────────────────────────────────
        const hgSvg       = document.getElementById('clock-hourglass-svg');
        const hgTopSand   = document.getElementById('hg-top-sand');
        const hgBotSand   = document.getElementById('hg-bot-sand');
        const hgStreamDot = document.getElementById('hg-stream-dot');
        const animRingBtn = document.getElementById('anim-ring-btn');
        const animHgBtn   = document.getElementById('anim-hg-btn');
        // ────────────────────────────────────────────────────────

=======
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
        function applyUILanguage(lang) {
            const s = UI_STRINGS[lang];
            modeTimerBtn.textContent    = s.timerBtn;
            modeAlarmBtn.textContent    = s.alarmBtn;
            modeSettingsBtn.textContent = s.settingsBtn;
            btnCancel.textContent       = s.cancel;
            alarmLabelEl.textContent    = s.alarmLabel;
<<<<<<< HEAD
=======
            // Update start button text only when a functional tab is active
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
            if (modeAlarmBtn.classList.contains('active')) {
                btnStart.textContent = s.setAlarm;
            } else if (!modeSettingsBtn.classList.contains('active')) {
                btnStart.textContent = s.startTimer;
            }
            langEnBtn.classList.toggle('active', lang === 'en');
            langSvBtn.classList.toggle('active', lang === 'sv');
<<<<<<< HEAD
            lastSec = -1;
        }

        // ── Apply animation style (ring or hourglass) ────────────
        function applyAnimStyle(style) {
            animStyle = style;
            try { localStorage.setItem('clock-anim', style); } catch (e) {}
            const isHg = style === 'hourglass';
            document.getElementById('clock-ring-svg').style.display = isHg ? 'none' : '';
            hgSvg.style.display = isHg ? '' : 'none';
            timeEl.classList.toggle('hg-time-small', isHg);
            if (animRingBtn) {
                animRingBtn.classList.toggle('active', !isHg);
                animHgBtn.classList.toggle('active', isHg);
            }
            lastSec       = -1;
            lastHour      = -1;
            hgInitialized = false;
        }
        // ────────────────────────────────────────────────────────

=======
            lastSec = -1; // force date re-render with new locale
        }

>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
        // Switch to Timer tab
        modeTimerBtn.addEventListener('click', () => {
            modeTimerBtn.classList.add('active');
            modeAlarmBtn.classList.remove('active');
            modeSettingsBtn.classList.remove('active');
            timerSection.style.display    = '';
            alarmSection.style.display    = 'none';
            settingsSection.style.display = 'none';
            btnStart.style.display = '';
            btnStart.textContent = UI_STRINGS[currentLang].startTimer;
        });

        // Switch to Alarm tab — pre-fill with current time
        modeAlarmBtn.addEventListener('click', () => {
            modeAlarmBtn.classList.add('active');
            modeTimerBtn.classList.remove('active');
            modeSettingsBtn.classList.remove('active');
            alarmSection.style.display    = '';
            timerSection.style.display    = 'none';
            settingsSection.style.display = 'none';
            btnStart.style.display = '';
            btnStart.textContent = UI_STRINGS[currentLang].setAlarm;
            const now = new Date();
            inAHr.value  = pad(now.getHours());
            inAMin.value = pad(now.getMinutes());
        });

        // Switch to Settings tab
        modeSettingsBtn.addEventListener('click', () => {
            modeSettingsBtn.classList.add('active');
            modeTimerBtn.classList.remove('active');
            modeAlarmBtn.classList.remove('active');
            settingsSection.style.display = '';
            timerSection.style.display    = 'none';
            alarmSection.style.display    = 'none';
            btnStart.style.display = 'none';
        });

        // Language selection
        langEnBtn.addEventListener('click', () => {
            currentLang = 'en';
            try { localStorage.setItem('clock-lang', 'en'); } catch (e) {}
            applyUILanguage('en');
        });
        langSvBtn.addEventListener('click', () => {
            currentLang = 'sv';
            try { localStorage.setItem('clock-lang', 'sv'); } catch (e) {}
            applyUILanguage('sv');
        });

<<<<<<< HEAD
        // Animation style selection
        if (animRingBtn) {
            animRingBtn.addEventListener('click', () => applyAnimStyle('ring'));
            animHgBtn.addEventListener('click',   () => applyAnimStyle('hourglass'));
        }

=======
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
        function renderTimeString(h, m, s) {
            const str = `${pad(h)}:${pad(m)}:${pad(s)}`;
            timeEl.innerHTML = str.split('').map(c =>
                c === ':' ? `<span class="clock-sep">:</span>` : `<span class="clock-digit">${c}</span>`
            ).join('');
        }

        timeEl.addEventListener('click', () => {
            if (isAlarming) {
<<<<<<< HEAD
                isAlarming    = false;
                isTimerMode   = false;
                alarmIsSet    = false;
                hgInitialized = false;
                lastHour      = -1;
=======
                isAlarming  = false;
                isTimerMode = false;
                alarmIsSet  = false;
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
                timeEl.classList.remove('clock-blink');
                alarmSound.pause();
                alarmSound.currentTime = 0;
                lastSec = -1;
                return;
            }
            if (isTimerMode || alarmIsSet) {
                // Cancel whatever is running
<<<<<<< HEAD
                isTimerMode   = false;
                alarmIsSet    = false;
                hgInitialized = false;
                lastHour      = -1;
                lastSec       = -1;
            } else {
=======
                isTimerMode = false;
                alarmIsSet  = false;
                lastSec = -1;
            } else {
                // If settings tab was last active, switch back to timer before opening
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
                if (modeSettingsBtn.classList.contains('active')) {
                    modeTimerBtn.click();
                }
                modal.classList.add('active');
            }
        });

        btnCancel.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        btnStart.addEventListener('click', () => {
            if (modeAlarmBtn.classList.contains('active')) {
                // --- Alarm mode ---
                alarmHour   = parseInt(inAHr.value  || 0);
                alarmMinute = parseInt(inAMin.value || 0);
                alarmIsSet  = true;
                isTimerMode = false;
                isAlarming  = false;
                lastSec     = -1;
            } else {
                // --- Timer mode ---
                const h = parseInt(inHr.value || 0);
                const m = parseInt(inMin.value || 0);
                const s = parseInt(inSec.value || 0);
                const total = (h * 3600 + m * 60 + s) * 1000;
                if (total > 0) {
                    timerTotalMs = total;
                    timerEndMs   = Date.now() + total;
                    isTimerMode  = true;
                    alarmIsSet   = false;
                    lastSec      = -1;
<<<<<<< HEAD

                    // Rotate hourglass to nearest upright position for timer mode.
                    // hgFlipCount must be even so isFlipped=false and the top bulb drains.
                    if (animStyle === 'hourglass') {
                        const targetFlips = Math.ceil(hgFlipCount / 2) * 2;
                        if (targetFlips !== hgFlipCount) {
                            hgFlipCount = targetFlips;
                            hgSvg.style.transform = `rotate(${hgFlipCount * 180}deg)`;
                        }
                        hgInitialized = true;
                        lastHour = -1;
                    }
=======
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
                }
            }
            modal.classList.remove('active');
        });

        [inHr, inMin, inSec].forEach(inp => {
            inp.addEventListener('blur', () => { inp.value = pad(parseInt(inp.value || 0)); });
        });

<<<<<<< HEAD
        applyUILanguage(currentLang);
        applyAnimStyle(animStyle);

        // ── Hourglass sand updater ───────────────────────────────
        // H = bulb height (waist y=0 to plate y=±H).
        // progress: 0 = top full / bottom empty, 1 = top empty / bottom full.
        //
        // Unflipped (hgFlipCount even, SVG upright):
        //   top sand occupies the LOWER portion of the top bulb (near waist),
        //   draining downward. Bottom sand fills from the waist up.
        //
        // Flipped (hgFlipCount odd, SVG rotated 180°):
        //   The SVG is rotated so local-bottom is visually at top.
        //   We swap the formulas so the visual effect is identical to unflipped:
        //   the visual top bulb (= local bottom) drains, visual bottom fills.
function updateHourglass(progress, timerMode) {
    const H = 240;
    progress = Math.max(0, Math.min(1, progress));
    const isFlipped = !timerMode && (hgFlipCount % 2 === 1);

    let topY, topH, botY, botH;
    let streamY, streamH;

// Non-linear mapping (Ease-in): Sand drops slowly at first, then speeds up exponentially.
    // You can increase the exponent from 3 to 4 or 5 for an even more dramatic drop at the end.
    const easeProgress = Math.pow(progress, 3);
    const remainingScale = 1 - easeProgress;
    const filledScale = easeProgress;

    if (!isFlipped) {
        // Local top drains
        topH = H * remainingScale;
        topY = -topH; // Anchored flush to the new smooth waist (y=0)
        
        // Local bottom fills
        botH = H * filledScale;
        botY = H - botH; // Anchored to bottom plate
        
        // Stream bridges the gap between bulbs
        streamY = -2; // Start slightly above the waist to visually overlap the top sand cone
        streamH = Math.max(0, botY - streamY);
    } else {
        // Flipped orientation logic (SVG is rotated 180deg)
        topH = H * filledScale;
        topY = -H;
        
        botH = H * remainingScale;
        botY = 0;
        
        streamY = Math.min(-2, topY + topH);
        streamH = Math.max(0, 2 - streamY); 
    }

    // Completely hide the stream thread in the final 0.1% so it doesn't look like a solid wire holding up nothing
    const isAlmostEmpty = (1 - progress) < 0.001;

    hgTopSand.setAttribute('y',      topY.toFixed(2));
    hgTopSand.setAttribute('height', Math.max(0, topH).toFixed(2));
    hgBotSand.setAttribute('y',      botY.toFixed(2));
    hgBotSand.setAttribute('height', Math.max(0, botH).toFixed(2));

    // Update the streaming thread
    hgStreamDot.setAttribute('y',      streamY.toFixed(2));
    hgStreamDot.setAttribute('height', isAlmostEmpty ? '0' : Math.max(0, streamH).toFixed(2));

    const flowing = progress > 0.001 && progress < 0.999 && !isAlarming && !isAlmostEmpty;
    hgStreamDot.classList.toggle('flowing', flowing);
}
        // ────────────────────────────────────────────────────────
=======
        // Apply persisted language on load
        applyUILanguage(currentLang);
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c

        function tick() {
            const nowTime = Date.now();
            const now = new Date(nowTime);

            if (!isTimerMode) {
                const h  = now.getHours();
                const m  = now.getMinutes();
                const s  = now.getSeconds();
                const ms = now.getMilliseconds();

<<<<<<< HEAD
                // ── Ring arc ──
=======
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
                const frac = (s + ms / 1000) / 60;
                if (m % 2 === 0) {
                    arc.style.strokeDashoffset = circumference * (1 - frac);
                } else {
                    arc.style.strokeDashoffset = -circumference * frac;
                }

<<<<<<< HEAD
                // ── Hourglass (clock mode) ──
                if (animStyle === 'hourglass') {
                    if (!hgInitialized) {
                        // On first render, set flip state based on current hour parity.
                        // Even hours → upright (0°), odd hours → inverted (180°).
                        hgFlipCount = h % 2;
                        hgSvg.style.transition = 'none';
                        hgSvg.style.transform  = `rotate(${hgFlipCount * 180}deg)`;
                        // Re-enable transition after the initial snap
                        requestAnimationFrame(() => {
                            hgSvg.style.transition = 'transform 0.85s cubic-bezier(0.25, 1, 0.5, 1)';
                        });
                        hgInitialized = true;
                        lastHour = h;
                    } else if (h !== lastHour) {
                        // New hour: flip the hourglass
                        hgFlipCount++;
                        hgSvg.style.transform = `rotate(${hgFlipCount * 180}deg)`;
                        lastHour = h;
                    }
                    // Smooth sub-second progress within the current hour
                    const hourProgress = (m * 60 + s + ms / 1000) / 3600;
                    updateHourglass(hourProgress, false);
                }

=======
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
                if (s !== lastSec) {
                    lastSec = s;
                    renderTimeString(h, m, s);

                    // Check if alarm should fire
                    if (alarmIsSet && !isAlarming && h === alarmHour && m === alarmMinute) {
                        alarmIsSet = false;
                        isAlarming = true;
                        timeEl.classList.add('clock-blink');
                        playRandomAlarmSound();
                    }

                    if (alarmIsSet) {
                        dateEl.textContent = `ALARM ${pad(alarmHour)}:${pad(alarmMinute)}`;
                    } else {
                        if (currentLang === 'sv') {
                            const week = getISOWeek(now);
                            dateEl.textContent = `${DAYS_SV[now.getDay()]}, Vecka ${week}, ${now.getDate()} ${MONTHS_SV[now.getMonth()]} ${now.getFullYear()}`;
                        } else {
                            dateEl.textContent = `${DAYS[now.getDay()]}, ${ordinal(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
                        }
                    }
                }

            } else {
<<<<<<< HEAD
                // ── Timer mode ──
                if (isAlarming) {
                    arc.style.strokeDashoffset = circumference;
                    if (animStyle === 'hourglass') {
                        updateHourglass(1, true);
                    }
=======
                if (isAlarming) {
                    arc.style.strokeDashoffset = circumference;
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
                } else {
                    let remaining = timerEndMs - nowTime;

                    if (remaining <= 0) {
<<<<<<< HEAD
                        remaining  = 0;
=======
                        remaining = 0;
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
                        isAlarming = true;
                        timeEl.classList.add('clock-blink');
                        playRandomAlarmSound();
                    }

                    const frac = remaining / timerTotalMs;
                    arc.style.strokeDashoffset = circumference * (1 - frac);

<<<<<<< HEAD
                    // ── Hourglass (timer mode) ──
                    if (animStyle === 'hourglass') {
                        updateHourglass(1 - frac, true);
                    }

=======
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
                    const totalSecs = Math.ceil(remaining / 1000);
                    if (totalSecs !== lastSec) {
                        lastSec = totalSecs;
                        const h = Math.floor(totalSecs / 3600);
                        const m = Math.floor((totalSecs % 3600) / 60);
                        const s = totalSecs % 60;
                        renderTimeString(h, m, s);
                        dateEl.textContent = UI_STRINGS[currentLang].timerActive;
                    }
                }
            }

            requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    })();
