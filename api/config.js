// HandyGo · le pasa a la app los datos públicos de Supabase (la clave "anon" es pública por diseño;
// la seguridad la dan las reglas de la base de datos).
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  const url = process.env.SUPABASE_URL || '', key = process.env.SUPABASE_ANON_KEY || '';
  return res.status(200).json({ ok: !!(url && key), supabaseUrl: url, supabaseKey: key });
};
