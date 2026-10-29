# HandyGo · prototipo

App web instalable (PWA) con chat de IA. Todo con planes gratuitos.

## Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app completa (pantallas, chat, tutoriales, pedidos, prestadores) |
| `api/chat.js` | El servidor del chat: conecta con la IA de Gemini sin exponer la clave |
| `manifest.webmanifest`, `sw.js`, `icons/` | Lo que hace que se pueda instalar en el celular |

## Publicarla gratis (una sola vez, ~10 minutos)

### 1. Sacar la clave gratuita de Gemini
1. Entrá a **aistudio.google.com** con una cuenta de Google.
2. Tocá **Get API key → Create API key**. No pide tarjeta.
3. Copiá la clave y guardala (no la compartas ni la subas a ningún lado).

### 2. Subir la carpeta a GitHub
1. Creá una cuenta gratis en **github.com**.
2. **New repository** → nombre `handygo` → Create.
3. En el repositorio vacío, tocá **uploading an existing file** y arrastrá **todo el contenido** de esta carpeta (incluidas las carpetas `api` e `icons`). → **Commit changes**.

### 3. Publicar en Vercel
1. Entrá a **vercel.com** y registrate con tu cuenta de GitHub (plan Hobby, gratis).
2. **Add New → Project** → elegí el repositorio `handygo` → **Import**.
3. Antes de publicar, abrí **Environment Variables** y agregá:
   - Name: `GEMINI_API_KEY` · Value: la clave del paso 1
4. Tocá **Deploy**. En un minuto te da un link tipo `handygo.vercel.app`.

> Si agregás la clave después de publicar, hay que volver a publicar: **Deployments → ⋯ → Redeploy**.

### 4. Instalarla en el celular
- **iPhone (Safari):** abrí el link → botón Compartir → **Agregar a pantalla de inicio**.
- **Android (Chrome):** abrí el link → menú ⋮ → **Instalar app** / **Agregar a pantalla de inicio**.

Para la presentación podés generar un QR del link para que la instalen desde la sala.

## Respaldo opcional (Groq, también gratis)
Si en la presentación se agota el cupo de Gemini, el servidor prueba con Groq.
Creá una clave en **console.groq.com/keys** y agregala en Vercel como `GROQ_API_KEY`.

## Cómo funciona el chat
- Primero la app revisa el mensaje con un **freno de seguridad propio**: gas, electricidad compleja y problemas estructurales se frenan **antes** de llegar a la IA.
- La IA hace preguntas de a una y elige una **guía revisada** del catálogo. No inventa pasos: si no hay guía, deriva a un profesional.
- Se pueden mandar **fotos** del problema (Gemini las interpreta).
- Si la IA no responde (sin internet, sin clave o sin cupo), la app sigue funcionando con reglas y muestra “modo sin conexión”.

## Para la demo
- **Entrar con una cuenta de prueba** (pantalla inicial) carga una usuaria y prestadores con datos de ejemplo.
- Casos que muestran los tres pilares:
  1. *“La canilla gotea”* → pregunta → guía paso a paso → materiales y ferreterías.
  2. *“Huelo gas en la cocina”* → freno de seguridad → pedido a un gasista matriculado.
  3. Guía → *“No pude, quiero un profesional”* → orden de caso → presupuestos → chat → reseña.
- **Perfil → Reiniciar el prototipo** borra todo para empezar de cero.
- Los datos se guardan en el navegador de cada dispositivo (es un prototipo, no hay base de datos).
- Pagos, verificación con RENAPER, anuncios y presupuestos de prestadores están **simulados**.

## Datos que conviene saber
- En el plan gratuito de Gemini, Google puede usar lo que se envía para mejorar sus productos: no cargues datos personales reales en la demo.
