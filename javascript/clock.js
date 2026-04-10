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

        const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
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
        const tzEl = document.getElementById('clock-timezone');
        
        let lastSec = -1;
        tzEl.textContent = tzLabel();

        let isTimerMode = false;
        let isAlarming = false;
        let timerEndMs = 0;
        let timerTotalMs = 0;

        // Alarm state
        let alarmIsSet = false;
        let alarmHour = -1;
        let alarmMinute = -1;

        const modal = document.getElementById('timer-modal');
        const btnStart = document.getElementById('btn-start');
        const btnCancel = document.getElementById('btn-cancel');
        const inHr = document.getElementById('t-hr');
        const inMin = document.getElementById('t-min');
        const inSec = document.getElementById('t-sec');
        const alarmSound = document.getElementById('alarm-sound');


        // List of available alarm sounds (edit paths to match your actual files)
        const alarmSoundList = [
            '/audio/mp3/timer_alarm_1.mp3',      // keep original as fallback
            '/audio/mp3/timer_alarm_2.mp3',
            '/audio/mp3/timer_alarm_3.mp3'
        ];

        function playRandomAlarmSound() {
            const randomIndex = Math.floor(Math.random() * alarmSoundList.length);
            const selectedSound = alarmSoundList[randomIndex];
            alarmSound.src = selectedSound;
            alarmSound.load();                  // optional but ensures new src is ready
            alarmSound.play().catch(e => console.log("Audio play prevented:", e));
        }


        
        // Mode tab elements
        const modeTimerBtn = document.getElementById('mode-timer-btn');
        const modeAlarmBtn = document.getElementById('mode-alarm-btn');
        const timerSection = document.getElementById('timer-section');
        const alarmSection = document.getElementById('alarm-section');
        const inAHr = document.getElementById('a-hr');
        const inAMin = document.getElementById('a-min');

        // Switch to Timer tab
        modeTimerBtn.addEventListener('click', () => {
            modeTimerBtn.classList.add('active');
            modeAlarmBtn.classList.remove('active');
            timerSection.style.display = '';
            alarmSection.style.display = 'none';
            btnStart.textContent = 'Start Timer';
        });

        // Switch to Alarm tab — pre-fill with current time
        modeAlarmBtn.addEventListener('click', () => {
            modeAlarmBtn.classList.add('active');
            modeTimerBtn.classList.remove('active');
            alarmSection.style.display = '';
            timerSection.style.display = 'none';
            btnStart.textContent = 'Set Alarm';
            const now = new Date();
            inAHr.value = pad(now.getHours());
            inAMin.value = pad(now.getMinutes());
        });

        function renderTimeString(h, m, s) {
            const str = `${pad(h)}:${pad(m)}:${pad(s)}`;
            timeEl.innerHTML = str.split('').map(c =>
                c === ':' ? `<span class="clock-sep">:</span>` : `<span class="clock-digit">${c}</span>`
            ).join('');
        }

        timeEl.addEventListener('click', () => {
            if (isAlarming) {
                isAlarming = false;
                isTimerMode = false;
                alarmIsSet = false;
                timeEl.classList.remove('clock-blink');
                alarmSound.pause();
                alarmSound.currentTime = 0;
                lastSec = -1; 
                return;
            }
            if (isTimerMode || alarmIsSet) {
                // Cancel whatever is running
                isTimerMode = false;
                alarmIsSet = false;
                lastSec = -1;
            } else {
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
                }
            }
            modal.classList.remove('active');
        });

        [inHr, inMin, inSec].forEach(inp => {
            inp.addEventListener('blur', () => { inp.value = pad(parseInt(inp.value || 0)); });
        });

        function tick() {
            const nowTime = Date.now();
            const now = new Date(nowTime);

            if (!isTimerMode) {
                const h = now.getHours();
                const m = now.getMinutes();
                const s = now.getSeconds();
                const ms = now.getMilliseconds();

                const frac = (s + ms / 1000) / 60;
                if (m % 2 === 0) {
                    arc.style.strokeDashoffset = circumference * (1 - frac);
                } else {
                    arc.style.strokeDashoffset = -circumference * frac;
                }

                if (s !== lastSec) {
                    lastSec = s;
                    renderTimeString(h, m, s);

                    // Check if alarm should fire
                    if (alarmIsSet && !isAlarming && h === alarmHour && m === alarmMinute) {
                        alarmIsSet = false;
                        isAlarming = true;
                        timeEl.classList.add('clock-blink');
                        playRandomAlarmSound();   // <-- changed
                    }

                    if (alarmIsSet) {
                        dateEl.textContent = `ALARM ${pad(alarmHour)}:${pad(alarmMinute)}`;
                    } else {
                        dateEl.textContent = `${DAYS[now.getDay()]}, ${ordinal(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
                    }
                }

            } else {
                if (isAlarming) {
                    arc.style.strokeDashoffset = circumference; 
                } else {
                    let remaining = timerEndMs - nowTime;
                    
                    if (remaining <= 0) {
                        remaining = 0;
                        isAlarming = true;
                        timeEl.classList.add('clock-blink');
                        playRandomAlarmSound();   // <-- changed
                    }

                    const frac = remaining / timerTotalMs;
                    arc.style.strokeDashoffset = circumference * (1 - frac);

                    const totalSecs = Math.ceil(remaining / 1000);
                    if (totalSecs !== lastSec) {
                        lastSec = totalSecs;
                        const h = Math.floor(totalSecs / 3600);
                        const m = Math.floor((totalSecs % 3600) / 60);
                        const s = totalSecs % 60;
                        renderTimeString(h, m, s);
                        dateEl.textContent = "TIMER ACTIVE"; 
                    }
                }
            }

            requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    })();