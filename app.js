// ===== AI asistent Bizzmo - totem kviz (1080x1920) =====
// Tok: [setup lokacije, samo prvi put] -> Slajd 1 (podaci) -> Slajd 2 (pitanje)
//      -> označi točan/netočan -> Zahvala -> nakon 8 s natrag na Slajd 1.

var DEVICE_LOCATION = '';
try { DEVICE_LOCATION = localStorage.getItem('bizzmo_location') || 'PREGLED'; } catch (e) {}
// Installer predaje lokaciju u linku (index.html?lokacija=ZAGREB) - ima
// prednost pred spremljenom, pa ponovni INSTALL.bat mijenja lokaciju.
(function() {
  var fromUrl = '';
  try { fromUrl = (new URLSearchParams(location.search).get('lokacija') || '').trim().toUpperCase(); } catch (e) {}
  if (fromUrl) {
    DEVICE_LOCATION = fromUrl;
    try { localStorage.setItem('bizzmo_location', fromUrl); } catch (e) {}
  }
})();

// ===== CANVAS: fiksni dizajn 1080x1920, skaliran u stvarni ekran =====
function fitCanvas() {
  var vw = window.innerWidth, vh = window.innerHeight;
  var scale = Math.min(vw / 1080, vh / 1920);
  var app = document.getElementById('app');
  app.style.transform = 'translate(' + (vw - 1080 * scale) / 2 + 'px,' + (vh - 1920 * scale) / 2 + 'px) scale(' + scale + ')';
  app._scale = scale;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// ===== EKRANI =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  var el = document.getElementById(id);
  void el.offsetWidth;
  el.classList.add('active');
  document.getElementById('t-logo').classList.toggle('t-logo-hidden', id === 'screen-setup');

  // Video se vrti samo na ekranu mirovanja (štedi slabi totem), uvijek od početka
  var video = document.getElementById('attract-video');
  if (id === 'screen-attract') {
    try { video.currentTime = 0; } catch (e) {}
    var p = video.play();
    if (p && p.catch) p.catch(function() {});
  } else {
    video.pause();
  }
}

