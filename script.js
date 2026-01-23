// Firebase Yapılandırması
const firebaseConfig = {
    apiKey: "AIzaSyCfcppc4rGYxmAj7fTzmYMZgcyBO4s8bFI",
    databaseURL: "https://doviz-kurlari-35554-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "doviz-kurlari-35554"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let liveRates = {};
const mappings = { 'a':'ALIŞ', 's':'SATIŞ', 'u':'USD', 'e':'EUR', 'g':'GBP', 'xg':'GRAM', 'xc':'ÇEYREK' };
let activeRowId = null;

// Ses Efektleri
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, type, dur) {
    if(!document.getElementById('sound-toggle').checked) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}

const sfx = {
    error: () => playTone(150, 'sawtooth', 0.3),
    success: () => playTone(800, 'sine', 0.1),
    type: () => playTone(600, 'triangle', 0.05),
    save: () => { playTone(400, 'square', 0.1); setTimeout(()=>playTone(600, 'square', 0.1), 100); }
};

// UI Yardımcıları
function showToast(msg, type='info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', error: 'fa-exclamation-triangle' };
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas ${icons[type]} text-lg"></i> <span>${msg}</span>`;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    if(type === 'success') sfx.success();
    if(type === 'error') sfx.error();
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
    addLog(msg, type);
}

const genTicket = () => "TX-" + Math.floor(1000 + Math.random() * 9000);

function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const colors = { info: 'text-zinc-600', success: 'text-green-500', error: 'text-red-500', sys: 'text-amber-500' };
    const entry = `<div class="p-1 border-b border-zinc-900">[${time}] <span class="${colors[type]}">[${type.toUpperCase()}]</span> ${msg}</div>`;
    document.getElementById('log-terminal').insertAdjacentHTML('beforeend', entry);
}

// Veri Yönetimi
function saveToLocal() {
    const rows = [];
    document.querySelectorAll('.ledger-row').forEach(r => {
        rows.push({
            ticket: r.dataset.ticket,
            vz: r.querySelector('.in-vz').value,
            type: r.querySelector('.in-type').value,
            code: r.querySelector('.in-code').value,
            qty: r.querySelector('.in-qty').value,
            price: r.querySelector('.in-price').value
        });
    });
    localStorage.setItem('terminal_ledger', JSON.stringify(rows));
    document.getElementById('empty-state').style.opacity = rows.length ? '0' : '1';
}

function loadFromLocal() {
    const saved = localStorage.getItem('terminal_ledger');
    if (saved) {
        const rows = JSON.parse(saved);
        if(rows.length > 0) {
            rows.reverse().forEach(data => {
                const id = 'r' + Math.random().toString(36).substr(2, 9);
                renderRow(id, data.ticket, data);
            });
            updateVaults();
        } else { addRow(); }
    } else {
        addRow();
    }
}

// Canlı Veri Akışı
db.ref('terminal_data/currencies').on('value', snap => {
    if(snap.exists()) {
        const data = snap.val();
        const qu = document.getElementById('quick-unit-grid');
        qu.innerHTML = '';
        const arr = Array.isArray(data) ? data : Object.values(data);
        let tickerHtml = '';
        arr.forEach(i => {
            if(!i) return;
            const n = i.name.toUpperCase();
            liveRates[n] = i;
            qu.insertAdjacentHTML('beforeend', `<button onclick="setFastUnit('${n}')" class="bg-zinc-900 border border-zinc-800 p-2 rounded text-[9px] font-black hover:border-amber-500 uppercase transition">${n}</button>`);
            const changeClass = Math.random() > 0.5 ? 'ticker-up' : 'ticker-down';
            const icon = changeClass === 'ticker-up' ? '▲' : '▼';
            tickerHtml += `<span class="ticker-item">${n}: <span class="text-white">${i.sell}</span> <span class="${changeClass}">${icon}</span></span>`;
        });
        document.getElementById('ticker-content').innerHTML = tickerHtml;
        updateVaults();
    }
});

