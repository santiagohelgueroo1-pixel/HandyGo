// HandyGo · seguridad compartida de las funciones del servidor.
// (Vercel no publica los archivos que empiezan con "_": este archivo solo lo usan chat.js, img.js y places.js)
//
// 1. Solo acepta pedidos que vengan de la misma app (no de otras páginas web).
// 2. Solo responde a personas con sesión iniciada en HandyGo (verifica el token de Supabase).
// 3. Limita cuántas veces por minuto y por día puede usar cada cuenta la IA, las imágenes y el mapa.
//    El límite se guarda en la base (función api_hit de supabase-3.sql); si esa función todavía no existe,
//    usa un límite en memoria como respaldo.

const crypto = require('crypto');

// Límites por cuenta: [por minuto, por día]
const LIMITES = { chat: [12, 250], img: [20, 200], places: [10, 120] };

// ---------- Origen ----------
function origenValido(req) {
  const o = req.headers.origin || req.headers.referer || '';
  if (!o) return true; // las apps instaladas y algunos navegadores no lo mandan; lo cubre el token
  let host = '';
  try { host = new URL(o).host; } catch (e) { return false; }
  const propio = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return host === propio || extra.includes(host) || /^localhost(:\d+)?$/.test(host) || /^127\.0\.0\.1(:\d+)?$/.test(host);
}

// ---------- Respaldo en memoria ----------
const MEM = new Map();
function limiteMemoria(clave, [porMin, porDia]) {
  const now = Date.now(), r = MEM.get(clave) || { m: now, nm: 0, d: now, nd: 0 };
  if (now - r.m > 60e3) { r.m = now; r.nm = 0; }
  if (now - r.d > 864e5) { r.d = now; r.nd = 0; }
  r.nm++; r.nd++; MEM.set(clave, r);
  if (MEM.size > 5000) MEM.delete(MEM.keys().next().value);
  return r.nm <= porMin && r.nd <= porDia;
}

const USUARIOS = new Map(); // token -> {id, hasta}
async function usuarioPorToken(url, anon, token) {
  const c = USUARIOS.get(token);
  if (c && c.hasta > Date.now()) return c.id;
  const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  if (!u || !u.id) return null;
  USUARIOS.set(token, { id: u.id, hasta: Date.now() + 5 * 60e3 });
  if (USUARIOS.size > 2000) USUARIOS.delete(USUARIOS.keys().next().value);
  return u.id;
}

// ---------- Control principal ----------
// Devuelve el id de la cuenta si puede seguir; si no, ya respondió con el error y devuelve null.
async function proteger(req, res, tipo) {
  const corta = (st, error) => { res.setHeader('Cache-Control', 'no-store'); res.status(st).json({ ok: false, error }); return null; };
  if (!origenValido(req)) return corta(403, 'origen_no_permitido');

  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return 'local'; // sin base configurada (modo local): no hay cuentas que verificar

  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token || token === anon || token.split('.').length !== 3) return corta(401, 'sin_sesion');

  const [porMin, porDia] = LIMITES[tipo] || [10, 100];
  try {
    const r = await fetch(url + '/rest/v1/rpc/api_hit', {
      method: 'POST',
      headers: { apikey: anon, Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ p_bucket: tipo, p_min: porMin, p_dia: porDia }),
      signal: AbortSignal.timeout(6000)
    });
    if (r.ok) {
      const d = await r.json().catch(() => null);
      if (d && d.ok === false) return corta(429, 'limite');
      if (d && d.uid) return d.uid;
    } else {
      const e = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403 || /JWT|jwt/.test(String(e.message || ''))) return corta(401, 'sin_sesion');
      if (e.code !== 'PGRST202' && r.status !== 404) console.error('api_hit:', r.status, e.message);
    }
  } catch (e) { console.error('api_hit:', e.message); }

  // Respaldo: verifica la sesión y limita en memoria
  let id = null;
  try { id = await usuarioPorToken(url, anon, token); } catch (e) { console.error('auth:', e.message); return corta(503, 'no_se_pudo_verificar'); }
  if (!id) return corta(401, 'sin_sesion');
  if (!limiteMemoria(tipo + ':' + id, [porMin, porDia])) return corta(429, 'limite');
  return id;
}

// ---------- Firma de las imágenes que propone la IA ----------
// Así nadie puede usar /api/img para dibujar cualquier cosa: solo lo que devolvió el chat.
function clave() {
  const base = process.env.IMG_SECRET || process.env.CF_API_TOKEN || process.env.GEMINI_API_KEY || '';
  return crypto.createHash('sha256').update('handygo-img|' + base).digest();
}
const firmar = p => crypto.createHmac('sha256', clave()).update('v3|' + String(p)).digest('base64url').slice(0, 22);
function firmaValida(p, s) {
  const a = Buffer.from(firmar(p)), b = Buffer.from(String(s || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { proteger, firmar, firmaValida, origenValido };
