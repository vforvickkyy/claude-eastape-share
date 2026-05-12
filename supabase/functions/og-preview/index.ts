import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function html(content: string) {
  return new Response(content, {
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function fallbackHtml(siteUrl: string, token: string) {
  return html(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta property="og:title" content="Shared Media" />
  <meta property="og:description" content="View this shared media on Eastape." />
  <meta property="og:type" content="website" />
  <script>window.location.replace('/media/view/${token}')</script>
</head>
<body></body>
</html>`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const url     = new URL(req.url)
  const token   = url.searchParams.get('token') || url.pathname.split('/').pop() || ''
  // Use origin passed by the Vercel proxy (preserves studio.eastape.com), fallback to env
  const siteUrl = (url.searchParams.get('origin') || Deno.env.get('SITE_URL') || 'https://studio.eastape.com').replace(/\/$/, '')

  if (!token) return html(`<!DOCTYPE html><html><head><script>window.location.replace('/')</script></head><body></body></html>`)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: link } = await supabase
      .from('share_links')
      .select('id, expires_at, project_media_id, project_media(name, cloudflare_uid, type, mime_type, cloudflare_status)')
      .or(`token.eq.${token},short_token.eq.${token}`)
      .single()

    if (!link) return fallbackHtml(siteUrl, token)
    if (link.expires_at && new Date(link.expires_at) < new Date()) return fallbackHtml(siteUrl, token)

    const asset    = link.project_media as any
    const title    = asset?.name || 'Shared Media'
    const cfUid    = asset?.cloudflare_uid
    const shareUrl = `${siteUrl}/media/share/${token}`
    const viewUrl  = `/media/view/${token}` // relative — browser stays on its current domain

    const imageUrl = cfUid
      ? `https://videodelivery.net/${cfUid}/thumbnails/thumbnail.jpg?width=1280&height=720&fit=crop`
      : `${siteUrl}/og-placeholder.png`

    const description = cfUid
      ? `Watch "${title}" — shared via Eastape`
      : `View "${title}" — shared via Eastape`

    return html(`<!DOCTYPE html>
<html prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(title)}</title>

  <!-- Open Graph -->
  <meta property="og:type"        content="video.other" />
  <meta property="og:title"       content="${escHtml(title)}" />
  <meta property="og:description" content="${escHtml(description)}" />
  <meta property="og:url"         content="${escHtml(shareUrl)}" />
  <meta property="og:image"       content="${escHtml(imageUrl)}" />
  <meta property="og:image:width"  content="1280" />
  <meta property="og:image:height" content="720" />
  <meta property="og:site_name"   content="Eastape" />
  ${cfUid ? `<meta property="og:video"              content="https://videodelivery.net/${cfUid}/manifest/video.m3u8" />
  <meta property="og:video:secure_url"  content="https://videodelivery.net/${cfUid}/manifest/video.m3u8" />
  <meta property="og:video:type"        content="application/x-mpegURL" />` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${escHtml(title)}" />
  <meta name="twitter:description" content="${escHtml(description)}" />
  <meta name="twitter:image"       content="${escHtml(imageUrl)}" />

  <!-- Instant redirect for real browsers (crawlers don't run JS) -->
  <script>window.location.replace('${viewUrl}')</script>
  <noscript><meta http-equiv="refresh" content="0;url=${viewUrl}" /></noscript>
</head>
<body style="margin:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;color:#fff">
  <div style="text-align:center;padding:32px">
    <div style="width:40px;height:40px;border:3px solid #333;border-top-color:#6366f1;border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto 16px"></div>
    <p style="color:#888;font-size:14px">Opening…</p>
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
</body>
</html>`)
  } catch (err) {
    console.error(err)
    return fallbackHtml(siteUrl, token)
  }
})

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
