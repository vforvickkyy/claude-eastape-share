import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { S3Client, DeleteObjectsCommand } from 'https://esm.sh/@aws-sdk/client-s3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const authHeader = req.headers.get('Authorization')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader?.replace('Bearer ', '') ?? '')
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

    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) return json({ error: 'Token is required.' }, 400)

    const { data: rows, error: fetchError } = await supabase
      .from('shares')
      .select('id, file_url')
      .eq('token', token)
      .eq('user_id', user.id)

    if (fetchError) return json({ error: fetchError.message }, 500)
    if (!rows || rows.length === 0) return json({ error: 'Share not found.' }, 404)

    if (req.method === 'PUT') {
      const { action, folderId, name } = await req.json()

      if (action === 'trash') {
        const { error } = await supabase.from('shares').update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq('token', token).eq('user_id', user.id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      if (action === 'restore') {
        const { error } = await supabase.from('shares').update({ is_trashed: false, trashed_at: null }).eq('token', token).eq('user_id', user.id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      if (action === 'move') {
        const { error } = await supabase.from('shares').update({ folder_id: folderId || null }).eq('token', token).eq('user_id', user.id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      if (action === 'rename') {
        if (!name?.trim()) return json({ error: 'Name is required.' }, 400)
        const { error } = await supabase.from('shares').update({ file_name: name.trim() }).eq('id', rows[0].id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      return json({ error: 'Unknown action.' }, 400)
    }

    if (req.method === 'DELETE') {
      const s3Keys = rows.map((r: { file_url: string }) => ({ Key: r.file_url }))
      try {
        await s3.send(new DeleteObjectsCommand({ Bucket: Deno.env.get('WASABI_BUCKET')!, Delete: { Objects: s3Keys } }))
      } catch {}

      const { error } = await supabase.from('shares').delete().eq('token', token).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