// ===== VIDEO KROZ CANVAS =====
// <video> preglednik iscrtava hardverskim putem (overlay) s drukčijom
// pretvorbom boja od CSS-a, pa ista magenta izgleda kao dvije nijanse.
// Zato se svaka slika videa crta u canvas (1920x1080) - canvas i CSS idu
// istim putem boja, pa je pozadina videa identična pozadini appa.
(function videoToCanvas() {
  var video = document.getElementById('attract-video');
  var canvas = document.getElementById('attract-canvas');
  var ctx = canvas.getContext('2d', { alpha: false });
  var sampled = false;

  function paintBg() {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--magenta') || '#E20073';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  paintBg();

  // Ako preglednik dopusti (http/https), izmjeri točnu boju pozadine videa i
  // postavi je kao magentu appa. Na file:// (totem) nije dopušteno - tada
  // ostaje #E20073 iz style.css, što je ista dekodirana vrijednost.
  function sample() {
    sampled = true;
    try {
      var d = ctx.getImageData(960, 6, 1, 1).data;
      if (d[0] > 180 && d[1] < 50 && d[2] > 70 && d[2] < 160) {
        document.documentElement.style.setProperty('--magenta',
          '#' + [d[0], d[1], d[2]].map(function(n) { return ('0' + n.toString(16)).slice(-2); }).join(''));
      }
    } catch (e) { /* file:// - ostaje boja iz CSS-a */ }
  }

  function draw() {
    if (video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (!sampled) sample();
    }
  }

  var useVfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  function loop() {
    var active = document.getElementById('screen-attract').classList.contains('active');
    if (active) draw();
    if (useVfc && active && !video.paused) video.requestVideoFrameCallback(loop);
    else requestAnimationFrame(loop);
  }
  loop();
})();

function startFromAttract() {
  showScreen('screen-registration');
  // Brži tok: tipkovnica se odmah otvori na "Ime i prezime"
  showKeyboard(document.getElementById('reg-name'));
  startInactivityTimer();
}

function saveSetupLocation() {
  var loc = document.getElementById('setup-input').value.trim().toUpperCase();
  if (!loc) return;
  try { localStorage.setItem('bizzmo_location', loc); } catch (e) {}
  DEVICE_LOCATION = loc;
  hideKeyboard();
  goToStart();
}

// ===== STANJE =====
var selectedAnswer = '';
var answerLocked = false;
var activeInput = null;
var shiftActive = false;
var keyboardMode = 'alpha';

// ===== TIPKOVNICA =====
var KEYS_ALPHA = [
  ['Q','W','E','R','T','Z','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['shift','Y','X','C','V','B','N','M','backspace'],
  ['123','-','space','.','done']
];
var KEYS_EMAIL_ROW4 = ['123','@','.','-','_','.hr','.com','done'];
var KEYS_NUM = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['@','.','-','_','+','/','(',')','!','?'],
  ['ABC','space','backspace'],
  ['done']
];
var DIACRITICS = {
  'C': ['Č','Ć'], 'c': ['č','ć'], 'S': ['Š'], 's': ['š'],
  'Z': ['Ž'], 'z': ['ž'], 'D': ['Đ'], 'd': ['đ']
};
var LABELS = { space: 'RAZMAK', backspace: '⌫', done: 'OK', shift: '⇧', '123': '123', ABC: 'ABC' };
var longPressTimer = null;
var longPressFired = false;

function isWordStart(input) {
  var v = input.value;
  return v.length === 0 || /\s$/.test(v);
}

function buildKeyboard(mode) {
  keyboardMode = mode;
  var isEmail = activeInput && activeInput.id === 'reg-email';
  var rows = mode === 'num' ? KEYS_NUM : KEYS_ALPHA.slice(0, 3).concat([isEmail ? KEYS_EMAIL_ROW4 : KEYS_ALPHA[3]]);
  var autoCap = mode === 'alpha' && activeInput && activeInput.id === 'reg-name' && isWordStart(activeInput);
  var upper = !isEmail && (shiftActive || autoCap || (activeInput && activeInput.id === 'setup-input'));

  rows.forEach(function(row, i) {
    var rowEl = document.getElementById('kb-row-' + (i + 1));
    rowEl.innerHTML = '';
    row.forEach(function(key) {
      var btn = document.createElement('button');
      btn.type = 'button';
      var special = LABELS.hasOwnProperty(key) && key !== '.' ;
      var ch = key;
      if (!special && key.length === 1 && /\p{L}/u.test(key)) ch = upper ? key.toUpperCase() : key.toLowerCase();
      btn.className = 'kb-key' + (special ? ' kb-' + key.replace('123', 'num').replace('ABC', 'abc') : '') + (key.length > 2 && key.charAt(0) === '.' ? ' kb-domain' : '');
      if (key === 'shift' && upper) btn.className += ' active';
      btn.textContent = special ? LABELS[key] : ch;

      btn.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        btn.classList.add('kb-pressed');
        longPressFired = false;
        if (!special && !isEmail && DIACRITICS[ch]) {
          longPressTimer = setTimeout(function() { longPressFired = true; showDiacritics(btn, DIACRITICS[ch]); }, 400);
        }
      });
      btn.addEventListener('pointerup', function(e) {
        e.preventDefault();
        btn.classList.remove('kb-pressed');
        clearTimeout(longPressTimer);
        if (longPressFired) return;
        if (key === 'shift') { shiftActive = !shiftActive; buildKeyboard('alpha'); }
        else if (key === '123') buildKeyboard('num');
        else if (key === 'ABC') buildKeyboard('alpha');
        else if (key === 'done') advanceField();
        else if (key === 'space') typeKey(' ');
        else typeKey(key === 'backspace' ? 'backspace' : ch);
      });
      btn.addEventListener('pointerleave', function() { btn.classList.remove('kb-pressed'); clearTimeout(longPressTimer); });
      rowEl.appendChild(btn);
    });
  });
  document.getElementById('kb-row-4').style.display = '';
}

