// ===== KONFIGURACIJA - AI asistent Bizzmo totem =====

// Točan odgovor na pitanje "Što je AI asistent Bizzmo?"
var CORRECT_ANSWER = 'A';

// Tekst točnog odgovora (prikazuje se na zahvali kad netko pogriješi)
var CORRECT_ANSWER_TEXT = 'Digitalna platforma za upravljanje bazom klijenata, rezervaciju termina i izradu marketinških kampanja.';

// Timeri (ms)
var INACTIVITY_MS = 30000;      // neaktivnost na slajdu 1 / 2 -> povratak na početak
var ONE_TAP_ANSWER = true;      // true = dodir na odgovor odmah odgovara (bez POTVRDI)
var FEEDBACK_MS = 1000;        // koliko dugo se vidi označen točan/netočan odgovor
var LEADERBOARD_MS = 12000;     // zadnji slajd (rezultat + ljestvica) -> video
var LEADERBOARD_SIZE = 5;       // koliko najbržih točnih se prikazuje
var LEADERBOARD_SCOPE = 'all';  // 'all' = svi totemi zajedno, 'location' = samo ovaj totem
// Admin -> "Poredak danas": puna imena svih igrača dana iz baze (svi totemi).
// PIN mora biti isti kao u Supabase tablici bizzmo_admin.
var ADMIN_PIN = ''; // javni pregled: bez PIN-a
var LEADERBOARD_WAIT_MS = 800;  // koliko najduže čekati bazu prije prikaza (inače lokalna ljestvica)
var IDLE_ANIM_MS = 8000;        // ponavljanje fly-in animacije naslova (anti-burn-in)

var SUPABASE_URL = ''; // javni pregled: bez baze, igre ostaju u pregledniku
var SUPABASE_ANON_KEY = '';
var SUPABASE_TABLE = 'bizzmo_prijave';
