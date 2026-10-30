// HandyGo · ilustraciones de cada paso de las guías.
//  GET  /api/img?g=<guía>&i=<paso>  -> imagen de una guía del catálogo (descripción fija, se guarda en la CDN)
//  GET  /api/img?p=<descripción>     -> imagen de una guía armada por el asistente (también se guarda)
//  POST /api/img {mode:"prompts"}    -> Gemini traduce pasos nuevos a descripciones visuales
// Modelo: Cloudflare Workers AI · FLUX.2 [klein] 4B (plan gratuito). Respaldo: FLUX.1 schnell.
// Variables: CF_ACCOUNT_ID, CF_API_TOKEN (obligatorias) · GEMINI_API_KEY (para guías nuevas)

const STYLE = 'Flat vector instructional illustration in the style of a modern home-repair manual. ' +
  'One clear subject, centered, medium close-up, generous margins, plain warm off-white background (#F5F7F2). ' +
  'Limited palette: deep forest green (#26573F), soft mint green (#B1D8B7), warm amber (#F2B33D) and dark charcoal (#1E2A24) outlines. ' +
  'Clean bold shapes, simple soft shading, accurate everyday objects, realistic proportions. ' +
  'Absolutely no text, no letters, no numbers, no labels, no logos, no watermark, no faces.';