function showDiacritics(btn, variants) {
  closeDiacritics();
  var pop = document.createElement('div');
  pop.className = 'kb-diacritic-popup';
  pop.id = 'kb-diacritic-popup';
  variants.forEach(function(v) {
    var o = document.createElement('button');
    o.type = 'button';
    o.className = 'kb-diacritic-option';
    o.textContent = v;
    o.addEventListener('pointerdown', function(e) { e.preventDefault(); e.stopPropagation(); typeKey(v); closeDiacritics(); });
    pop.appendChild(o);
  });
  btn.appendChild(pop);
}
function closeDiacritics() {
  var p = document.getElementById('kb-diacritic-popup');
  if (p) p.remove();
}
document.addEventListener('pointerdown', function(e) {
  if (!e.target.closest('.kb-diacritic-popup') && !e.target.closest('.kb-key')) closeDiacritics();
});

function autoCapitalizeWords(v) {
  return v.replace(/(^|\s)(\p{L})/gu, function(m, b, l) { return b + l.toUpperCase(); });
}

function typeKey(key) {
  if (!activeInput) return;
  var input = activeInput;
  if (key === 'backspace') input.value = input.value.slice(0, -1);
  else {
    if (input.value.length + key.length > input.maxLength) return;
    input.value += key;
  }
  if (input.id === 'reg-name') input.value = autoCapitalizeWords(input.value);
  if (input.id === 'reg-email') input.value = input.value.toLowerCase().replace(/\s/g, '');
  var consumed = shiftActive && key !== 'backspace';
  if (consumed) shiftActive = false;
  if (keyboardMode === 'alpha' && (consumed || input.id === 'reg-name')) buildKeyboard('alpha');
  input.dispatchEvent(new Event('input'));
}

function showKeyboard(input) {
  document.querySelectorAll('.reg-input, .setup-input').forEach(function(i) { i.classList.remove('focused'); });
  input.classList.add('focused');
  activeInput = input;
  shiftActive = false;
  document.getElementById('keyboard').classList.add('visible');
  document.getElementById('app').classList.add('kb-open');
  buildKeyboard('alpha');
}

function hideKeyboard() {
  document.querySelectorAll('.reg-input, .setup-input').forEach(function(i) { i.classList.remove('focused'); });
  activeInput = null;
  shiftActive = false;
  document.getElementById('keyboard').classList.remove('visible');
  document.getElementById('app').classList.remove('kb-open');
}

function advanceField() {
  if (activeInput && activeInput.id === 'setup-input') { saveSetupLocation(); return; }
  if (activeInput && activeInput.id === 'reg-name') { showKeyboard(document.getElementById('reg-email')); return; }
  hideKeyboard();
  validateEmail(true);
}

document.querySelectorAll('.reg-input, .setup-input').forEach(function(input) {
  input.addEventListener('pointerdown', function(e) { e.preventDefault(); showKeyboard(input); });
});

// ===== SLAJD 1: PODACI =====
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function validateEmail(showError) {
  var v = document.getElementById('reg-email').value.trim();
  var ok = EMAIL_RE.test(v);
  document.getElementById('email-error').classList.toggle('visible', showError && v.length > 0 && !ok);
  return ok;
}

function toggleGdpr() {
  document.getElementById('gdpr-check').classList.toggle('checked');
  updateRegNext();
}

function updateRegNext() {
  var name = document.getElementById('reg-name').value.trim();
  var gdpr = document.getElementById('gdpr-check').classList.contains('checked');
  document.getElementById('btn-reg-next').disabled = !(name.length >= 2 && validateEmail(false) && gdpr);
  if (validateEmail(false)) document.getElementById('email-error').classList.remove('visible');
}
document.getElementById('reg-name').addEventListener('input', updateRegNext);
document.getElementById('reg-email').addEventListener('input', updateRegNext);

function submitRegistration() {
  if (document.getElementById('btn-reg-next').disabled) return;
  hideKeyboard();
  showScreen('screen-question');
  questionShownAt = performance.now();
  startInactivityTimer();
}

var questionShownAt = 0;

