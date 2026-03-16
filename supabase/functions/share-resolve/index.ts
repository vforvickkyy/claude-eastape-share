import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    if (!token) return json({ error: 'Token required' }, 400)

    const { data, error } = await supabase
      .from('shares')
      .select('id, file_name, file_size, created_at, expires_at, storage_deleted')
      .eq('token', token)
      .order('id', { ascending: true })

    if (error) return json({ error: 'Database error', detail: error.message }, 500)
    if (!data || data.length === 0) return json({ error: 'Share not found' }, 404)

    const expired = data[0].expires_at && new Date(data[0].expires_at) < new Date()
    if (expired) return json({ error: 'This share link has expired' }, 410)

    const allDeleted = data.every((row: { storage_deleted: boolean }) => row.storage_deleted)
    if (allDeleted) return json({ error: 'This file has already been downloaded and permanently deleted.', reason: 'downloaded' }, 410)

    return json({
      token,
      expires_at: data[0].expires_at,
      files: data.map((row: { id: string; file_name: string; file_size: number; created_at: string; storage_deleted: boolean }) => ({
        id: row.id,
        file_name: row.file_name,
        file_size: row.file_size,
        created_at: row.created_at,
        storage_deleted: row.storage_deleted,
      })),
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