// Descripciones fijas por guía (mismo orden que los pasos de la app)
const P = {
  canilla: [
    'a hand turning a round chrome water shut-off valve on a tiled bathroom wall, a small curved arrow showing the turning direction',
    'a white bathroom sink seen from above with a folded cloth covering the drain hole',
    'a chrome tap handle with its small decorative cap removed and a screwdriver loosening the central screw',
    'an adjustable wrench loosening the hexagonal nut of a disassembled tap cartridge, a small worn black rubber washer next to it',
    'a new black rubber tap washer being placed on the tap stem, the old cracked washer set aside',
    'a chrome tap closed with no drops falling, a small green check mark floating beside it'
  ],
  inodoro: [
    'a small chrome angle shut-off valve on the wall behind a white toilet, a hand turning it closed',
    'the lid of a white toilet cistern lifted off showing the plastic float valve and float inside the water',
    'a hand removing an old plastic toilet float valve from the cistern, a new float valve next to it',
    'white PTFE plumbing tape being wrapped around a plastic threaded pipe connection',
    'inside a toilet cistern, the water level line slightly below the top of the overflow tube, a small double-headed arrow showing the gap',
    'a white toilet cistern full and calm, water still, small green check mark beside it'
  ],
  pileta: [
    'a bucket placed under the U-shaped white plastic drain trap below a kitchen sink, inside the cabinet',
    'hands unscrewing the two plastic slip nuts of a U-shaped sink drain trap',
    'a removed U-shaped plastic sink trap being emptied into a bucket, a small brush cleaning it',
    'a U-shaped sink trap reassembled under the sink with rubber seals in place, nuts hand tightened',
    'a kitchen sink with the tap open and water flowing smoothly down the drain, green check mark'
  ],
  ducha: [
    'a hand closing a chrome shower mixer tap on a tiled wall',
    'a hand unscrewing a round chrome shower head wrapped in a cloth from its arm',
    'a round shower head soaking in a clear glass bowl of white vinegar',
    'an old toothbrush scrubbing the small nozzles of a shower head',
    'white PTFE tape wrapped around the threaded shower arm before reattaching the shower head',
    'a shower head spraying a strong even fan of water, green check mark'
  ],
  puerta: [
    'a pencil marking the spot where a wooden interior door rubs against its door frame',
    'a screwdriver tightening the screws of a metal door hinge on a wooden door',
    'wooden toothpicks with glue being inserted into a stripped screw hole on a door frame',
    'a sanding block smoothing the top edge of a wooden door, fine dust',
    'a wooden interior door closing smoothly into its frame, small motion arcs, green check mark'
  ],
  enchufe: [
    'a home electrical panel with a row of circuit breakers, one breaker switched to the off position highlighted in amber',
    'a voltage tester screwdriver touching a wall power outlet, its small indicator light off',
    'a wall power outlet with its front cover plate removed, an insulated screwdriver tightening the terminal screws',
    'a white wall outlet cover plate being placed back onto the outlet',
    'a lamp plugged into a wall outlet and glowing, a circuit breaker switched on, green check mark'
  ],
  lampara: [
    'a hand pressing a wall light switch to the off position',
    'a hand unscrewing a light bulb from a ceiling lamp socket',
    'close-up of an empty ceramic light bulb socket, clean and undamaged',
    'a hand screwing a new LED light bulb into a ceiling lamp socket',
    'a ceiling lamp glowing warmly, green check mark'
  ],
  silla: [
    'an office chair turned upside down resting on a folded blanket on the floor, its five-star base with caster wheels facing up',
    'a hand pulling a black plastic caster wheel straight out of the base of an upside-down office chair',
    'close-up of a caster wheel with hair and lint tangled around its axle, small scissors cutting the hair away',
    'a cloth wiping the metal stem of an office chair caster wheel',
    'a spray can of lubricant spraying a short burst onto the axle of a caster wheel',
    'the palm of a hand pushing a caster wheel back into the base of an office chair',
    'an upright office chair rolling smoothly across a floor, small motion lines behind the wheels, green check mark'
  ],
  cajon: [
    'an open wooden drawer being emptied, a few items placed beside it',
    'hands lifting the front of a wooden drawer to pull it out of its metal runners',
    'a cloth cleaning the metal drawer slide rails inside a cabinet',
    'a screwdriver tightening a screw on a metal drawer slide rail inside a cabinet',
    'a spray can of silicone spraying onto a metal drawer slide rail',
    'a wooden drawer sliding smoothly into a cabinet, motion lines, green check mark'
  ],
  mueble: [
    'a wooden table slightly wobbling, small motion lines at one leg joint',
    'an Allen key tightening a bolt at the leg joint of a wooden table',
    'toothpicks with wood glue inserted into a stripped screw hole on wooden furniture, cut flush',
    'a felt pad being stuck under the foot of a wooden chair leg to level it',
    'a small metal L-bracket screwed into the inside corner joint of a wooden table',
    'a sturdy wooden table standing perfectly level, green check mark'
  ],
  cuadro: [
    'a plain wall with a power outlet and a light switch, a dotted vertical line above and below them marked as a no-drill zone in amber',
    'a pencil marking a dot on a wall next to a small spirit level held horizontally',
    'a cordless drill with a masonry drill bit drilling a small hole into a wall',
    'a hammer gently tapping a plastic wall plug into a drilled hole until flush',
    'a screwdriver driving a screw into a wall plug, leaving a few millimeters sticking out',
    'a framed picture hanging straight on a wall, green check mark'
  ],
  inodoro_tapado: [
    'a hand closing the small chrome shut-off valve behind a white toilet',
    'rubber gloves and folded towels laid on a bathroom floor next to a toilet',
    'a rubber toilet plunger placed in a toilet bowl covering the drain opening',
    'a rubber plunger being pushed down and pulled up in a toilet bowl, vertical motion arrows',
    'a bucket of steaming warm water being poured into a toilet bowl',
    'a hand pressing the flush button on a toilet, water flowing down, green check mark'
  ],
  rejilla: [
    'a bucket of water being poured into a square metal floor drain grate in a bathroom',
    'a lifted floor drain grate and a bent wire hook pulling hair out of the drain',
    'baking soda being poured from a cup into a floor drain, a bottle of vinegar beside it',
    'a floor drain covered with its grate and a small kitchen timer beside it',
    'hot steaming water being poured into a floor drain',
    'a clean floor drain grate in a bathroom floor, a small calendar icon, green check mark'
  ],
  silicona: [
    'a utility knife cutting away old dark moldy silicone sealant along the edge of a bathtub',
    'a cloth with alcohol wiping a clean dry joint between a bathtub and wall tiles',
    'two strips of masking tape applied along both sides of the joint between a bathtub and tiles',
    'a caulking gun applying an even bead of white silicone sealant along the bathtub joint',
    'a wet fingertip smoothing a fresh bead of white silicone in a bathtub joint',
    'masking tape being peeled away leaving a neat white silicone line along a bathtub'
  ],
  burlete: [
    'a closed window with small wavy lines showing cold air leaking through the gap around the frame',
    'a cloth cleaning the edge of a window frame',
    'a measuring tape measuring the length of a window frame edge',
    'a roll of self-adhesive foam weather stripping being pressed along a window frame',
    'a closed window sealed tight, no air lines, green check mark'
  ],
  cerradura: [
    'a small tube puffing graphite powder into the keyhole of a door lock',
    'a key being inserted into a door lock keyhole, in and out arrows',
    'a key turning gently inside a door lock, a curved double arrow',
    'a door latch rubbing against the strike plate of a door frame, small contact marks'
  ],
  agujero: [
    'a small hole in a painted wall with a broken plastic wall plug being pulled out',
    'a putty knife pressing white filler into a small hole in a wall',
    'a smooth patch of white wall filler drying on a wall, a small clock beside it',
    'a piece of fine sandpaper sanding a dry filler patch flush with the wall',
    'a small paint brush painting over a repaired spot on a wall to match the color',
    'a perfectly smooth painted wall with no hole, green check mark'
  ],
  lavarropas: [
    'a front-loading washing machine with its power plug pulled out of the wall outlet',
    'a shallow tray and folded towels placed on the floor in front of the lower part of a washing machine',
    'the small filter access door opened at the bottom front of a washing machine',
    'a hand slowly unscrewing the round drain pump filter of a washing machine, water flowing into a tray',
    'a washing machine pump filter being rinsed under a tap, a coin and lint removed from it',
    'a front-loading washing machine running a spin cycle, green check mark'
  ],
  hongos: [
    'an open window, a pair of rubber gloves and a face mask',
    'a bucket with diluted bleach solution, a measuring cup showing one part bleach to three parts water',
    'a sponge gently wiping black mold spots on a white wall near a ceiling',
    'a damp cloth rinsing a cleaned white wall, a small clock beside it',
    'a bright clean wall next to an open window with fresh air lines, a paint roller beside it'
  ],
  aireador: [
    'a hand unscrewing the aerator at the tip of a kitchen tap wrapped in a cloth',
    'a small tap aerator mesh screen with white limescale and grit on it',
    'a tap aerator soaking in a small glass bowl of white vinegar',
    'an old toothbrush scrubbing a small tap aerator under running water',
    'a kitchen tap with a smooth steady stream of water, green check mark'
  ],
  persiana: [
    'a roller shutter fully lowered over a window with a screwdriver wedged between two slats to lock it',
    'the cover plate of a wall-mounted roller shutter strap winder being removed with a screwdriver',
    'an old frayed roller shutter strap being released from the wall winder',
    'a new roller shutter strap being threaded and fixed with a screw to the top roller',
    'a roller shutter rising smoothly over a window, upward arrow, green check mark'
  ]
};