// ===== SLAJD 2: PITANJE =====
function selectOption(row) {
  if (answerLocked) return;
  document.querySelectorAll('.option-row').forEach(function(r) { r.classList.remove('selected'); });
  row.classList.add('selected');
  selectedAnswer = row.getAttribute('data-value');
  document.getElementById('btn-answer').disabled = false;
  // Brži tok: dodir na odgovor = odgovor (bez POTVRDI); kratko se vidi odabir
  if (ONE_TAP_ANSWER) {
    answerLocked = true;
    var timeMs = Math.round(performance.now() - questionShownAt);
    setTimeout(function() { answerLocked = false; confirmAnswer(timeMs); }, 150);
  }
}

function confirmAnswer(tappedTimeMs) {
  if (!selectedAnswer || answerLocked) return;
  answerLocked = true;
  clearInactivityTimer();
  // Vrijeme = od prikaza pitanja do odgovora (dodir na odgovor ili POTVRDI)
  var timeMs = typeof tappedTimeMs === 'number' ? tappedTimeMs : Math.round(performance.now() - questionShownAt);
  var correct = selectedAnswer === CORRECT_ANSWER;
  document.querySelectorAll('.option-row').forEach(function(r) {
    var v = r.getAttribute('data-value');
    if (v === CORRECT_ANSWER) r.classList.add('correct');
    else if (v === selectedAnswer) r.classList.add('wrong');
    else r.classList.add('dimmed');
  });
  document.getElementById('btn-answer').classList.add('btn-hidden');

  var entry = {
    name: document.getElementById('reg-name').value.trim(),
    email: document.getElementById('reg-email').value.trim(),
    answer: selectedAnswer,
    is_correct: correct,
    time_ms: timeMs,
    location: DEVICE_LOCATION,
    created_at: new Date().toISOString()
  };
  // Prvo upis, pa tek onda dohvat ljestvice iz baze (da igrač bude na njoj)
  var since = getLbSince();
  var remote = saveEntry(entry).then(function() { return fetchRemoteLeaderboard(entry, since); });
  remote.catch(function() {});

  setTimeout(function() {
    var waited = new Promise(function(resolve) { setTimeout(function() { resolve(null); }, LEADERBOARD_WAIT_MS); });
    Promise.race([remote, waited])
      .then(function(r) { showLeaderboard(entry, r ? mergeRemote(r, entry, since) : localBoard(entry, since)); })
      .catch(function() { showLeaderboard(entry, localBoard(entry, since)); });
  }, FEEDBACK_MS);
}

// ===== ZADNJI SLAJD: REZULTAT + LEADERBOARD =====
var leaderboardTimer = null;

function formatTime(ms) {
  return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
}

