// HandyGo · ingreso con usuario o celular (además del mail).
// Busca el mail de la cuenta en la base (función login_email, que solo responde con la clave LOGIN_SECRET)
// e inicia la sesión en Supabase. El mail nunca llega al teléfono de quien intenta entrar.
// Variables en Vercel: SUPABASE_URL, SUPABASE_ANON_KEY, LOGIN_SECRET

const { origenValido } = require('./_seguridad');

// Límite de intentos por conexión: 10 por minuto
const INTENTOS = new Map();
function demasiados(ip) {
  const now = Date.now(), r = INTENTOS.get(ip) || { t: now, n: 0 };
  if (now - r.t > 60e3) { r.t = now; r.n = 0; }
  r.n++; INTENTOS.set(ip, r);
  if (INTENTOS.size > 5000) INTENTOS.delete(INTENTOS.keys().next().value);
  return r.n > 10;
}

// Celular argentino → 10 dígitos (código de área + número, sin 0 ni 15)
function normTel(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) for (const n of [2, 3, 4]) if (d.slice(n, n + 2) === '15') { d = d.slice(0, n) + d.slice(n + 2); break; }
  return /^\d{10}$/.test(d) ? d : '';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Usá POST' });
  if (!origenValido(req)) return res.status(403).json({ ok: false, error: 'origen_no_permitido' });
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY, secreto = process.env.LOGIN_SECRET;
  if (!url || !anon || !secreto) return res.status(501).json({ ok: false, error: 'sin_configurar' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (demasiados(ip)) return res.status(429).json({ ok: false, error: 'limite' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const ident = String((body && body.id) || '').trim().slice(0, 120), pass = String((body && body.pass) || '').slice(0, 200);
  if (!ident || !pass) return res.status(400).json({ ok: false, error: 'faltan_datos' });

  const malo = () => res.status(401).json({ ok: false, error: 'credenciales' });
  try {
    let email = ident.includes('@') ? ident.toLowerCase() : '';
    if (!email) {
      const clave = normTel(ident) || ident.toLowerCase();
      const r = await fetch(url + '/rest/v1/rpc/login_email', {
        method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + anon, 'content-type': 'application/json' },
        body: JSON.stringify({ p_ident: clave, p_secreto: secreto }), signal: AbortSignal.timeout(6000)
      });
      if (!r.ok) { console.error('login_email:', r.status, await r.text().catch(() => '')); return res.status(502).json({ ok: false, error: 'base' }); }
      email = await r.json();
      if (!email) return malo();
    }
    const t = await fetch(url + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: anon, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: pass }), signal: AbortSignal.timeout(8000)
    });
    const d = await t.json().catch(() => ({}));
    if (!t.ok || !d.access_token) return malo();
    return res.status(200).json({ ok: true, access_token: d.access_token, refresh_token: d.refresh_token });
  } catch (e) {
    console.error('login:', e.message);
    return res.status(502).json({ ok: false, error: 'base' });
  }
};
module.exports.normTel = normTel;