const T = {
 "lavandina": "a white plastic bottle of household bleach next to a bucket of diluted water and a measuring cup",
 "rodillo": "an open roller shutter box above a window showing the horizontal roller tube with the shutter strap wound on it",
 "llave_paso": "a chrome wall-mounted water shut-off valve with a round handle, set into a tiled bathroom wall, near the floor",
 "bacha": "a white ceramic bathroom washbasin with a chrome tap, seen from slightly above",
 "rejilla": "a square stainless steel floor drain grate with small holes, set into bathroom floor tiles",
 "manija": "a chrome cross-head tap handle with a small blue cap in the center, close-up",
 "cuerito": "a small black rubber tap washer the size of a small coin, next to the brass tap stem it fits on",
 "llave_francesa": "a steel adjustable wrench with its knurled adjusting wheel visible",
 "tuerca": "three hexagonal metal nuts of different sizes",
 "cisterna": "a white ceramic toilet with its tank behind the bowl, the tank lid slightly lifted",
 "flotante": "inside an open toilet tank: a plastic float valve with its round float sitting on the water surface",
 "teflon": "a small roll of white PTFE thread seal tape next to a threaded brass pipe fitting",
 "rebalse": "inside an open toilet tank: the vertical plastic overflow tube in the middle, its open top above the water",
 "sifon": "a white plastic U-shaped sink drain trap under a sink, with its two screw nuts",
 "junta": "two black rubber O-ring gaskets of different sizes",
 "flor_ducha": "a round chrome shower head with many small water nozzles",
 "sarro": "close-up of a shower head nozzle face covered in white limescale deposits",
 "bisagra": "a metal door hinge with its screws, mounted on the edge of a wooden door",
 "cola": "a white bottle of PVA wood glue with a nozzle, a small drop of white glue",
 "lija": "a sheet of sandpaper wrapped around a small wooden sanding block",
 "termica": "an open home electrical panel with a row of small circuit breaker switches",
 "buscapolo": "a voltage tester screwdriver with a transparent handle and a small neon light inside",
 "frente_enchufe": "a white wall power outlet with its front cover plate removed, showing the socket mechanism behind",
 "portalamparas": "an empty ceramic light bulb socket hanging from a ceiling cord",
 "rosca": "two LED light bulbs side by side, one with a large E27 screw base and one with a small E14 screw base",
 "rueditas": "a black plastic office chair caster wheel with its metal stem, next to the chair base",
 "eje": "close-up of a caster wheel axle with hair and lint tangled around it",
 "lubricante": "a blue and yellow spray can of multi-purpose lubricant with a thin red straw nozzle",
 "trincheta": "a yellow utility knife with a retractable snap-off blade",
 "guias": "a pair of metal drawer slide rails mounted inside a wooden cabinet",
 "silicona_aer": "a white spray can of silicone lubricant spray",
 "allen": "a set of L-shaped hexagonal Allen keys of different sizes fanned out",
 "regaton": "round felt furniture pads and rubber leg caps, one stuck under a wooden chair leg",
 "escuadra": "a small metal L-shaped corner bracket with screw holes and screws",
 "nivel": "a spirit level tool with a green bubble vial centered",
 "mecha": "a masonry drill bit with a wide carbide tip, next to a drill",
 "taladro": "a cordless electric drill with a drill bit attached",
 "tarugo": "several grey plastic wall plugs next to matching screws",
 "sopapa": "a rubber toilet plunger with a wooden handle",
 "pistola": "a caulking gun loaded with a white silicone cartridge",
 "cinta_papel": "a roll of beige masking tape",
 "junta_bano": "close-up of the joint line between a white bathtub edge and wall tiles, sealed with white silicone",
 "burlete": "a roll of self-adhesive rubber weather stripping, partly unrolled",
 "grafito": "a small squeeze tube of graphite powder lubricant next to a keyhole",
 "pestillo": "the metal latch bolt sticking out from the edge of a door next to the handle",
 "enduido": "an open tub of white wall filler paste with a putty knife",
 "espatula": "a metal putty knife with a wooden handle",
 "filtro_lav": "the small round drain pump filter at the bottom front of a front-loading washing machine, its access door open",
 "aireador": "a small chrome tap aerator unscrewed, showing its metal mesh screen",
 "enrollador": "a wall-mounted roller shutter strap winder box with its cover off, the strap coiled inside",
 "cinta_persiana": "a beige fabric roller shutter strap coming out of a wall winder",
 "tablillas": "close-up of horizontal plastic roller shutter slats",
 "destornillador": "two screwdrivers side by side, one with a cross Phillips tip and one with a flat tip"
};