// Na javnom ekranu samo ime + inicijal prezimena ("Ivan H.")
function shortName(full) {
  var parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '';
  return parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '.';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

function getLbSince() {
  try { return localStorage.getItem('bizzmo_lb_since') || ''; } catch (e) { return ''; }
}

function sameTime(a, b) { return Date.parse(a) === Date.parse(b); }

function byRank(a, b) { return a.time_ms - b.time_ms || Date.parse(a.created_at) - Date.parse(b.created_at); }

function correctSince(list, since) {
  return list.filter(function(r) {
    return r.is_correct && typeof r.time_ms === 'number' && (!since || Date.parse(r.created_at) >= Date.parse(since)) &&
      (LEADERBOARD_SCOPE !== 'location' || r.location === DEVICE_LOCATION);
  });
}

function toRow(r) { return { short_name: shortName(r.name), time_ms: r.time_ms, created_at: r.created_at }; }

// Bez baze: ljestvica iz prijava spremljenih na ovom totemu
function localBoard(entry, since) {
  var ranking = correctSince(readList(ALL_KEY), since).sort(byRank);
  var pos = ranking.findIndex(function(r) { return sameTime(r.created_at, entry.created_at); });
  return { rows: ranking.slice(0, LEADERBOARD_SIZE).map(toRow), pos: pos >= 0 ? pos + 1 : -1, total: ranking.length, source: 'lokalno' };
}

// Iz baze + prijave s ovog totema koje još čekaju slanje (offline), da nitko ne ispadne
function mergeRemote(r, entry, since) {
  var pending = correctSince(readList(PENDING_KEY), since);
  var rows = r.rows.concat(pending.map(toRow)).sort(byRank).slice(0, LEADERBOARD_SIZE);
  var others = pending.filter(function(p) { return !sameTime(p.created_at, entry.created_at); });
  var pos = r.pos > 0 ? r.pos + others.filter(function(p) { return byRank(p, entry) < 0; }).length : -1;
  return { rows: rows, pos: pos, total: r.total + pending.length, source: 'baza' };
}

function showLeaderboard(entry, board) {
  document.getElementById('result-title').textContent = entry.is_correct ? 'Točno!' : 'Netočno.';
  document.getElementById('result-text').innerHTML = entry.is_correct
    ? 'Vaše vrijeme: <b>' + formatTime(entry.time_ms) + '</b>'
    : 'Točan odgovor je A: ' + CORRECT_ANSWER_TEXT;

  var top = board.rows;
  var list = document.getElementById('lb-list');
  list.setAttribute('data-source', board.source);
  if (!top.length) {
    list.innerHTML = '<li class="lb-empty">Budite prvi na ljestvici!</li>';
  } else {
    list.innerHTML = top.map(function(r, i) {
      var me = entry.is_correct && sameTime(r.created_at, entry.created_at);
      return '<li class="lb-row' + (me ? ' lb-me' : '') + '" style="animation-delay:' + (0.1 + i * 0.06) + 's">' +
        '<span class="lb-rank">' + (i + 1) + '</span>' +
        '<span class="lb-name">' + escapeHtml(r.short_name) + '</span>' +
        '<span class="lb-time">' + formatTime(r.time_ms) + '</span></li>';
    }).join('');
  }

  var own = document.getElementById('lb-own');
  var pos = entry.is_correct ? board.pos : -1;
  if (pos > LEADERBOARD_SIZE) {
    own.innerHTML = 'Vaše mjesto: <b>' + pos + '.</b> od ' + board.total;
    own.style.display = '';
  } else if (pos > 0) {
    own.innerHTML = 'Na ljestvici ste!';
    own.style.display = '';
  } else {
    own.style.display = 'none';
  }

  showScreen('screen-leaderboard');
  leaderboardTimer = setTimeout(goToStart, LEADERBOARD_MS);
}

// "Novi natjecatelj" na zadnjem slajdu: odmah na prazan slajd 1 (bez videa)
function newPlayer() {
  goToStart();
  startFromAttract();
}

// ===== RESET -> video =====
function goToStart() {
  clearTimeout(leaderboardTimer);
  clearInactivityTimer();
  hideKeyboard();
  selectedAnswer = '';
  answerLocked = false;
  document.getElementById('reg-name').value = '';
  document.getElementById('reg-email').value = '';
  document.getElementById('email-error').classList.remove('visible');
  document.getElementById('gdpr-check').classList.remove('checked');
  document.getElementById('btn-reg-next').disabled = true;
  document.getElementById('btn-answer').disabled = true;
  document.getElementById('btn-answer').classList.remove('btn-hidden');
  document.querySelectorAll('.option-row').forEach(function(r) { r.className = 'option-row'; });
  showScreen(DEVICE_LOCATION ? 'screen-attract' : 'screen-setup');
}

// ===== NEAKTIVNOST (30 s) =====
var inactivityTimer = null;
function registrationTouched() {
  return document.getElementById('reg-name').value || document.getElementById('reg-email').value ||
    document.getElementById('gdpr-check').classList.contains('checked');
}
function startInactivityTimer() {
  clearInactivityTimer();
  var active = document.querySelector('.screen.active');
  if (!active) return;
  var onQuestion = active.id === 'screen-question' && !answerLocked;
  var onReg = active.id === 'screen-registration';
  if (onQuestion || onReg) inactivityTimer = setTimeout(goToStart, INACTIVITY_MS);
}
function clearInactivityTimer() { clearTimeout(inactivityTimer); inactivityTimer = null; }
document.addEventListener('pointerdown', function() { setTimeout(startInactivityTimer, 0); });

// ===== ANTI-BURN-IN: naslov ponavlja fly-in dok slajd 1 miruje =====
function replay(el) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}
setInterval(function() {
  var active = document.querySelector('.screen.active');
  if (!active) return;
  if (active.id === 'screen-registration' && !registrationTouched() && !activeInput) {
    replay(document.querySelector('.reg-heading'));
    replay(document.querySelector('.reg-subtitle'));
  }
}, IDLE_ANIM_MS);

