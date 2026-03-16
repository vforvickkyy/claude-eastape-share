import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3'
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const s3 = new S3Client({
      region: Deno.env.get('WASABI_REGION') ?? 'us-east-1',
      endpoint: Deno.env.get('WASABI_ENDPOINT'),
      credentials: {
        accessKeyId: Deno.env.get('WASABI_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('WASABI_SECRET_ACCESS_KEY')!,
      },
      forcePathStyle: true,
    })

    const BUCKET = Deno.env.get('WASABI_BUCKET')!
    const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60

    const { files, userId, folderId } = await req.json()
    if (!files || !Array.isArray(files) || files.length === 0) return json({ error: 'No files provided' }, 400)
    if (files.length > 20) return json({ error: 'Max 20 files per share' }, 400)

    // Generate random token via Web Crypto
    const tokenBytes = new Uint8Array(16)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    const expiresAt = new Date(Date.now() + SHARE_TTL_SECONDS * 1000).toISOString()

    const uploads = await Promise.all(files.map(async (file: { name: string; type: string; size: number }) => {
      const safeName = file.name
        .replace(/\\/g, '/')
        .split('/').pop()!
        .replace(/[^\w.\-() ]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 255) || 'file'

      const s3Key = `shares/${token}/${safeName}`
      const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        ContentType: file.type || 'application/octet-stream',
        ContentLength: file.size,
      })
      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })
      return { originalName: file.name, safeName, s3Key, size: file.size, type: file.type, presignedUrl }
    }))

    const rows = uploads.map(u => ({
      token,
      file_name: u.safeName,
      file_url: u.s3Key,
      file_size: u.size,
      expires_at: expiresAt,
      user_id: userId || user.id,
      folder_id: folderId || null,
    }))

    const { error: dbError } = await supabase.from('shares').insert(rows)
    if (dbError) return json({ error: 'Database error', detail: dbError.message }, 500)

    return json({
      token,
      uploads: uploads.map(u => ({ name: u.originalName, presignedUrl: u.presignedUrl, size: u.size })),
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
