// HandyGo · servidor del chat con IA (Vercel Serverless Function)
// Usa la API gratuita de Gemini. Si falla o se agota el cupo, prueba con Groq (opcional).
// Variables de entorno en Vercel:
//   GEMINI_API_KEY  (obligatoria)  -> clave gratis de Google AI Studio
//   GEMINI_MODEL    (opcional)     -> modelo a usar primero
//   GROQ_API_KEY    (opcional)     -> respaldo gratuito de Groq
//   GROQ_MODEL      (opcional)

const SYSTEM = `Sos el asistente de HandyGo, una app argentina (Ciudad de Buenos Aires) que acompaña a las personas ante problemas cotidianos del hogar.
Hablás en español rioplatense con voseo, cálido, breve y sin tecnicismos. Nunca hacés sentir a la persona que no sabe.

TU TRABAJO
1. Entender el problema con preguntas cortas, de a UNA por vez, con 2 o 3 opciones de respuesta.
2. Cuando ya tengas suficiente información (en general 1 o 2 preguntas), elegí UNA de estas salidas:
   - "guiar" CON CATÁLOGO: si el problema coincide con una guía del CATÁLOGO, poné su id en "tutorial" (la app muestra los pasos revisados).
   - "guiar" SIN CATÁLOGO: si NO hay guía en el catálogo pero es un arreglo SIMPLE y SIN RIESGO que una persona sin experiencia puede hacer
     (muebles, sillas, ruedas, cajones, objetos, ajustes, limpieza, cambiar piezas comunes, pegar, colgar algo liviano, electrodomésticos
     DESENCHUFADOS solo para limpieza o piezas externas, etc.), "tutorial": null y armá vos:
       "pasos": 3 a 8 pasos concretos, en orden, uno por acción, con medidas de cuidado básicas (desenchufar, cortar el agua, guantes);
       "materiales": [["nombre","cómo pedirlo en una ferretería o comercio argentino"]] (puede ser lista vacía);
       "nivel": "Fácil" o "Media"; "minutos": número estimado; "alerta": una frase de precaución si corresponde, o "".
     Preferí SIEMPRE ayudar a resolverlo antes que derivar cuando el arreglo es simple y seguro.
   - "derivar": solo si es riesgoso, requiere herramientas o habilidades profesionales, o el usuario ya intentó y no pudo.
3. Si te mandan una foto, describí brevemente lo que ves y usalo para acotar.
4. Si te mandan un AUDIO, escuchalo y respondé como si te lo hubieran escrito. En "transcripcion" poné lo que dijo la persona (texto breve y fiel).
   Si no hay audio, "transcripcion": "".

SEGURIDAD (NO NEGOCIABLE)
- Nunca des instrucciones para instalaciones o artefactos de GAS (calefón, estufa, termotanque, anafe, garrafa, olor a gas),
  ELECTRICIDAD COMPLEJA (tablero, térmicas que saltan, cableado, chispas, olor a quemado, descargas) ni problemas ESTRUCTURALES
  (grietas, fisuras, columnas, vigas, losas, techos que ceden).
- En esos casos: estado "derivar", "riesgo": true, explicá en el mensaje por qué no conviene intervenir y qué hacer ya para estar a salvo.
- Si la persona insiste en hacerlo sola, mantené la negativa con amabilidad.
- Si dudás de que sea seguro, derivá.

CAMBIO DE TEMA (para el sistema de consultas)
- Te paso el TEMA ACTUAL de la conversación. Si el ÚLTIMO mensaje del usuario plantea un problema DISTINTO
  (otro artefacto, otra parte de la casa u otra falla sin relación), poné "tema_nuevo": true y atendé ese problema nuevo desde cero.
- Repreguntas, aclaraciones, detalles, fotos, dudas sobre los pasos, materiales o el prestador del MISMO problema NO son tema nuevo.
- Si no hay tema actual, "tema_nuevo": false.

Si el mensaje no tiene que ver con el hogar, estado "fuera_de_tema" y explicá en una frase en qué podés ayudar.

RESPONDÉ SOLO con un objeto JSON válido, sin texto extra:
{"estado":"preguntar|guiar|derivar|fuera_de_tema","caso":"nombre corto del problema","rubro":"Plomería|Gas|Electricidad|Carpintería|Albañilería","mensaje":"máximo 3 frases para el usuario","opciones":["solo si estado es preguntar: 2 o 3 respuestas cortas"],"tutorial":"id del catálogo o null","pasos":["solo si guiás sin catálogo"],"materiales":[["nombre","cómo pedirlo"]],"nivel":"Fácil","minutos":20,"alerta":"","riesgo":false,"tema_nuevo":false,"transcripcion":""}`;

