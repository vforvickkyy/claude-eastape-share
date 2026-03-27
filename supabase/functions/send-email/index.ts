import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'notifications@eastape.com'
const FROM_NAME = 'Eastape'
const APP_URL = 'https://claude-eastape-share.vercel.app'
const LOGO_URL = 'https://zzevqgnhbintrpohunjr.supabase.co/storage/v1/object/public/Site%20Assets/logo.png'

// Shared components
const logo = `
  <div style="text-align:center;margin-bottom:32px">
    <img src="${LOGO_URL}" alt="Eastape" width="140"
         style="display:block;margin:0 auto;max-width:140px;height:auto"/>
  </div>
`

const footer = `
  <p style="color:#404050;font-size:11px;text-align:center;margin-top:24px;line-height:1.6">
    © 2026 Eastape Films. All rights reserved.<br>
    <a href="${APP_URL}" style="color:#505060;text-decoration:none">${APP_URL.replace('https://', '')}</a>
  </p>
`

const wrapper = (content: string) => `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#0a0a0f">
  <div style="background:#0a0a0f;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:0 auto">
    ${logo}
    ${content}
    ${footer}
  </div>
  </div>
  </body>
  </html>
`

const card = (content: string, borderColor = '#2a2a3a') => `
  <div style="background:#13131a;border:1px solid ${borderColor};border-radius:16px;padding:32px">
    ${content}
  </div>
`

const button = (text: string, url: string, color = '#7c3aed') => `
  <a href="${url}"
     style="display:block;background:linear-gradient(135deg,${color},${color}dd);
            color:white;text-decoration:none;text-align:center;
            padding:14px 24px;border-radius:12px;font-size:16px;
            font-weight:600;margin-top:20px;margin-bottom:4px">
    ${text}
  </a>
`

const infoBox = (content: string) => `
  <div style="background:#0a0a0f;border:1px solid #2a2a3a;border-radius:10px;
              padding:16px;margin:16px 0">
    ${content}
  </div>
`

const statusPill = (text: string, color: string) => `
  <span style="background:${color}22;color:${color};padding:4px 14px;
               border-radius:999px;font-size:13px;font-weight:600;
               display:inline-block">
    ${text}
  </span>
`

