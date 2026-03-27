import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'notifications@eastape.com'
const FROM_NAME = 'Eastape'
const APP_URL = 'https://claude-eastape-share.vercel.app'

const emailHeader = `
  <div style="background:#0a0a0f;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh">
  <div style="max-width:480px;margin:0 auto">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="color:white;font-size:28px;font-weight:900;letter-spacing:3px;margin:0">EASTAPE</h1>
    <p style="color:#7c3aed;font-size:14px;font-weight:300;margin:4px 0 0">Share</p>
  </div>
`

const emailFooter = `
  <p style="color:#404050;font-size:11px;text-align:center;margin-top:24px">
    © 2026 Eastape Films. All rights reserved.<br>
    <a href="${APP_URL}" style="color:#606070;text-decoration:none">eastape.com</a>
  </p>
  </div></div>
`

const card = (content: string, borderColor = '#2a2a3a') => `
  <div style="background:#13131a;border:1px solid ${borderColor};border-radius:16px;padding:32px;margin-bottom:16px">
    ${content}
  </div>
`

const primaryButton = (text: string, url: string, color = '#7c3aed') => `
  <a href="${url}"
     style="display:block;background:linear-gradient(135deg,${color},${color}dd);
            color:white;text-decoration:none;text-align:center;
            padding:14px 24px;border-radius:12px;font-size:16px;
            font-weight:600;margin-top:20px">
    ${text}
  </a>
`

const statusBadge = (text: string, color: string) => `
  <span style="background:${color}22;color:${color};padding:4px 12px;
               border-radius:999px;font-size:13px;font-weight:600">
    ${text}
  </span>
`

