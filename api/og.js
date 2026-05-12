// Thin proxy — adds the Supabase apikey header that Vercel rewrites can't inject.
// All OG logic lives in the og-preview Supabase edge function.
export default async function handler(req, res) {
  const { token } = req.query
  if (!token) return res.status(400).send('Missing token')

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey    = process.env.VITE_SUPABASE_ANON_KEY

  // Pass the real origin so og:url reflects the actual domain (e.g. studio.eastape.com)
  const host   = req.headers['x-forwarded-host'] || req.headers.host || ''
  const proto  = req.headers['x-forwarded-proto'] || 'https'
  const origin = host ? `${proto}://${host}` : ''

  const upstream = await fetch(
    `${supabaseUrl}/functions/v1/og-preview?token=${encodeURIComponent(token)}&origin=${encodeURIComponent(origin)}`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
  )

  const body = await upstream.text()
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(upstream.status).send(body)
}