const ESTADOS = ['preguntar', 'guiar', 'derivar', 'fuera_de_tema'];
const RUBROS = ['Plomería', 'Gas', 'Electricidad', 'Carpintería', 'Albañilería'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return diagnose(req, res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Usá POST' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const messages = Array.isArray(body && body.messages) ? body.messages.slice(-12) : [];
  const catalog = Array.isArray(body && body.catalog) ? body.catalog.slice(0, 40) : [];
  const tema = typeof (body && body.tema_actual) === 'string' ? body.tema_actual.slice(0, 120) : '';
  if (!messages.length) return res.status(400).json({ ok: false, error: 'Faltan mensajes' });

  const system = SYSTEM + '\n\nCATÁLOGO DE GUÍAS REVISADAS (id: título · rubro · cuándo usarla):\n' +
    catalog.map(c => `- ${String(c.id)}: ${String(c.titulo)} · ${String(c.rubro)} · ${String(c.cuando)}`).join('\n') +
    '\n\nTEMA ACTUAL: ' + (tema || '(ninguno, es el primer mensaje)');
  const ids = catalog.map(c => String(c.id));

  const errors = [], t0 = Date.now(), left = () => 26000 - (Date.now() - t0);
  const hasAudio = messages.some(m => m.audio && m.audio.data);
  if (process.env.GEMINI_API_KEY) {
    for (const model of geminiModels()) {
      if (left() < 4000) break;
      if (SKIP[model] && SKIP[model] > Date.now()) { errors.push(`${model}: sin cupo (salteado)`); continue; }
      try {
        const text = await gemini(model, system, messages, Math.min(12000, left()));
        return res.status(200).json({ ok: true, provider: 'gemini', model, reply: normalize(text, ids) });
      } catch (e) {
        errors.push(`${model}: ${e.message}`);
        if (/^(429|404)/.test(e.message)) SKIP[model] = Date.now() + (e.message.startsWith('404') ? 864e5 : 6e4);
      }
    }
  }
  // Respaldos sin audio: Groq y Cloudflare Workers AI (si están configurados)
  const textOnly = messages.map(m => ({ ...m, audio: m.audio && m.audio.data ? null : m.audio, text: m.audio && m.audio.data ? '(audio que no se pudo escuchar)' : m.text }));
  if (process.env.GROQ_API_KEY && left() > 3000) {
    try {
      const text = await groq(system, textOnly, Math.min(12000, left()));
      return res.status(200).json({ ok: true, provider: 'groq', reply: normalize(text, ids), audioPerdido: hasAudio });
    } catch (e) { errors.push(`groq: ${e.message}`); }
  }
  if (process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN && left() > 3000) {
    try {
      const text = await cloudflare(system, textOnly, Math.min(15000, left()));
      return res.status(200).json({ ok: true, provider: 'cloudflare', reply: normalize(text, ids), audioPerdido: hasAudio });
    } catch (e) { errors.push(`cloudflare: ${e.message}`); }
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) errors.push('No hay ninguna clave configurada (GEMINI_API_KEY)');
  console.error('HandyGo IA sin respuesta:', errors.join(' | '));
  return res.status(502).json({ ok: false, error: 'La IA no respondió', detail: errors });
};

const SKIP = {};
function geminiModels() {
  return [...new Set([process.env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.8-flash'].filter(Boolean))];
}
function timeout(ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; }
function thinking(model) { return /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' }; }
async function gemini(model, system, messages, ms = 12000) {
  const contents = messages.map(m => {
    const parts = [];
    if (m.image && m.image.data) parts.push({ inlineData: { mimeType: m.image.mime || 'image/jpeg', data: String(m.image.data) } });
    if (m.audio && m.audio.data) parts.push({ inlineData: { mimeType: m.audio.mime || 'audio/wav', data: String(m.audio.data) } });
    parts.push({ text: m.audio && m.audio.data ? 'El usuario mandó este audio. Escuchalo y transcribilo en "transcripcion".' : String(m.text || '(foto)').slice(0, 2000) });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
  const call = async withThinking => {
    const t = timeout(ms);
    try {
      const generationConfig = { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 4096 };
      if (withThinking) generationConfig.thinkingConfig = thinking(model);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: t.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { const err = new Error(`${r.status} ${((d.error && d.error.message) || '').slice(0, 160)}`.trim()); err.status = r.status; throw err; }
      const cand = (d.candidates || [])[0] || {};
      const out = ((cand.content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      if (!out) throw new Error('respuesta vacía' + (cand.finishReason ? ' (' + cand.finishReason + ')' : ''));
      return out;
    } catch (e) { if (e.name === 'AbortError') throw new Error('tardó demasiado'); throw e; }
    finally { t.done(); }
  };
  try { return await call(true); }
  catch (e) { if (e.status === 400 && /thinking/i.test(e.message)) return call(false); throw e; }
}

async function groq(system, messages, ms = 12000) {
  const t = timeout(ms);
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', signal: t.signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system },
        ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: (m.audio ? '(el usuario mandó un audio que no se puede escuchar: pedile que lo escriba)' : String(m.text || '(el usuario mandó una foto)')) + (m.image ? ' [adjuntó una foto]' : '') }))]
    })
  });
  const d = await r.json().catch(() => ({})); t.done();
  if (!r.ok) throw new Error(`${r.status} ${(d.error && d.error.message) || ''}`.trim());
  const out = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!out) throw new Error('respuesta vacía');
  return out;
}

