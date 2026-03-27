import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from '../_shared/sendEmail.ts'

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Find projects due in exactly 3 days
  const threeDaysFromNow = new Date()
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
  const dateStr = threeDaysFromNow.toISOString().split('T')[0]

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, due_date, client_name, user_id')
    .eq('due_date', dateStr)

  if (error) {
    console.error('deadline-reminders query error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const processed: string[] = []

  for (const project of projects || []) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, email_notifications')
        .eq('id', project.user_id)
        .single()

      if (!profile?.email) continue
      if (profile.email_notifications?.deadlines === false) continue

      await sendEmail({
        to: profile.email,
        template: 'deadlineReminder',
        data: {
          projectName: project.name,
          daysLeft: 3,
          dueDate: new Date(project.due_date).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          }),
          clientName: project.client_name || null,
          projectUrl: `https://claude-eastape-share.vercel.app/projects/${project.id}`,
        }
      })
      processed.push(project.id)
    } catch (err) {
      console.error(`Failed to send deadline reminder for project ${project.id}:`, err)
    }
  }

  return new Response(JSON.stringify({ processed: processed.length, ids: processed }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
