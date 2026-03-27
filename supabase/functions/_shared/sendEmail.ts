export async function sendEmail(params: {
  to?: string
  userId?: string
  notificationType?: string
  template: string
  data: Record<string, any>
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('sendEmail failed:', error)
    }
  } catch (err) {
    // Never throw — email failure should not break main operation
    console.error('sendEmail error (non-fatal):', err)
  }
}