// All email templates
const templates: Record<string, (data: any) => { subject: string; html: string }> = {

  welcome: (data) => ({
    subject: `Welcome to Eastape, ${data.name}! 🎬`,
    html: wrapper(card(`
      <div style="font-size:36px;margin-bottom:16px">👋</div>
      <h2 style="color:white;font-size:22px;font-weight:700;margin:0 0 8px">
        Welcome, ${data.name}!
      </h2>
      <p style="color:#606070;font-size:15px;margin:0 0 20px;line-height:1.6">
        Your Eastape account is ready. Start managing your projects,
        sharing files, and collaborating with your team.
      </p>
      ${infoBox(`
        <p style="color:#606070;font-size:13px;margin:0 0 10px">Get started:</p>
        <p style="color:#a0a0b0;font-size:13px;margin:4px 0">🎬&nbsp; Create your first project</p>
        <p style="color:#a0a0b0;font-size:13px;margin:4px 0">📁&nbsp; Upload files to Drive</p>
        <p style="color:#a0a0b0;font-size:13px;margin:4px 0">👥&nbsp; Invite your team members</p>
        <p style="color:#a0a0b0;font-size:13px;margin:4px 0">🎬&nbsp; Review and approve media</p>
      `)}
      ${button('Open Eastape →', APP_URL + '/dashboard')}
    `))
  }),

  teamInvite: (data) => ({
    subject: `${data.inviterName} invited you to ${data.projectName}`,
    html: wrapper(card(`
      <div style="font-size:36px;margin-bottom:16px">👥</div>
      <h2 style="color:white;font-size:22px;font-weight:700;margin:0 0 8px">
        You've been invited!
      </h2>
      <p style="color:#606070;font-size:15px;margin:0 0 16px;line-height:1.6">
        <strong style="color:#a0a0b0">${data.inviterName}</strong>
        invited you to collaborate on a project:
      </p>
      ${infoBox(`
        <p style="color:white;font-size:18px;font-weight:700;margin:0 0 6px">
          ${data.projectIcon || '🎬'}&nbsp;${data.projectName}
        </p>
        <p style="color:#7c3aed;font-size:13px;margin:0 0 4px">
          Your role: <strong>${data.role}</strong>
        </p>
        ${data.clientName ? `<p style="color:#606070;font-size:12px;margin:4px 0 0">Client: ${data.clientName}</p>` : ''}
      `)}
      ${button('Accept Invitation →', data.acceptUrl || APP_URL + '/projects')}
      <p style="color:#404050;font-size:12px;text-align:center;margin-top:12px">
        This invitation expires in 7 days
      </p>
    `))
  }),

  commentAdded: (data) => ({
    subject: `${data.commenterName} commented on ${data.fileName}`,
    html: wrapper(card(`
      <div style="font-size:36px;margin-bottom:16px">💬</div>
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 12px">
        New Comment
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px;line-height:1.5">
        <strong style="color:#a0a0b0">${data.commenterName}</strong>
        commented on
        <strong style="color:#a0a0b0">${data.fileName}</strong>
        ${data.timestamp ? `<br>at timestamp <span style="color:#7c3aed;font-weight:600">${data.timestamp}</span>` : ''}
      </p>
      <div style="background:#0a0a0f;border-left:3px solid #7c3aed;
                  padding:16px;border-radius:0 8px 8px 0;margin-bottom:4px">
        <p style="color:white;font-size:15px;line-height:1.6;margin:0;font-style:italic">
          "${data.commentBody}"
        </p>
      </div>
      ${button('View & Reply →', data.viewUrl || APP_URL)}
    `))
  }),

  mentionedInComment: (data) => ({
    subject: `${data.mentionerName} mentioned you in a comment`,
    html: wrapper(card(`
      <div style="font-size:36px;margin-bottom:16px">🔔</div>
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 12px">
        You were mentioned
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px;line-height:1.5">
        <strong style="color:#a0a0b0">${data.mentionerName}</strong>
        mentioned you in a comment on
        <strong style="color:#a0a0b0">${data.fileName}</strong>
      </p>
      <div style="background:#0a0a0f;border-left:3px solid #a78bfa;
                  padding:16px;border-radius:0 8px 8px 0;margin-bottom:4px">
        <p style="color:white;font-size:15px;line-height:1.6;margin:0;font-style:italic">
          "${data.commentBody}"
        </p>
      </div>
      ${button('View Comment →', data.viewUrl || APP_URL)}
    `))
  }),

  statusChanged: (data) => ({
    subject: `${data.fileName} marked as ${data.newStatus}`,
    html: wrapper(card(`
      <div style="font-size:36px;margin-bottom:16px">🔄</div>
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 12px">
        Status Updated
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px;line-height:1.5">
        <strong style="color:#a0a0b0">${data.changedBy}</strong>
        updated the status of
        <strong style="color:#a0a0b0">${data.fileName}</strong>
      </p>
      ${infoBox(`
        <p style="color:#606070;font-size:12px;margin:0 0 10px;text-transform:uppercase;
                  letter-spacing:1px;font-weight:600">Status change</p>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          ${statusPill(data.oldStatus, '#606070')}
          <span style="color:#404050;font-size:16px">→</span>
          ${statusPill(data.newStatus,
            data.newStatus === 'Approved' ? '#10b981' :
            data.newStatus === 'Revision' ? '#ef4444' : '#f59e0b'
          )}
        </div>
        ${data.projectName ? `<p style="color:#606070;font-size:12px;margin:10px 0 0">Project: ${data.projectName}</p>` : ''}
      `)}
      ${button('View File →', data.viewUrl || APP_URL)}
    `))
  }),

  fileUploaded: (data) => ({
    subject: `New file uploaded to ${data.projectName}`,
    html: wrapper(card(`
      <div style="font-size:36px;margin-bottom:16px">📁</div>
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 12px">
        New File Uploaded
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px;line-height:1.5">
        <strong style="color:#a0a0b0">${data.uploaderName}</strong>
        uploaded a new file to
        <strong style="color:#a0a0b0">${data.projectName}</strong>
      </p>
      ${infoBox(`
        <p style="color:white;font-size:15px;font-weight:600;margin:0 0 4px">
          📄&nbsp;${data.fileName}
        </p>
        ${data.fileSize ? `<p style="color:#606070;font-size:13px;margin:0">${data.fileSize}</p>` : ''}
      `)}
      ${button('View Project →', data.projectUrl || APP_URL)}
    `))
  }),

  shotAssigned: (data) => ({
    subject: `You've been assigned: ${data.shotName}`,
    html: wrapper(card(`
      <div style="font-size:36px;margin-bottom:16px">🎯</div>
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 12px">
        Shot Assigned to You
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px;line-height:1.5">
        <strong style="color:#a0a0b0">${data.assignedBy}</strong>
        assigned you a shot in
        <strong style="color:#a0a0b0">${data.projectName}</strong>
      </p>
      ${infoBox(`
        <p style="color:white;font-size:16px;font-weight:700;margin:0 0 6px">
          ${data.shotNumber ? `<span style="color:#606070;font-size:13px;font-weight:400">${data.shotNumber}&nbsp;</span>` : ''}
          ${data.shotName}
        </p>
        ${data.dueDate ? `
          <p style="color:#f59e0b;font-size:13px;margin:4px 0">
            📅&nbsp;Due: ${data.dueDate}
          </p>
        ` : ''}
        ${data.priority && data.priority !== 'normal' ? `
          <p style="color:${data.priority === 'urgent' ? '#ef4444' : '#f59e0b'};
                    font-size:13px;margin:4px 0;font-weight:600">
            ⚡&nbsp;Priority: ${data.priority.toUpperCase()}
          </p>
        ` : ''}
      `)}
      ${button('View Shot →', data.projectUrl || APP_URL)}
    `))
  }),

  deadlineReminder: (data) => ({
    subject: `⚠️ ${data.projectName} deadline in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}`,
    html: wrapper(card(`
      <div style="font-size:36px;margin-bottom:16px">⚠️</div>
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 8px">
        Deadline Approaching
      </h2>
      <p style="color:#606070;font-size:15px;margin:0 0 16px;line-height:1.6">
        <strong style="color:#a0a0b0">${data.projectName}</strong>
        is due in
        <strong style="color:#f59e0b;font-size:17px">${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}</strong>
      </p>
      ${infoBox(`
        <p style="color:#606070;font-size:11px;margin:0 0 6px;text-transform:uppercase;
                  letter-spacing:1px;font-weight:600">Due Date</p>
        <p style="color:white;font-size:16px;font-weight:700;margin:0">${data.dueDate}</p>
        ${data.clientName ? `<p style="color:#606070;font-size:13px;margin:6px 0 0">Client: ${data.clientName}</p>` : ''}
      `)}
      ${button('Open Project →', data.projectUrl || APP_URL, '#f59e0b')}
    `, '#f59e0b44'))
  }),

  shareLink: (data) => ({
    subject: `${data.sharedBy} shared "${data.fileName}" with you`,
    html: wrapper(card(`
      <div style="font-size:36px;margin-bottom:16px">🔗</div>
      <h2 style="color:white;font-size:20px;font-weight:700;margin:0 0 12px">
        File Shared With You
      </h2>
      <p style="color:#606070;font-size:14px;margin:0 0 16px;line-height:1.5">
        <strong style="color:#a0a0b0">${data.sharedBy}</strong>
        shared a file with you:
      </p>
      ${infoBox(`
        <p style="color:white;font-size:16px;font-weight:600;margin:0 0 4px">
          📄&nbsp;${data.fileName}
        </p>
        ${data.message ? `
          <div style="border-top:1px solid #2a2a3a;margin-top:12px;padding-top:12px">
            <p style="color:#606070;font-size:12px;margin:0 0 4px">Message:</p>
            <p style="color:#a0a0b0;font-size:14px;margin:0;font-style:italic">
              "${data.message}"
            </p>
          </div>
        ` : ''}
      `)}
      ${button('View Shared File →', data.shareUrl)}
      ${data.expiresAt ? `
        <p style="color:#404050;font-size:12px;text-align:center;margin-top:12px">
          Link expires: ${data.expiresAt}
        </p>
      ` : ''}
    `))
  }),

}

// Helper to check user notification preferences
async function shouldSendEmail(
  userId: string,
  notificationType: string
): Promise<{ send: boolean; email: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
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
    const shouldSend = prefs[notificationType] !== false

    return { send: shouldSend, email: profile.email }
  } catch {
    return { send: false, email: '' }
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

    // Check notification preferences if userId provided
    if (userId && notificationType) {
      const { send, email } = await shouldSendEmail(userId, notificationType)
      if (!send) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'User preference disabled' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (!recipientEmail) recipientEmail = email
    }

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing recipient email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!template || !templates[template]) {
      return new Response(
        JSON.stringify({ error: `Invalid or missing template: ${template}` }),
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
      throw new Error(result.message || 'Resend API error')
    }

    console.log(`✅ Email sent: template=${template} to=${recipientEmail} id=${result.id}`)

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
