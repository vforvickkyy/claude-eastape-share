import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { S3Client, GetObjectCommand, DeleteObjectsCommand } from 'https://esm.sh/@aws-sdk/client-s3'
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
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    const fileId = url.searchParams.get('fileId')
    if (!token || !fileId) return json({ error: 'token and fileId are required' }, 400)

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

    const { data, error } = await supabase
      .from('shares')
      .select('id, file_name, file_url, file_size, expires_at, token, storage_deleted')
      .eq('token', token)
      .eq('id', fileId)
      .single()

    if (error || !data) return json({ error: 'File not found' }, 404)

    if (data.storage_deleted) return json({ error: 'This file has already been downloaded and permanently deleted from our servers.', reason: 'downloaded' }, 410)
    if (data.expires_at && new Date(data.expires_at) < new Date()) return json({ error: 'This share link has expired' }, 410)

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: data.file_url,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(data.file_name)}`,
      ResponseCacheControl: 'no-store',
    })
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 120 })

    const { data: batchFiles } = await supabase.from('shares').select('id, file_url').eq('token', data.token)

    await supabase.from('shares')
      .update({ storage_deleted: true, storage_deleted_at: new Date().toISOString() })
      .eq('token', data.token)

    // Background delete (fire and forget)
    if (batchFiles?.length) {
      const keys = batchFiles.map((f: { file_url: string }) => ({ Key: f.file_url }))
      s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys, Quiet: true } })).catch(() => {})
    }

    return json({ url: presignedUrl, fileName: data.file_name })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