const { proteger, firmaValida } = require('./_seguridad');
const PERMITIDOS = new Set(['t', 'g', 'i', 'p', 's', 'v', 'r']);

module.exports = async (req, res) => {
  const acct = process.env.CF_ACCOUNT_ID, token = process.env.CF_API_TOKEN;

  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await proteger(req, res, 'img'))) return;
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    if (!acct || !token) return res.status(501).json({ ok: false, error: 'sin_configurar' });
    if (body.mode !== 'prompts') return res.status(400).json({ ok: false, error: 'Modo inválido' });
    const pasos = Array.isArray(body.pasos) ? body.pasos.slice(0, 8).map(x => String(x).slice(0, 240)) : [];
    const caso = String(body.caso || '').slice(0, 120);
    try { return res.status(200).json({ ok: true, prompts: await describe(caso, pasos) }); }
    catch (e) { return res.status(200).json({ ok: true, prompts: pasos.map(p => `${caso}: ${p}`) }); }
  }

  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  if (!acct || !token) { res.setHeader('Cache-Control', 'no-store'); return res.status(501).json({ ok: false, error: 'sin_configurar' }); }

  const q = req.query || {};
  const no = msg => { res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ ok: false, error: msg }); };
  // Solo se aceptan las direcciones que arma la app: así nadie puede saltear la caché con parámetros inventados
  if (Object.keys(q).some(k => !PERMITIDOS.has(k) || Array.isArray(q[k]))) return no('Parámetro inválido');
  if (q.v !== undefined && q.v !== '3') return no('Versión inválida');
  if (q.r !== undefined && q.r !== '1') return no('Parámetro inválido');
  if (q.g !== undefined && !/^\d{1,2}$/.test(String(q.i || ''))) return no('Paso inválido');
  if (q.p !== undefined && (String(q.p).length > 400 || !firmaValida(String(q.p), q.s))) return no('Imagen no autorizada');
  if (!(require('./_seguridad').origenValido(req))) return no('Origen no permitido');
  let subject = '';
  if (q.t) subject = T[String(q.t)] ? 'Identification picture of ' + T[String(q.t)] + ', shown clearly so a beginner can recognize it' : '';
  else if (q.g) { const list = P[String(q.g)]; const i = parseInt(q.i, 10); subject = list && list[i]; }
  else if (q.p) subject = 'Identification picture of ' + String(q.p).slice(0, 400) + ', shown clearly so a beginner can recognize it';
  if (!subject) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ ok: false, error: 'Paso desconocido' }); }

  const prompt = `${subject}. ${STYLE}`;
  try {
    const img = await klein(acct, token, prompt).catch(e => { console.error('klein:', e.message); return schnell(acct, token, prompt); });
    const isPng = img[0] === 0x89 && img[1] === 0x50;
    res.setHeader('Content-Type', isPng ? 'image/png' : 'image/jpeg');
    // Se guarda en la CDN de Vercel: cada imagen se genera una sola vez
    res.setHeader('Cache-Control', 'public, max-age=2592000, s-maxage=31536000, immutable');
    return res.status(200).send(img);
  } catch (e) {
    console.error('Imagen:', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ ok: false, error: 'No se pudo generar la imagen' });
  }
};