// Satır İşlemleri
function renderRow(id, ticket, savedData = null) {
    const div = document.createElement('div');
    div.id = id;
    div.dataset.ticket = ticket;
    div.className = 'ledger-row grid grid-cols-12 gap-3 p-3 items-center';
    div.onclick = () => focusRow(id);
    div.innerHTML = `
        <div class="col-span-1 text-[10px] mono text-zinc-600 font-black text-center">${ticket}</div>
        <div class="col-span-1"><input type="text" class="input-master in-vz mono font-black text-xs w-full" value="${savedData?.vz || '1'}"></div>
        <div class="col-span-2"><input type="text" class="input-master in-type uppercase font-black text-xs w-full" value="${savedData?.type || ''}" placeholder="A/S"></div>
        <div class="col-span-2"><input type="text" class="input-master in-code uppercase font-bold text-xs w-full" value="${savedData?.code || ''}" placeholder="KOD"></div>
        <div class="col-span-2"><input type="number" class="input-master in-qty text-right font-black text-amber-500 text-xs w-full" value="${savedData?.qty || ''}" placeholder="0.00"></div>
        <div class="col-span-2"><input type="number" class="input-master in-price text-right font-bold text-xs w-full" value="${savedData?.price || ''}" placeholder="0.00"></div>
        <div class="col-span-2 text-right pr-4 font-black mono text-lg in-total text-white">0,00</div>
    `;
    document.getElementById('ledger').prepend(div);
    initInputs(div);
    if (!savedData) setTimeout(() => focusRow(id), 50);
}

function addRow() {
    renderRow('r' + Date.now(), genTicket());
}

function initInputs(row) {
    const ins = { 
        vz: row.querySelector('.in-vz'), 
        t: row.querySelector('.in-type'), 
        c: row.querySelector('.in-code'), 
        q: row.querySelector('.in-qty'), 
        p: row.querySelector('.in-price'), 
        tot: row.querySelector('.in-total') 
    };
    
    const calc = () => {
        const res = (parseFloat(ins.q.value) || 0) * (parseFloat(ins.p.value) || 0);
        ins.tot.innerText = res.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
        updateVaults();
        saveToLocal();
    };

    [ins.vz, ins.t, ins.c, ins.q, ins.p].forEach((el, index, array) => {
        el.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (index < array.length - 1) array[index + 1].focus();
                else addRow();
            }
        });
        el.addEventListener('keydown', () => sfx.type());
    });

    ins.t.addEventListener('input', e => {
        const v = e.target.value.toLowerCase();
        if(mappings[v]) { 
            e.target.value = mappings[v]; 
            e.target.style.color = v==='a'?'#ef4444':'#10b981'; 
            ins.c.focus(); 
        }
        calc();
    });

    ins.c.addEventListener('input', e => {
        let v = e.target.value.toLowerCase() === 'u' ? 'USD' : (e.target.value.toLowerCase() === 'e' ? 'EUR' : e.target.value.toUpperCase());
        if(liveRates[v]) { 
            ins.c.value = v; 
            ins.p.value = ins.t.value === 'ALIŞ' ? liveRates[v].buy : liveRates[v].sell; 
            ins.q.focus(); 
        }
        calc();
    });

    [ins.q, ins.p, ins.vz].forEach(el => el.addEventListener('input', calc));
}

