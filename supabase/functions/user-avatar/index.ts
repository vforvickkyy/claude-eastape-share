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

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const authHeader = req.headers.get('Authorization')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader?.replace('Bearer ', '') ?? '')
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    if (req.method === 'DELETE') {
      const { data: list } = await supabase.storage.from('avatars').list(user.id)
      if (list?.length) {
        const paths = list.map((f: { name: string }) => `${user.id}/${f.name}`)
        await supabase.storage.from('avatars').remove(paths)
      }
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, avatar_url: null },
      })
      return json({ ok: true })
    }

    if (req.method === 'POST') {
      const { base64, extension = 'jpg' } = await req.json()
      if (!base64) return json({ error: 'No image data provided.' }, 400)

      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '')
      const binaryStr = atob(base64Data)
      const buffer = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) buffer[i] = binaryStr.charCodeAt(i)

      if (buffer.byteLength > 2 * 1024 * 1024) return json({ error: 'Image must be under 2MB.' }, 400)

      const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension.toLowerCase()) ? extension.toLowerCase() : 'jpg'
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/gif'

      const filePath = `${user.id}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, buffer, { contentType: mimeType, upsert: true })
      if (uploadError) return json({ error: uploadError.message }, 500)

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)

      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, avatar_url: publicUrl },
      })

      return json({ avatarUrl: publicUrl })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