// ===== ADMIN: 3 dodira u gornji desni kut (150x150 px dizajna) unutar 1.5 s =====
var tapTimes = [];
document.addEventListener('pointerdown', function(e) {
  var rect = document.getElementById('app').getBoundingClientRect();
  var s = document.getElementById('app')._scale || 1;
  var x = (e.clientX - rect.left) / s, y = (e.clientY - rect.top) / s;
  if (x > 1080 - 150 && y < 150) {
    var now = Date.now();
    tapTimes = tapTimes.filter(function(t) { return now - t < 1500; });
    tapTimes.push(now);
    if (tapTimes.length >= 3) { tapTimes = []; openAdmin(); }
  }
});
function openAdmin() {
  var all = readList(ALL_KEY).length, pending = readList(PENDING_KEY).length;
  document.getElementById('admin-stats').innerHTML =
    'Lokacija: <b>' + (DEVICE_LOCATION || '-') + '</b><br>Prijava na ovom totemu: <b>' + all +
    '</b><br>Čeka slanje u bazu: <b>' + pending + '</b><br>Internet: <b>' + (navigator.onLine ? 'da' : 'ne') + '</b><br>Baza: <b id="admin-db">provjeravam...</b>';
  rpc('bizzmo_leaderboard', { p_limit: 1 })
    .then(function() { document.getElementById('admin-db').textContent = 'spojena'; })
    .catch(function() { document.getElementById('admin-db').textContent = 'nije dostupna (ljestvica s ovog totema)'; });
  document.getElementById('admin-overlay').classList.add('visible');
}
function closeAdmin() { document.getElementById('admin-overlay').classList.remove('visible'); }

// ===== ADMIN: CIJELI POREDAK DANAS =====
// Iz baze: svi totemi, puna imena (funkcija traži ADMIN_PIN).
// Bez baze: prijave spremljene na ovom totemu.
function dayBounds() {
  var from = new Date(); from.setHours(0, 0, 0, 0);
  var to = new Date(from); to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString(), label: from.toLocaleDateString('hr-HR') };
}

function rankRows(list) {
  var correct = list.filter(function(r) { return r.is_correct; }).sort(byRank);
  var wrong = list.filter(function(r) { return !r.is_correct; }).sort(function(a, b) { return Date.parse(a.created_at) - Date.parse(b.created_at); });
  return correct.map(function(r, i) { return Object.assign({ rank: i + 1 }, r); })
    .concat(wrong.map(function(r) { return Object.assign({ rank: null }, r); }));
}

function renderRanking(rows, sourceLabel, day) {
  var correct = rows.filter(function(r) { return r.is_correct; }).length;
  document.getElementById('ranking-meta').innerHTML =
    day.label + ' &middot; Odigralo: <b>' + rows.length + '</b> &middot; Točnih: <b>' + correct + '</b> &middot; ' + sourceLabel;
  var body = document.getElementById('ranking-body');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="ranking-empty">Danas još nitko nije igrao.</td></tr>';
    return;
  }
  body.innerHTML = rows.map(function(r) {
    var t = new Date(r.created_at);
    var hm = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
    return '<tr class="' + (r.is_correct ? '' : 'ranking-wrong') + '">' +
      '<td>' + (r.rank ? r.rank + '.' : '-') + '</td>' +
      '<td>' + escapeHtml(r.name) + '</td>' +
      '<td>' + formatTime(r.time_ms) + '</td>' +
      '<td>' + (r.is_correct ? 'Točno' : 'Netočno') + '</td>' +
      '<td>' + escapeHtml(r.location || '') + '</td>' +
      '<td>' + hm + '</td></tr>';
  }).join('');
}

