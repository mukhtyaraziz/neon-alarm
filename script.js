// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.error('Service Worker registration failed', err));
    });
}

// --- State ---
let alarms = JSON.parse(localStorage.getItem('alarms')) || [];
let isAlarmRinging = false;
let activeAlarmId = null;

// --- Web Audio API Setup ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let alarmInterval = null;

function playAlarmSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const pulse = (time) => {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc1.type = 'square';
        osc2.type = 'square';
        
        // Piercing frequency characteristic of digital alarm buzers
        osc1.frequency.setValueAtTime(2048, time);
        osc2.frequency.setValueAtTime(2056, time); // Slightly detuned for resonance effect

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.08, time + 0.01);
        gain.gain.setValueAtTime(0.08, time + 0.08);
        gain.gain.linearRampToValueAtTime(0, time + 0.1);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + 0.1);
        osc2.stop(time + 0.1);
    };

    const triggerPattern = () => {
        const now = audioCtx.currentTime;
        // Classic Digital Alert Pattern: 4 quick pulses
        pulse(now);
        pulse(now + 0.15);
        pulse(now + 0.3);
        pulse(now + 0.45);
    };

    triggerPattern();
    alarmInterval = setInterval(triggerPattern, 1000);
}

function stopAlarmSound() {
    clearInterval(alarmInterval);
    alarmInterval = null;
}

// --- Clock Logic ---
function updateTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    const displayHours = hours % 12 || 12;
    const hourStr = String(displayHours).padStart(2, '0');
    
    document.getElementById('clock').innerHTML = `${hourStr}:${minutes}:${seconds}<span class="ampm-display">${ampm}</span>`;
    
    // Date Display
    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    document.getElementById('dateDisplay').textContent = now.toLocaleDateString('en-US', options).replace(',', ' •');

    if (isAlarmRinging) {
        document.getElementById('triggerClock').textContent = `${hourStr}:${minutes}:${seconds}`;
    }

    checkAlarms(hourStr, minutes, seconds, ampm);
}

function checkAlarms(h, m, s, p) {
    if (isAlarmRinging || s !== "00") return;

    alarms.forEach(alarm => {
        if (alarm.enabled && alarm.hour === h && alarm.minute === m && alarm.ampm === p) {
            triggerAlarm(alarm);
        }
    });
}

function triggerAlarm(alarm) {
    isAlarmRinging = true;
    activeAlarmId = alarm.id;
    document.getElementById('triggerOverlay').classList.add('active');
    document.body.classList.add('alarm-ringing');
    playAlarmSound();
}

function dismissAlarm() {
    isAlarmRinging = false;
    activeAlarmId = null;
    document.getElementById('triggerOverlay').classList.remove('active');
    document.body.classList.remove('alarm-ringing');
    stopAlarmSound();
}