const templates: Record<string, (data: any) => { subject: string; html: string }> = {

  welcome: (data) => ({
    subject: `Welcome to Eastape, ${data.name}! 🎬`,
    html: emailHeader + card(`
      <h2 style="color:white;font-size:22px;font-weight:700;margin:0 0 8px">
        Welcome, ${data.name}! 👋
      </h2>
      <p style="color:#606070;font-size:15px;line-height:1.6;margin:0 0 20px">
        Your Eastape account is ready. You can now manage projects,
        share files, review videos, and collaborate with your team.
      </p>
      <div style="background:#1a1a24;border-radius:10px;padding:16px;margin-bottom:4px">
        <p style="color:#606070;font-size:13px;margin:0 0 8px">Get started:</p>
        <p style="color:#a0a0b0;font-size:13px;margin:4px 0">🎬 Create your first project</p>
        <p style="color:#a0a0b0;font-size:13px;margin:4px 0">📁 Upload files to Drive</p>
        <p style="color:#a0a0b0;font-size:13px;margin:4px 0">👥 Invite your team</p>
      </div>
      ${primaryButton('Open Eastape →', APP_URL + '/dashboard')}
    `) + emailFooter
  }),

  teamInvite: (data) => ({
    subject: `${data.inviterName} invited you to ${data.projectName}`,
    html: emailHeader + card(`
      <h2 style="color:white;font-size:22px;font-weight:700;margin:0 0 8px">
        You've been invited! 👥
      </h2>
      <p style="color:#606070;font-size:15px;margin:0 0 16px">
        <strong style="color:#a0a0b0">${data.inviterName}</strong>
        invited you to collaborate on:
      </p>
      <div style="background:#1a1a24;border:1px solid #2a2a3a;border-radius:10px;padding:16px;margin:0 0 4px">
        <p style="color:white;font-size:18px;font-weight:700;margin:0 0 6px">
          ${data.projectIcon || '🎬'} ${data.projectName}
        </p>
        <p style="color:#7c3aed;font-size:13px;margin:0">
          Your role: <strong>${data.role}</strong>
        </p>
        ${data.clientName ? `<p style="color:#606070;font-size:12px;margin:4px 0 0">Client: ${data.clientName}</p>` : ''}
      </div>
      ${primaryButton('Accept Invitation →', data.acceptUrl || APP_URL + '/projects')}
      <p style="color:#404050;font-size:12px;text-align:center;margin-top:12px">
        Invitation expires in 7 days
      </p>
    `) + emailFooter
  }),

  commentAdded: (data) => ({
    subject: `${data.commenterName} commented on ${data.fileName}`,
    html: emailHeader + card(`
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 16px">
        💬 New Comment
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 4px">
        <strong style="color:#a0a0b0">${data.commenterName}</strong>
        commented on
        <strong style="color:#a0a0b0">${data.fileName}</strong>
        ${data.timestamp ? `at <span style="color:#7c3aed;font-weight:600">${data.timestamp}</span>` : ''}
      </p>
      <div style="background:#1a1a24;border-left:3px solid #7c3aed;
                  padding:16px;margin:16px 0;border-radius:0 8px 8px 0">
        <p style="color:white;font-size:15px;line-height:1.5;margin:0">
          "${data.commentBody}"
        </p>
      </div>
      ${primaryButton('View & Reply →', data.viewUrl || APP_URL)}
    `) + emailFooter
  }),

  mentionedInComment: (data) => ({
    subject: `${data.mentionerName} mentioned you in a comment`,
    html: emailHeader + card(`
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 16px">
        🔔 You were mentioned
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px">
        <strong style="color:#a0a0b0">${data.mentionerName}</strong>
        mentioned you in <strong style="color:#a0a0b0">${data.fileName}</strong>
      </p>
      <div style="background:#1a1a24;border-left:3px solid #a78bfa;
                  padding:16px;margin:0 0 4px;border-radius:0 8px 8px 0">
        <p style="color:white;font-size:15px;line-height:1.5;margin:0">
          "${data.commentBody}"
        </p>
      </div>
      ${primaryButton('View Comment →', data.viewUrl || APP_URL)}
    `) + emailFooter
  }),

  statusChanged: (data) => ({
    subject: `${data.fileName} marked as ${data.newStatus}`,
    html: emailHeader + card(`
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 16px">
        Status Updated
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px">
        <strong style="color:#a0a0b0">${data.changedBy}</strong>
        updated the status of
        <strong style="color:#a0a0b0">${data.fileName}</strong>
      </p>
      <div style="display:flex;align-items:center;gap:12px;margin:16px 0;flex-wrap:wrap">
        ${statusBadge(data.oldStatus, '#606070')}
        <span style="color:#404050;font-size:18px">→</span>
        ${statusBadge(data.newStatus,
          data.newStatus === 'Approved' ? '#10b981' :
          data.newStatus === 'Revision' ? '#ef4444' : '#f59e0b'
        )}
      </div>
      ${data.projectName ? `<p style="color:#606070;font-size:13px;margin:0">Project: ${data.projectName}</p>` : ''}
      ${primaryButton('View File →', data.viewUrl || APP_URL)}
    `) + emailFooter
  }),

  fileUploaded: (data) => ({
    subject: `New file uploaded to ${data.projectName}`,
    html: emailHeader + card(`
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 16px">
        📁 New File Uploaded
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px">
        <strong style="color:#a0a0b0">${data.uploaderName}</strong>
        uploaded a file to
        <strong style="color:#a0a0b0">${data.projectName}</strong>
      </p>
      <div style="background:#1a1a24;border-radius:10px;padding:16px;margin:0 0 4px">
        <p style="color:white;font-size:15px;font-weight:600;margin:0 0 4px">
          📄 ${data.fileName}
        </p>
        <p style="color:#606070;font-size:13px;margin:0">${data.fileSize}</p>
      </div>
      ${primaryButton('View Project →', data.projectUrl || APP_URL)}
    `) + emailFooter
  }),

  shotAssigned: (data) => ({
    subject: `You've been assigned: ${data.shotName}`,
    html: emailHeader + card(`
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 16px">
        🎯 Shot Assigned to You
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px">
        <strong style="color:#a0a0b0">${data.assignedBy}</strong>
        assigned you a shot in
        <strong style="color:#a0a0b0">${data.projectName}</strong>
      </p>
      <div style="background:#1a1a24;border-radius:10px;padding:16px;margin:0 0 4px">
        <p style="color:white;font-size:16px;font-weight:700;margin:0 0 4px">
          ${data.shotNumber ? data.shotNumber + ' ' : ''}${data.shotName}
        </p>
        ${data.dueDate ? `<p style="color:#f59e0b;font-size:13px;margin:4px 0">Due: ${data.dueDate}</p>` : ''}
        ${data.priority && data.priority !== 'normal' ? `
          <p style="color:${data.priority === 'urgent' ? '#ef4444' : '#f59e0b'};font-size:13px;margin:4px 0">
            Priority: ${data.priority.toUpperCase()}
          </p>
        ` : ''}
      </div>
      ${primaryButton('View Shot →', data.projectUrl || APP_URL)}
    `) + emailFooter
  }),

  deadlineReminder: (data) => ({
    subject: `⚠️ ${data.projectName} deadline in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}`,
    html: emailHeader + card(`
      <div style="font-size:32px;margin-bottom:16px">⚠️</div>
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 8px">
        Deadline Approaching
      </h2>
      <p style="color:#606070;font-size:15px;margin:0 0 16px">
        <strong style="color:#a0a0b0">${data.projectName}</strong>
        is due in
        <strong style="color:#f59e0b">${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}</strong>
      </p>
      <div style="background:#1a1a24;border-radius:10px;padding:16px;margin:0 0 4px">
        <p style="color:#a0a0b0;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px">Due Date</p>
        <p style="color:white;font-size:16px;font-weight:600;margin:0">${data.dueDate}</p>
        ${data.clientName ? `<p style="color:#606070;font-size:13px;margin:4px 0 0">Client: ${data.clientName}</p>` : ''}
      </div>
      ${primaryButton('Open Project →', data.projectUrl || APP_URL, '#f59e0b')}
    `, '#f59e0b44') + emailFooter
  }),

  shareLink: (data) => ({
    subject: `${data.sharedBy} shared "${data.fileName}" with you`,
    html: emailHeader + card(`
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 16px">
        🔗 File Shared With You
      </h2>
      <p style="color:#606070;font-size:15px;margin:0 0 16px">
        <strong style="color:#a0a0b0">${data.sharedBy}</strong>
        shared a file with you:
      </p>
      <div style="background:#1a1a24;border-radius:10px;padding:16px;margin:0 0 4px">
        <p style="color:white;font-size:16px;font-weight:600;margin:0 0 4px">
          ${data.fileName}
        </p>
        ${data.message ? `<p style="color:#606070;font-size:13px;margin:8px 0 0;font-style:italic">"${data.message}"</p>` : ''}
      </div>
      ${primaryButton('View Shared File →', data.shareUrl)}
      ${data.expiresAt ? `<p style="color:#404050;font-size:12px;text-align:center;margin-top:12px">Link expires: ${data.expiresAt}</p>` : ''}
    `) + emailFooter
  }),

}

async function shouldSendEmail(
  userId: string,
  notificationType: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<{ send: boolean; email: string }> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=email,email_notifications`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      }
    }
  )
  const profiles = await response.json()
  if (!profiles?.[0]) return { send: false, email: '' }

  const profile = profiles[0]
  const prefs = profile.email_notifications || {}

  return {
    send: prefs[notificationType] !== false,
    email: profile.email
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { to, template, data, userId, notificationType } = body

    let recipientEmail = to

    if (userId && notificationType) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const { send, email } = await shouldSendEmail(userId, notificationType, supabaseUrl, serviceKey)
      if (!send) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'User preference disabled' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      recipientEmail = to || email
    }

    if (!recipientEmail || !template) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, template' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!templates[template]) {
      return new Response(
        JSON.stringify({ error: `Unknown template: ${template}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { subject, html } = templates[template](data || {})

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: Array.isArray(recipientEmail) ? recipientEmail : [recipientEmail],
        subject,
        html,
      }),
    })

    const result = await resendResponse.json()

    if (!resendResponse.ok) {
      console.error('Resend error:', result)
      throw new Error(result.message || 'Failed to send email via Resend')
    }

    console.log(`Email sent: template=${template} to=${recipientEmail} id=${result.id}`)

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-email error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