async function cloudflare(system, messages, ms = 15000) {
  const t = timeout(ms);
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`, {
      method: 'POST', signal: t.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.CF_API_TOKEN}` },
      body: JSON.stringify({ max_tokens: 1500, temperature: 0.4, messages: [{ role: 'system', content: system + '\n\nIMPORTANTE: respondé únicamente el objeto JSON.' },
        ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.text || '(el usuario mandó una foto)') + (m.image ? ' [adjuntó una foto que no podés ver]' : '') }))] })
    });
    const d = await r.json().catch(() => ({}));
    const out = d && d.result && (typeof d.result.response === 'string' ? d.result.response : JSON.stringify(d.result.response || ''));
    if (!r.ok || !out) throw new Error(`${r.status} ${(d.errors && d.errors[0] && d.errors[0].message) || 'sin respuesta'}`);
    return out;
  } finally { t.done(); }
}

// Abrí /api/chat en el navegador para ver el estado de la IA
async function diagnose(req, res) {
  const out = { claves: { GEMINI_API_KEY: !!process.env.GEMINI_API_KEY, GROQ_API_KEY: !!process.env.GROQ_API_KEY, CF_ACCOUNT_ID: !!process.env.CF_ACCOUNT_ID, CF_API_TOKEN: !!process.env.CF_API_TOKEN }, modelos: {} };
  const msg = [{ role: 'user', text: 'Respondé {"ok":true}' }];
  if (process.env.GEMINI_API_KEY) {
    await Promise.all(geminiModels().map(async m => {
      try { await gemini(m, 'Respondé solo JSON.', msg, 9000); out.modelos[m] = 'funciona'; } catch (e) { out.modelos[m] = e.message; }
    }));
  }
  if (process.env.GROQ_API_KEY) { try { await groq('Respondé solo JSON.', msg, 9000); out.modelos.groq = 'funciona'; } catch (e) { out.modelos.groq = e.message; } }
  if (process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) { try { await cloudflare('Respondé solo JSON.', msg, 12000); out.modelos.cloudflare = 'funciona'; } catch (e) { out.modelos.cloudflare = e.message; } }
  out.resumen = Object.values(out.modelos).includes('funciona') ? 'La IA está funcionando' : 'Ningún modelo respondió: revisá las claves o el cupo diario';
  res.setHeader('content-type', 'application/json; charset=utf-8');
  return res.status(200).send(JSON.stringify(out, null, 2));
}

function normalize(text, ids) {
  // (si hay riesgo, los pasos se descartan más abajo)
  let o = {};
  try { o = JSON.parse(String(text).match(/\{[\s\S]*\}/)[0]); } catch (e) { o = { estado: 'preguntar', mensaje: '¿Me contás un poco más qué pasa?' }; }
  const estado = ESTADOS.includes(o.estado) ? o.estado : 'preguntar';
  const out = {
    estado,
    caso: typeof o.caso === 'string' ? o.caso.slice(0, 80) : '',
    rubro: RUBROS.includes(o.rubro) ? o.rubro : null,
    mensaje: typeof o.mensaje === 'string' ? o.mensaje.slice(0, 600) : '',
    opciones: Array.isArray(o.opciones) ? o.opciones.filter(x => typeof x === 'string').slice(0, 3).map(x => x.slice(0, 80)) : [],
    tutorial: ids.includes(o.tutorial) ? o.tutorial : null,
    riesgo: o.riesgo === true,
    tema_nuevo: o.tema_nuevo === true,
    pasos: Array.isArray(o.pasos) ? o.pasos.filter(x => typeof x === 'string' && x.trim()).slice(0, 8).map(x => x.slice(0, 220)) : [],
    materiales: Array.isArray(o.materiales) ? o.materiales.filter(x => Array.isArray(x) && typeof x[0] === 'string').slice(0, 6).map(x => [x[0].slice(0, 60), String(x[1] || '').slice(0, 120)]) : [],
    nivel: o.nivel === 'Media' ? 'Media' : 'Fácil',
    minutos: Math.max(5, Math.min(180, parseInt(o.minutos, 10) || 20)),
    alerta: typeof o.alerta === 'string' ? o.alerta.slice(0, 240) : '',
    transcripcion: typeof o.transcripcion === 'string' ? o.transcripcion.slice(0, 600) : ''
  };
  if (out.riesgo || out.estado === 'derivar') { out.pasos = []; out.materiales = []; }
  return out;
}