function openRanking() {
  var day = dayBounds();
  document.getElementById('ranking-overlay').classList.add('visible');
  document.getElementById('ranking-meta').textContent = day.label + ' · učitavam...';
  document.getElementById('ranking-body').innerHTML = '';
  var local = function(reason) {
    var list = readList(ALL_KEY).filter(function(r) {
      var t = Date.parse(r.created_at);
      return t >= Date.parse(day.from) && t < Date.parse(day.to);
    });
    renderRanking(rankRows(list), 'Samo ovaj totem (' + reason + ')', day);
  };
  rpc('bizzmo_ranking', { p_pin: ADMIN_PIN, p_from: day.from, p_to: day.to, p_location: null })
    .then(function(rows) {
      // dodaj prijave s ovog totema koje još čekaju slanje u bazu
      var pending = readList(PENDING_KEY).filter(function(r) {
        var t = Date.parse(r.created_at);
        return t >= Date.parse(day.from) && t < Date.parse(day.to);
      });
      renderRanking(rankRows(rows.concat(pending)), 'Svi totemi (baza)' + (pending.length ? ' + ' + pending.length + ' čeka slanje' : ''), day);
    })
    .catch(function(e) {
      local(/ 40[013]$/.test(String(e && e.message || '')) ? 'krivi admin PIN' : 'baza nije dostupna');
    });
}

function closeRanking() { document.getElementById('ranking-overlay').classList.remove('visible'); }
// Izlaz na desktop totema: Edge u kiosk modu ne dopušta window.close(), pa
// app otvara poseban link "bizzmo-exit:" koji je installer registrirao u
// Windowsima -> pokreće C:\HT-Bizzmo\_tools\exit-kiosk.ps1 koji ugasi
// kiosk Edge (samo njega) i ostavi desktop. Ako to ne uspije u 4 s
// (app nije instaliran installerom), pokaže se uputa za Alt+F4.
var exitFallbackTimer = null;
function exitApp() {
  closeAdmin();
  var ov = document.getElementById('exit-overlay');
  document.getElementById('exit-msg').textContent = 'Zatvaram aplikaciju...';
  document.getElementById('exit-help').style.display = 'none';
  ov.classList.add('visible');
  try { if (document.fullscreenElement) document.exitFullscreen().catch(function() {}); } catch (e) {}
  var a = document.createElement('a');
  a.href = 'bizzmo-exit:close';
  document.body.appendChild(a);
  a.click();
  a.remove();
  clearTimeout(exitFallbackTimer);
  exitFallbackTimer = setTimeout(function() {
    document.getElementById('exit-msg').textContent = 'Aplikacija se nije zatvorila.';
    document.getElementById('exit-help').style.display = '';
  }, 4000);
}
function cancelExit() {
  clearTimeout(exitFallbackTimer);
  document.getElementById('exit-overlay').classList.remove('visible');
}

// Briše sve prijave spremljene NA OVOM TOTEMU (ne dira Supabase) - dva dodira
var wipeArmed = false;
function wipeLocalData() {
  var btn = document.getElementById('btn-wipe');
  if (!wipeArmed) {
    wipeArmed = true;
    var pending = readList(PENDING_KEY).length;
    btn.textContent = pending ? 'Potvrdi (' + pending + ' još nije u bazi!)' : 'Dodirni opet za potvrdu';
    setTimeout(function() { wipeArmed = false; btn.textContent = 'Obriši podatke s ovog totema'; }, 4000);
    return;
  }
  wipeArmed = false;
  try { [ALL_KEY, PENDING_KEY, 'bizzmo_lb_since'].forEach(function(k) { localStorage.removeItem(k); }); } catch (e) {}
  btn.textContent = 'Podaci obrisani';
  openAdmin();
}

// ===== ZAKLJUČAVANJE =====
history.pushState(null, '', location.href);
window.addEventListener('popstate', function() { history.pushState(null, '', location.href); });
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

// Ekran nikad ne smije zaspati
var wakeLock = null;
function requestWakeLock() {
  if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(function(w) { wakeLock = w; }).catch(function() {});
}
requestWakeLock();
document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'visible') requestWakeLock(); });

// ===== START =====
// Odgovor jednim dodirom -> gumb POTVRDI ne treba
if (ONE_TAP_ANSWER) document.getElementById('btn-answer').style.display = 'none';
goToStart();
