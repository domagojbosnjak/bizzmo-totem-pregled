// ===== SPREMANJE PRIJAVA =====
// 1) Svaka prijava se UVIJEK upiše u lokalnu arhivu na totemu (bizzmo_all) -
//    backup (vidi se u Admin -> Poredak danas kad baza nije dostupna).
// 2) Šalje se u Supabase (REST, bez vanjske knjižnice). Ako nema interneta
//    ili Supabase ne odgovara, prijava ide u red (bizzmo_pending) i šalje se
//    automatski čim veza proradi (online event + svakih 60 s).

var ALL_KEY = 'bizzmo_all';
var PENDING_KEY = 'bizzmo_pending';
var syncInFlight = false;

function readList(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}
function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
}

function insertRow(row) {
  if (!navigator.onLine || !SUPABASE_URL) return Promise.resolve(false);
  return fetch(SUPABASE_URL + '/rest/v1/' + SUPABASE_TABLE, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(row)
  }).then(function(r) { return r.ok; }).catch(function() { return false; });
}

function saveEntry(row) {
  var all = readList(ALL_KEY);
  all.push(row);
  writeList(ALL_KEY, all);
  return insertRow(row).then(function(ok) {
    if (!ok) {
      var pending = readList(PENDING_KEY);
      pending.push(row);
      writeList(PENDING_KEY, pending);
    }
    return ok;
  });
}

function syncPending() {
  if (syncInFlight || !navigator.onLine) return;
  var pending = readList(PENDING_KEY);
  if (!pending.length) return;
  syncInFlight = true;
  var remaining = [];
  pending.reduce(function(p, row) {
    return p.then(function() {
      return insertRow(row).then(function(ok) { if (!ok) remaining.push(row); });
    });
  }, Promise.resolve()).then(function() {
    // prijave dodane za vrijeme slanja ne smiju se izgubiti
    var now = readList(PENDING_KEY);
    writeList(PENDING_KEY, remaining.concat(now.slice(pending.length)));
    syncInFlight = false;
  });
}

window.addEventListener('online', syncPending);
setInterval(syncPending, 60000);
setTimeout(syncPending, 3000);

// ===== LEADERBOARD IZ SUPABASEA =====
// Tablica se ne može čitati (osobni podaci), pa se ljestvica dohvaća preko dvije
// funkcije u bazi koje vraćaju samo "Ime P." i vrijeme (supabase-schema.sql).
function rpc(fn, args) {
  if (!navigator.onLine || !SUPABASE_URL) return Promise.reject(new Error('offline'));
  return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  }).then(function(r) {
    if (!r.ok) throw new Error('rpc ' + fn + ' ' + r.status);
    return r.json();
  });
}

// Vraća { rows: [{short_name, time_ms, created_at}], pos, total } ili baca grešku
function fetchRemoteLeaderboard(entry, since) {
  var scope = LEADERBOARD_SCOPE === 'location' ? DEVICE_LOCATION : null;
  var calls = [rpc('bizzmo_leaderboard', { p_limit: LEADERBOARD_SIZE, p_since: since || null, p_location: scope })];
  if (entry.is_correct) {
    calls.push(rpc('bizzmo_position', { p_time_ms: entry.time_ms, p_created_at: entry.created_at, p_since: since || null, p_location: scope }));
  }
  return Promise.all(calls).then(function(res) {
    var p = res[1] && res[1][0];
    return { rows: res[0], pos: p ? Number(p.pos) : -1, total: p ? Number(p.total) : 0 };
  });
}
