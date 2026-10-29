// HandyGo · imágenes ilustrativas para cada paso de las guías.
// 1) mode:"prompts" -> Gemini (gratis) traduce los pasos a descripciones visuales en inglés.
// 2) prompt         -> Cloudflare Workers AI (flux-1-schnell, plan gratuito) genera la imagen.
// Variables de entorno en Vercel:
//   CF_ACCOUNT_ID   (obligatoria para imágenes) -> Account ID de Cloudflare
//   CF_API_TOKEN    (obligatoria para imágenes) -> token con permiso "Workers AI"
//   GEMINI_API_KEY  (ya la tenés)               -> para describir cada paso

const STYLE = ', simple flat vector illustration, clean and friendly instructional style, ' +
  'close-up of hands doing the action, home repair, soft forest green, mint green and warm amber colors, ' +
  'plain light off-white background, no text, no letters, no numbers, no watermark';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Usá POST' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const acct = process.env.CF_ACCOUNT_ID, token = process.env.CF_API_TOKEN;
  if (!acct || !token) return res.status(501).json({ ok: false, error: 'sin_configurar' });

  if (body.mode === 'prompts') {
    const pasos = Array.isArray(body.pasos) ? body.pasos.slice(0, 8).map(x => String(x).slice(0, 240)) : [];
    const caso = String(body.caso || '').slice(0, 120);
    try {
      const prompts = await describe(caso, pasos);
      return res.status(200).json({ ok: true, prompts });
    } catch (e) {
      return res.status(200).json({ ok: true, prompts: pasos.map(p => `${caso}. ${p}`) });
    }
  }

  const prompt = String(body.prompt || '').slice(0, 600);
  if (!prompt) return res.status(400).json({ ok: false, error: 'Falta la descripción' });
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: prompt + STYLE, steps: 4 })
    });
    const d = await r.json().catch(() => ({}));
    const img = d && d.result && d.result.image;
    if (!r.ok || !img) {
      const msg = (d && d.errors && d.errors[0] && d.errors[0].message) || r.status;
      console.error('Cloudflare AI:', msg);
      return res.status(502).json({ ok: false, error: 'No se pudo generar la imagen' });
    }
    return res.status(200).json({ ok: true, image: 'data:image/jpeg;base64,' + img });
  } catch (e) {
    console.error('Cloudflare AI:', e.message);
    return res.status(502).json({ ok: false, error: 'No se pudo generar la imagen' });
  }
};

async function describe(caso, pasos) {
  if (!process.env.GEMINI_API_KEY) throw new Error('sin gemini');
  const ask = `These are step-by-step home repair instructions in Argentine Spanish for: "${caso}".
For EACH step write ONE short English description (max 25 words) of a single illustration that shows exactly that action:
the hands, the tool and the object involved, from a clear close-up angle. No text in the image.
Steps:\n${pasos.map((p, i) => `${i + 1}. ${p}`).join('\n')}
Answer ONLY JSON: {"prompts":["...", "..."]} with exactly ${pasos.length} items in the same order.`;
  const models = [process.env.GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3-flash-preview'].filter(Boolean);
  for (const model of [...new Set(models)]) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: ask }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 2048 } })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) continue;
      const text = ((((d.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
      const o = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
      if (Array.isArray(o.prompts) && o.prompts.length) return pasos.map((p, i) => String(o.prompts[i] || p).slice(0, 300));
    } catch (e) { /* probar el siguiente modelo */ }
  }
  throw new Error('sin respuesta');
}
