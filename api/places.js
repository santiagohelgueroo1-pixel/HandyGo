// HandyGo · comercios cercanos (ferreterías, pinturerías, corralones, sanitarios).
// Fuente principal: OpenStreetMap vía Overpass (consulta varios servidores a la vez y usa el primero que responde).
// Respaldo: Photon (buscador de OpenStreetMap). Todo gratis y sin claves.

const UA = 'HandyGo/1.0 (app de ayuda para arreglos del hogar)';
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const TYPES = 'hardware|doityourself|paint|trade|bathroom_furnishing|houseware|building_materials';

module.exports = async (req, res) => {
  const q = req.query || {};
  const lat = Math.round(parseFloat(q.lat) * 1000) / 1000, lon = Math.round(parseFloat(q.lon) * 1000) / 1000;
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ ok: false, error: 'Ubicación inválida' });

  let items = [], source = '';
  try {
    for (const r of [1500, 4000]) {
      items = await overpass(lat, lon, r);
      source = 'overpass';
      if (items.length >= 3) break;
    }
  } catch (e) { console.error('Overpass:', e.message); }

  if (items.length < 3) {
    try {
      const extra = await photon(lat, lon);
      const seen = new Set(items.map(x => x.n.toLowerCase()));
      items = items.concat(extra.filter(x => !seen.has(x.n.toLowerCase())));
      source = source ? source + '+photon' : 'photon';
    } catch (e) { console.error('Photon:', e.message); }
  }

  if (!items.length && !source) return res.status(502).json({ ok: false, error: 'No se pudieron consultar los comercios' });
  items = items.map(x => ({ ...x, d: Math.round(dist(lat, lon, x.lat, x.lon)) })).filter(x => x.d <= 6000).sort((a, b) => a.d - b.d).slice(0, 15);
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=604800');
  return res.status(200).json({ ok: true, source, items });
};

function withTimeout(ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; }

async function overpass(lat, lon, r) {
  const query = `[out:json][timeout:12];nwr["shop"~"^(${TYPES})$"](around:${r},${lat},${lon});out center 60;`;
  const tryOne = async url => {
    const t = withTimeout(10000);
    try {
      const resp = await fetch(url, { method: 'POST', signal: t.signal, headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, accept: 'application/json' }, body: 'data=' + encodeURIComponent(query) });
      if (!resp.ok) throw new Error(url + ' ' + resp.status);
      const d = await resp.json();
      return (d.elements || []).map(e => {
        const t2 = e.tags || {};
        return { n: t2.name, lat: e.lat ?? (e.center && e.center.lat), lon: e.lon ?? (e.center && e.center.lon), shop: t2.shop,
          dir: [t2['addr:street'], t2['addr:housenumber']].filter(Boolean).join(' '), h: t2.opening_hours || '' };
      }).filter(x => x.n && isFinite(x.lat) && isFinite(x.lon));
    } finally { t.done(); }
  };
  return Promise.any(MIRRORS.map(tryOne));
}

async function photon(lat, lon) {
  const out = [];
  for (const term of ['ferreteria', 'pintureria', 'corralon']) {
    const t = withTimeout(8000);
    try {
      const resp = await fetch(`https://photon.komoot.io/api/?q=${term}&lat=${lat}&lon=${lon}&limit=15&location_bias_scale=0.1`, { signal: t.signal, headers: { 'user-agent': UA } });
      if (!resp.ok) continue;
      const d = await resp.json();
      (d.features || []).forEach(f => {
        const p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
        if (!p.name || p.osm_key !== 'shop') return;
        out.push({ n: p.name, lat: c[1], lon: c[0], shop: p.osm_value, dir: [p.street, p.housenumber].filter(Boolean).join(' '), h: '' });
      });
    } catch (e) { /* seguir */ } finally { t.done(); }
  }
  const seen = new Set();
  return out.filter(x => { const k = x.n.toLowerCase() + '|' + x.lat.toFixed(4) + '|' + x.lon.toFixed(4); if (seen.has(k)) return false; seen.add(k); return true; });
}

function dist(a1, o1, a2, o2) {
  const R = 6371e3, t = x => x * Math.PI / 180, dLa = t(a2 - a1), dLo = t(o2 - o1);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a1)) * Math.cos(t(a2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