function seedOf(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h) % 2147483647; }

async function klein(acct, token, prompt) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', '768');
  form.append('height', '480');
  form.append('seed', String(seedOf(prompt)));
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`, {
      method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${token}` }, body: form
    });
    return await readImage(r);
  } finally { clearTimeout(t); }
}

async function schnell(acct, token, prompt) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, steps: 8, seed: seedOf(prompt) })
    });
    return await readImage(r);
  } finally { clearTimeout(t); }
}

async function readImage(r) {
  const type = r.headers.get('content-type') || '';
  if (type.startsWith('image/')) { if (!r.ok) throw new Error(String(r.status)); return Buffer.from(await r.arrayBuffer()); }
  const d = await r.json().catch(() => ({}));
  const b64 = (d && d.result && d.result.image) || (d && d.image);
  if (!r.ok || !b64) throw new Error(`${r.status} ${(d.errors && d.errors[0] && d.errors[0].message) || 'sin imagen'}`);
  return Buffer.from(b64, 'base64');
}

async function describe(caso, pasos) {
  if (!process.env.GEMINI_API_KEY) throw new Error('sin gemini');
  const ask = `These are step-by-step home repair instructions in Argentine Spanish for: "${caso}".
For EACH step write ONE short English description (max 30 words) of a single instructional illustration for that step.
Focus on the OBJECT and the TOOL involved, shown clearly in close-up (show at most one hand, only if essential).
Be concrete about the everyday objects (e.g. "a black plastic caster wheel of an office chair"). No people faces, no text.
Steps:\n${pasos.map((p, i) => `${i + 1}. ${p}`).join('\n')}
Answer ONLY JSON: {"prompts":["...", "..."]} with exactly ${pasos.length} items in the same order.`;
  const models = [process.env.GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'].filter(Boolean);
  for (const model of [...new Set(models)]) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: ask }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 2048 } })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) continue;
      const text = ((((d.candidates || [])[0] || {}).content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      const o = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
      if (Array.isArray(o.prompts) && o.prompts.length) return pasos.map((p, i) => String(o.prompts[i] || p).slice(0, 380));
    } catch (e) { /* probar el siguiente modelo */ } finally { clearTimeout(t); }
  }
  throw new Error('sin respuesta');
}

module.exports.PROMPTS = P;