// Kasa ve İstatistik Güncelleme
function updateVaults() {
    let stats = { tl: 0, usd: 0, eur: 0, profit: 0 };
    document.querySelectorAll('.ledger-row').forEach(r => {
        const t = r.querySelector('.in-type').value, 
              c = r.querySelector('.in-code').value.toUpperCase(),
              q = parseFloat(r.querySelector('.in-qty').value) || 0, 
              p = parseFloat(r.querySelector('.in-price').value) || 0, 
              amt = q * p;
        if(!t || !c || q === 0) return;
        if(t === 'ALIŞ') { 
            stats.tl -= amt; 
            if(c==='USD') stats.usd += q; 
            if(c==='EUR') stats.eur += q; 
            if(liveRates[c]) { 
                const marketMid = (parseFloat(liveRates[c].buy) + parseFloat(liveRates[c].sell)) / 2; 
                stats.profit += (marketMid - p) * q; 
            }
        }
        else if(t === 'SATIŞ') { 
            stats.tl += amt; 
            if(c==='USD') stats.usd -= q; 
            if(c==='EUR') stats.eur -= q; 
            if(liveRates[c]) { 
                const marketMid = (parseFloat(liveRates[c].buy) + parseFloat(liveRates[c].sell)) / 2; 
                stats.profit += (p - marketMid) * q; 
            }
        }
    });
    document.getElementById('v-tl').innerText = stats.tl.toLocaleString('tr-TR', {minimumFractionDigits:2}) + " ₺";
    document.getElementById('v-profit').innerText = stats.profit.toLocaleString('tr-TR', {minimumFractionDigits:2}) + " ₺";
    document.getElementById('v-usd').innerText = stats.usd.toLocaleString('tr-TR');
    document.getElementById('v-eur').innerText = stats.eur.toLocaleString('tr-TR');
    
    // Bar güncellemeleri
    const maxStock = 10000;
    document.getElementById('bar-usd').style.width = Math.min((stats.usd / maxStock)*100, 100) + '%';
    document.getElementById('bar-eur').style.width = Math.min((stats.eur / maxStock)*100, 100) + '%';
    
    document.getElementById('v-profit').className = stats.profit >= 0 ? "text-3xl font-black mono text-emerald-400" : "text-3xl font-black mono text-red-500";
}

// Diğer Fonksiyonlar
function toggleCalc() {
    const m = document.getElementById('calc-modal');
    m.style.display = m.style.display === 'block' ? 'none' : 'block';
}

function calcInput(v) {
    const s = document.getElementById('calc-screen');
    if(v === 'C') s.innerText = '0';
    else if(v === '=') { try { s.innerText = eval(s.innerText); } catch { s.innerText = 'Err'; sfx.error(); } }
    else { if(s.innerText === '0') s.innerText = v; else s.innerText += v; }
}

function openTab(id) { 
    document.querySelectorAll('.sidebar-content').forEach(p => p.classList.remove('active')); 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
    document.getElementById(id + '-panel').classList.add('active'); 
    document.getElementById('tab-' + id).classList.add('active'); 
}

function generateReceipt() {
    const items = [];
    let total = 0;
    document.querySelectorAll('.ledger-row').forEach(r => {
        const t = r.querySelector('.in-type').value, c = r.querySelector('.in-code').value, 
              q = r.querySelector('.in-qty').value, p = r.querySelector('.in-price').value, tot = r.querySelector('.in-total').innerText;
        if(q > 0) { 
            items.push(`<div class="flex justify-between"><span><b>${t}</b> ${q} ${c}</span><span>${tot} TL</span></div>`); 
            total += (parseFloat(q) * parseFloat(p)); 
        }
    });
    if(items.length === 0) { showToast("Fiş için işlem girin.", "error"); return; }
    document.getElementById('r-date').innerText = new Date().toLocaleString();
    document.getElementById('r-items').innerHTML = items.join('<div class="border-b border-zinc-100 my-1"></div>');
    document.getElementById('r-total').innerText = total.toLocaleString('tr-TR', {minimumFractionDigits:2}) + " TL";
    document.getElementById('receipt-modal').style.display = 'flex';
}

function closeReceipt() { document.getElementById('receipt-modal').style.display = 'none'; }

// Başlatma
setInterval(() => { document.getElementById('clock').innerText = new Date().toLocaleTimeString(); }, 1000);
window.onload = loadFromLocal;

// Klavye Kısayolları
window.addEventListener('keydown', e => {
    if(e.key === 'F2') { e.preventDefault(); addRow(); }
    if(e.key === 'F5') { e.preventDefault(); generateReceipt(); }
    if(e.key === 'F9') { e.preventDefault(); toggleCalc(); }
    if(e.key === 'Escape') { closeReceipt(); document.getElementById('calc-modal').style.display='none'; }
});