function snoozeAlarm() {
    const now = new Date();
    const snoozeTime = new Date(now.getTime() + 5 * 60000); // 5 mins later
    
    let hours = snoozeTime.getHours();
    const minutes = String(snoozeTime.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = String(hours % 12 || 12).padStart(2, '0');
    
    const snoozeEntry = { 
        id: 's-' + Date.now(), 
        hour: displayHours, 
        minute: minutes, 
        ampm: ampm, 
        enabled: true,
        meta: 'Snooze'
    };
    
    alarms.push(snoozeEntry);
    dismissAlarm();
    renderAlarms();
}

// --- Alarm Management ---
function renderAlarms() {
    const list = document.getElementById('alarmsList');
    const label = document.getElementById('alarmCountLabel');
    if (!list || !label) return;
    
    list.innerHTML = '';

    const activeAlarmsCount = alarms.filter(a => a.enabled).length;
    label.textContent = `Active Alarms (${activeAlarmsCount})`;

    // Status Update
    const sortedAlarms = [...alarms].filter(a => a.enabled).sort((a, b) => {
        const hA = (parseInt(a.hour) % 12) + (a.ampm === 'PM' ? 12 : 0);
        const hB = (parseInt(b.hour) % 12) + (b.ampm === 'PM' ? 12 : 0);
        if (hA !== hB) return hA - hB;
        return parseInt(a.minute) - parseInt(b.minute);
    });
    const nextAlarm = sortedAlarms[0];
    const nextAlarmStatus = document.getElementById('nextAlarmStatus');
    if (nextAlarmStatus) {
        nextAlarmStatus.textContent = nextAlarm ? `${nextAlarm.hour}:${nextAlarm.minute} ${nextAlarm.ampm}` : 'None';
    }

    if (alarms.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-dim); font-size: 12px; padding: 2rem;">No alarms queued</div>`;
        return;
    }

    alarms.sort((a, b) => {
        const hA = (parseInt(a.hour) % 12) + (a.ampm === 'PM' ? 12 : 0);
        const hB = (parseInt(b.hour) % 12) + (b.ampm === 'PM' ? 12 : 0);
        if (hA !== hB) return hA - hB;
        return parseInt(a.minute) - parseInt(b.minute);
    }).forEach(alarm => {
        const item = document.createElement('div');
        item.className = 'alarm-card';
        if (!alarm.enabled) item.style.opacity = '0.5';
        item.innerHTML = `
            <div class="alarm-info">
                <div class="alarm-time">${alarm.hour}:${alarm.minute} ${alarm.ampm}</div>
                <div class="alarm-meta">${alarm.meta || 'Daily'} • Trigger: ${alarm.enabled ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div class="alarm-actions">
                <label class="switch">
                    <input type="checkbox" ${alarm.enabled ? 'checked' : ''} onchange="toggleAlarm('${alarm.id}')">
                    <span class="slider"></span>
                </label>
                <button class="btn-delete" onclick="deleteAlarm('${alarm.id}')">Remove</button>
            </div>
        `;
        list.appendChild(item);
    });

    localStorage.setItem('alarms', JSON.stringify(alarms));
}

function addAlarm() {
    let h = document.getElementById('hourInput').value;
    let m = document.getElementById('minuteInput').value;
    const p = document.getElementById('ampmInput').value;

    if (!h || !m) return;
    h = String(parseInt(h)).padStart(2, '0');
    m = String(parseInt(m)).padStart(2, '0');

    if (parseInt(h) < 1 || parseInt(h) > 12 || parseInt(m) < 0 || parseInt(m) > 59) return;

    const newAlarm = { id: Date.now().toString(), hour: h, minute: m, ampm: p, enabled: true };
    alarms.push(newAlarm);
    renderAlarms();
}

window.toggleAlarm = function(id) {
    const alarm = alarms.find(a => a.id === id);
    if (alarm) {
        alarm.enabled = !alarm.enabled;
        renderAlarms();
    }
};

window.deleteAlarm = function(id) {
    alarms = alarms.filter(a => a.id !== id);
    renderAlarms();
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    const setAlarmBtn = document.getElementById('setAlarmBtn');
    const dismissBtn = document.getElementById('dismissBtn');
    const snoozeBtn = document.getElementById('snoozeBtn');
    const hourInput = document.getElementById('hourInput');
    const minuteInput = document.getElementById('minuteInput');

    if (setAlarmBtn) setAlarmBtn.onclick = addAlarm;
    if (dismissBtn) dismissBtn.onclick = dismissAlarm;
    if (snoozeBtn) snoozeBtn.onclick = snoozeAlarm;

    const enforcePadding = (el) => {
        if (!el) return;
        el.onblur = () => { if (el.value) el.value = String(parseInt(el.value)).padStart(2, '0'); };
    };
    enforcePadding(hourInput);
    enforcePadding(minuteInput);

    setInterval(updateTime, 1000);
    updateTime();
    renderAlarms();

    document.body.addEventListener('click', () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }, { once: true });
});
