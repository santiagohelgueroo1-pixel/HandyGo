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
   - "guiar": si el problema coincide con una guía del CATÁLOGO y es seguro hacerlo uno mismo. Indicá su id en "tutorial".
   - "derivar": si hace falta un profesional (no hay guía en el catálogo, el usuario no pudo, o la falla es más grave).
3. NO inventes pasos de reparación: los pasos los muestra la app desde guías revisadas. Solo podés guiar con un id del catálogo.
4. Si te mandan una foto, describí brevemente lo que ves y usalo para acotar.

SEGURIDAD (NO NEGOCIABLE)
- Nunca des instrucciones para instalaciones o artefactos de GAS (calefón, estufa, termotanque, anafe, garrafa, olor a gas),
  ELECTRICIDAD COMPLEJA (tablero, térmicas que saltan, cableado, chispas, olor a quemado, descargas) ni problemas ESTRUCTURALES
  (grietas, fisuras, columnas, vigas, losas, techos que ceden).
- En esos casos: estado "derivar", "riesgo": true, explicá en el mensaje por qué no conviene intervenir y qué hacer ya para estar a salvo.
- Si la persona insiste en hacerlo sola, mantené la negativa con amabilidad.
- Si dudás de que sea seguro, derivá.

Si el mensaje no tiene que ver con el hogar, estado "fuera_de_tema" y explicá en una frase en qué podés ayudar.

RESPONDÉ SOLO con un objeto JSON válido, sin texto extra:
{"estado":"preguntar|guiar|derivar|fuera_de_tema","caso":"nombre corto del problema","rubro":"Plomería|Gas|Electricidad|Carpintería|Albañilería","mensaje":"máximo 3 frases para el usuario","opciones":["solo si estado es preguntar: 2 o 3 respuestas cortas"],"tutorial":"id del catálogo o null","riesgo":true}`;

const ESTADOS = ['preguntar', 'guiar', 'derivar', 'fuera_de_tema'];
const RUBROS = ['Plomería', 'Gas', 'Electricidad', 'Carpintería', 'Albañilería'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Usá POST' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const messages = Array.isArray(body && body.messages) ? body.messages.slice(-12) : [];
  const catalog = Array.isArray(body && body.catalog) ? body.catalog.slice(0, 40) : [];
  if (!messages.length) return res.status(400).json({ ok: false, error: 'Faltan mensajes' });

  const system = SYSTEM + '\n\nCATÁLOGO DE GUÍAS REVISADAS (id: título · rubro · cuándo usarla):\n' +
    catalog.map(c => `- ${String(c.id)}: ${String(c.titulo)} · ${String(c.rubro)} · ${String(c.cuando)}`).join('\n');
  const ids = catalog.map(c => String(c.id));

  const errors = [];
  if (process.env.GEMINI_API_KEY) {
    const models = [process.env.GEMINI_MODEL, 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter(Boolean);
    for (const model of [...new Set(models)]) {
      try {
        const text = await gemini(model, system, messages);
        return res.status(200).json({ ok: true, provider: 'gemini', model, reply: normalize(text, ids) });
      } catch (e) { errors.push(`${model}: ${e.message}`); }
    }
  }
  if (process.env.GROQ_API_KEY) {
    try {
      const text = await groq(system, messages);
      return res.status(200).json({ ok: true, provider: 'groq', reply: normalize(text, ids) });
    } catch (e) { errors.push(`groq: ${e.message}`); }
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) errors.push('No hay ninguna clave configurada (GEMINI_API_KEY)');
  console.error('HandyGo IA sin respuesta:', errors.join(' | '));
  return res.status(502).json({ ok: false, error: 'La IA no respondió', detail: errors });
};

async function gemini(model, system, messages) {
  const contents = messages.map(m => {
    const parts = [];
    if (m.image && m.image.data) parts.push({ inlineData: { mimeType: m.image.mime || 'image/jpeg', data: String(m.image.data) } });
    parts.push({ text: String(m.text || '(foto)').slice(0, 2000) });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 2048 }
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${(d.error && d.error.message) || ''}`.trim());
  const text = (((d.candidates || [])[0] || {}).content || {}).parts;
  const out = (text || []).map(p => p.text || '').join('');
  if (!out) throw new Error('respuesta vacía');
  return out;
}

async function groq(system, messages) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system },
        ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.text || '(el usuario mandó una foto)') + (m.image ? ' [adjuntó una foto]' : '') }))]
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${(d.error && d.error.message) || ''}`.trim());
  const out = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!out) throw new Error('respuesta vacía');
  return out;
}

function normalize(text, ids) {
  let o = {};
  try { o = JSON.parse(String(text).match(/\{[\s\S]*\}/)[0]); } catch (e) { o = { estado: 'preguntar', mensaje: '¿Me contás un poco más qué pasa?' }; }
  const estado = ESTADOS.includes(o.estado) ? o.estado : 'preguntar';
  return {
    estado,
    caso: typeof o.caso === 'string' ? o.caso.slice(0, 80) : '',
    rubro: RUBROS.includes(o.rubro) ? o.rubro : null,
    mensaje: typeof o.mensaje === 'string' ? o.mensaje.slice(0, 600) : '',
    opciones: Array.isArray(o.opciones) ? o.opciones.filter(x => typeof x === 'string').slice(0, 3).map(x => x.slice(0, 80)) : [],
    tutorial: ids.includes(o.tutorial) ? o.tutorial : null,
    riesgo: o.riesgo === true
  };
}
