import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL    = Deno.env.get('RESEND_FROM_EMAIL') || 'notifications@eastape.com'
const FROM_NAME     = 'Eastape Studio'
const APP_URL       = 'https://studio.eastape.com'
const LOGO_URL      = 'https://zzevqgnhbintrpohunjr.supabase.co/storage/v1/object/public/Site%20Assets/Eastape%20Studio%20Orange.png'

// ── Design tokens ─────────────────────────────────────────────────
const BG      = '#08080a'
const CARD    = '#111114'
const SURFACE = '#0e0e10'
const ACCENT  = '#E8943A'
const T1      = '#ececee'
const T2      = '#a4a4ac'
const T3      = '#6f6f78'
const T4      = '#4a4a52'
const LINE    = 'rgba(255,255,255,0.07)'
const LINE2   = 'rgba(255,255,255,0.11)'
const FONT    = `"Inter", system-ui, -apple-system, sans-serif`
const MONO    = `"JetBrains Mono", ui-monospace, "Courier New", monospace`

// ── Shared components ─────────────────────────────────────────────
function eLogo() {
  return `<div style="padding:36px 40px 0;background-color:${CARD}"><img src="${LOGO_URL}" alt="Eastape Studio" height="26" style="height:26px;width:auto;display:block;border:0;outline:0"></div>`
}
function eH(text: string) {
  return `<h1 class="eh" style="font-size:24px;font-weight:600;letter-spacing:-0.025em;color:${T1};-webkit-text-fill-color:${T1};background-color:${CARD};margin:0 0 12px;line-height:1.3;font-family:${FONT}">${text}</h1>`
}
function eP(text: string, muted = false) {
  const c = muted ? T3 : T2
  return `<p class="${muted ? 'epm' : 'ep'}" style="font-size:${muted ? 13 : 15}px;line-height:1.65;color:${c};-webkit-text-fill-color:${c};background-color:${CARD};margin:0 0 20px;font-family:${FONT}">${text}</p>`
}
function eBtn(text: string, href: string) {
  return `<a href="${href}" target="_blank" style="display:inline-block;padding:14px 36px;background:${ACCENT};color:#1a1408;font-weight:600;font-size:14px;font-family:${FONT};border-radius:8px;text-decoration:none;letter-spacing:-0.01em">${text}</a>`
}
function eDivider() {
  return `<div style="height:1px;background:${LINE};margin:0 40px"></div>`
}
function eBox(content: string) {
  return `<div style="background-color:${SURFACE};background:${SURFACE};border:1px solid ${LINE};border-radius:8px;padding:16px 20px">${content}</div>`
}
function eBoxRows(rows: [string, string][]) {
  return eBox(rows.map(([label, val], i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;background-color:${SURFACE};${i < rows.length - 1 ? `border-bottom:1px solid ${LINE}` : ''}">
      <span style="font-size:13px;color:${T3};-webkit-text-fill-color:${T3};font-family:${FONT}">${label}</span>
      <span style="font-size:13px;color:${T1};-webkit-text-fill-color:${T1};font-family:${MONO};font-weight:500">${val}</span>
    </div>`).join(''))
}
function eFooter() {
  const lnk = `color:${T3};text-decoration:underline;text-underline-offset:2px;font-family:${FONT}`
  return `<div style="padding:28px 20px 12px;text-align:center;font-size:12px;color:${T4};-webkit-text-fill-color:${T4};line-height:1.8;font-family:${FONT};background-color:${BG}">
    <div style="margin-bottom:6px;color:${T3};-webkit-text-fill-color:${T3};font-weight:500;font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase">Eastape Studio</div>
    <div style="-webkit-text-fill-color:${T4}">You're receiving this because you have an Eastape Studio account.</div>
    <div style="margin-top:10px">
      <a href="${APP_URL}" style="${lnk}">Unsubscribe</a>&nbsp;·&nbsp;
      <a href="${APP_URL}/privacy" style="${lnk}">Privacy</a>&nbsp;·&nbsp;
      <a href="${APP_URL}/help" style="${lnk}">Help</a>
    </div>
  </div>`
}
function eWrap(inner: string) {
  // bgcolor attributes on <table>/<td> are respected by Gmail/iOS in light mode
  // even when the client strips or overrides CSS background-color.
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark only">
<meta name="supported-color-schemes" content="dark">
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:0; background-color:${BG}!important; }
  .edark { background-color:${BG}!important; }
  u + .body .edark { background-color:${BG}!important; }
  [data-ogsc] .edark { background-color:${BG}!important; }
  @media (prefers-color-scheme:light) { .edark { background-color:${BG}!important; } }

  /* ── Preserve text colors in ALL Gmail modes (light + dark) ──
     Gmail overrides color but does NOT override -webkit-text-fill-color */
  .eh  { color:${T1}!important; -webkit-text-fill-color:${T1}!important; background-color:${CARD}!important; }
  .ep  { color:${T2}!important; -webkit-text-fill-color:${T2}!important; background-color:${CARD}!important; }
  .epm { color:${T3}!important; -webkit-text-fill-color:${T3}!important; background-color:${CARD}!important; }
  .etxt { color:${T2}!important; -webkit-text-fill-color:${T2}!important; }
  .ecard { background-color:${CARD}!important; color:${T2}!important; -webkit-text-fill-color:${T2}!important; }

  /* Fallback: target element types directly */
  h1 { color:${T1}!important; -webkit-text-fill-color:${T1}!important; }
  p  { color:${T2}!important; -webkit-text-fill-color:${T2}!important; }

  /* [data-ogsc] = Gmail dark mode */
  [data-ogsc] .eh   { color:${T1}!important; -webkit-text-fill-color:${T1}!important; }
  [data-ogsc] .ep   { color:${T2}!important; -webkit-text-fill-color:${T2}!important; }
  [data-ogsc] .epm  { color:${T3}!important; -webkit-text-fill-color:${T3}!important; }
  [data-ogsc] .etxt { color:${T2}!important; -webkit-text-fill-color:${T2}!important; }
  [data-ogsc] .ecard { background-color:${CARD}!important; }
  [data-ogsc] h1 { color:${T1}!important; -webkit-text-fill-color:${T1}!important; }
  [data-ogsc] p  { color:${T2}!important; -webkit-text-fill-color:${T2}!important; }

  /* Block CSS filter inversions */
  [data-ogsc] table, [data-ogsc] td, [data-ogsc] div, [data-ogsc] span, [data-ogsc] p, [data-ogsc] h1 {
    -webkit-filter:none!important; filter:none!important;
  }
</style>
</head>
<body class="body" bgcolor="${BG}" style="margin:0;padding:0;background-color:${BG}">
<!--[if mso]><table width="100%" bgcolor="${BG}"><tr><td><![endif]-->
<table class="edark" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${BG}" style="background-color:${BG};width:100%">
<tr>
<td class="edark" bgcolor="${BG}" style="background-color:${BG};padding:40px 20px;font-family:${FONT};-webkit-font-smoothing:antialiased">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="600" style="max-width:600px;width:100%;margin:0 auto">
  <tr>
  <td bgcolor="${CARD}" style="background-color:${CARD};border-radius:12px;border:1px solid ${LINE2};overflow:hidden">
    <div style="height:3px;line-height:3px;font-size:0;background:linear-gradient(90deg,${ACCENT} 0%,${ACCENT} 35%,transparent 100%)">&nbsp;</div>
    <div style="background-color:${CARD};color:${T2};font-family:${FONT}">
      ${inner}
    </div>
  </td>
  </tr>
  </table>
  ${eFooter()}
</td>
</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`
}

// ── Templates ─────────────────────────────────────────────────────
const templates: Record<string, (data: any) => { subject: string; html: string }> = {

  // ─── Welcome ──────────────────────────────────────────────────────
  welcome: (data) => ({
    subject: `Welcome to Eastape Studio${data.name ? `, ${data.name}` : ''}`,
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('Welcome to Eastape Studio')}
        ${eP('Your creative workspace is ready. Everything you need to manage, organize, and collaborate on your projects — all in one place.')}
        <div class="ecard" style="margin-bottom:28px;background-color:${CARD}">${eBtn('Get Started', APP_URL + '/dashboard')}</div>
      </div>
      ${eDivider()}
      <div class="ecard" style="padding:24px 40px 36px;background-color:${CARD}">
        <div style="font-size:10.5px;color:${T4};-webkit-text-fill-color:${T4};text-transform:uppercase;letter-spacing:0.07em;margin-bottom:18px;font-weight:500;font-family:${FONT};background-color:${CARD}">Quick start</div>
        ${[
          { n: 1, title: 'Upload',      desc: 'Drag and drop your files to get started' },
          { n: 2, title: 'Organize',    desc: 'Create projects and keep everything structured' },
          { n: 3, title: 'Collaborate', desc: 'Share with your team and gather feedback' },
        ].map((s, i, arr) => `
          <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:${i < arr.length - 1 ? '18px' : '0'};background-color:${CARD}">
            <div style="width:32px;height:32px;min-width:32px;border-radius:8px;background:${ACCENT}18;text-align:center;line-height:32px;color:${ACCENT};-webkit-text-fill-color:${ACCENT};font-size:13px;font-weight:700;font-family:${MONO}">${s.n}</div>
            <div style="background-color:${CARD}">
              <div style="font-size:14px;font-weight:600;color:${T1};-webkit-text-fill-color:${T1};margin-bottom:2px;font-family:${FONT};background-color:${CARD}">${s.title}</div>
              <div style="font-size:13px;color:${T3};-webkit-text-fill-color:${T3};line-height:1.5;font-family:${FONT};background-color:${CARD}">${s.desc}</div>
            </div>
          </div>`).join('')}
      </div>`)
  }),

  // ─── OTP Verification ─────────────────────────────────────────────
  otp: (data) => {
    const code  = String(data.code || '------').slice(0, 6)
    const boxes = code.split('').map(d =>
      `<td style="padding:0 4px"><div style="width:46px;height:54px;border-radius:8px;background-color:${SURFACE};background:${SURFACE};border:1px solid ${LINE2};text-align:center;line-height:54px;font-size:22px;font-weight:600;font-family:${MONO};color:${T1};-webkit-text-fill-color:${T1}">${d}</div></td>`
    ).join('')
    return {
      subject: 'Your Eastape Studio verification code',
      html: eWrap(`
        ${eLogo()}
        <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
          ${eH('Verification code')}
          ${eP('Use the code below to verify your identity. This code is valid for 10 minutes.')}
          <table cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px"><tr>${boxes}</tr></table>
          ${eP("If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.", true)}
        </div>`)
    }
  },

  // ─── Password Reset ────────────────────────────────────────────────
  passwordReset: (data) => ({
    subject: 'Reset your Eastape Studio password',
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('Reset your password')}
        ${eP('We received a request to reset the password for your account. Click the button below to choose a new password.')}
        <div class="ecard" style="margin-bottom:24px;background-color:${CARD}">${eBtn('Reset Password', data.resetUrl || data.reset_url || APP_URL + '/auth/reset')}</div>
        ${eBox(`<div style="font-size:13px;color:${T3};-webkit-text-fill-color:${T3};line-height:1.65;font-family:${FONT};background-color:${SURFACE}">This link expires in <span style="color:${T2};-webkit-text-fill-color:${T2};font-weight:500">30 minutes</span>. If you didn't request this, no action is needed — your password will remain unchanged.</div>`)}
      </div>`)
  }),

  // ─── Security Alert / New Sign-in ─────────────────────────────────
  securityAlert: (data) => ({
    subject: 'New sign-in detected on your Eastape Studio account',
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('New sign-in detected')}
        ${eP('We noticed a sign-in to your account from a new device or location.')}
        <div style="margin-bottom:24px;background-color:${CARD}">${eBoxRows([
          ['Device',     data.device   || 'Unknown device'],
          ['Location',   data.location || 'Unknown location'],
          ['Time',       data.time     || new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })],
          ['IP address', data.ip       || '—'],
        ])}</div>
        <div class="ecard" style="margin-bottom:24px;background-color:${CARD}">${eBtn('Secure Account', APP_URL + '/settings/security')}</div>
        ${eP("If this was you, no action is needed. If you don't recognize this activity, reset your password immediately.", true)}
      </div>`)
  }),

  // ─── Account Deactivation ─────────────────────────────────────────
  accountDeactivation: (data) => ({
    subject: 'Your Eastape Studio account has been deactivated',
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('Account deactivated')}
        ${eP('Your Eastape Studio account has been deactivated as requested. Your data will be retained for 30 days before permanent deletion.')}
        <div style="margin-bottom:24px">${eBox(`<div style="font-size:13px;color:${T3};-webkit-text-fill-color:${T3};line-height:1.65;font-family:${FONT};background-color:${SURFACE}">During this period, you can reactivate your account and restore all your data by clicking the button below.</div>`)}</div>
        <div class="ecard" style="margin-bottom:24px;background-color:${CARD}">${eBtn('Reactivate Account', data.reactivateUrl || data.reactivate_url || APP_URL + '/reactivate')}</div>
        ${eP(`Need help? Contact us at <a href="mailto:support@eastape.com" style="color:${ACCENT};text-decoration:none">support@eastape.com</a>`, true)}
      </div>`)
  }),

  // ─── Payment Receipt ──────────────────────────────────────────────
  paymentReceipt: (data) => ({
    subject: `Payment confirmed — ${data.amount || '$0.00'}`,
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('Payment confirmed')}
        ${eP("Your payment has been processed successfully. Here's a summary of your transaction.")}
        <div class="ecard" style="text-align:center;padding:20px 0 24px;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};margin-bottom:20px;background-color:${CARD}">
          <div style="font-size:10.5px;color:${T4};-webkit-text-fill-color:${T4};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;font-family:${FONT};background-color:${CARD}">Amount paid</div>
          <div style="font-size:36px;font-weight:700;color:${T1};-webkit-text-fill-color:${T1};font-family:${MONO};letter-spacing:-0.03em;background-color:${CARD}">${data.amount || '$0.00'}</div>
        </div>
        ${eBoxRows([
          ['Plan',           data.plan          || 'Pro Monthly'],
          ['Billing date',   data.billingDate   || data.billing_date   || new Date().toLocaleDateString('en-US', { dateStyle: 'long' })],
          ['Invoice',        data.invoiceId     || data.invoice_id     || '—'],
          ['Payment method', data.paymentMethod || data.payment_method || '—'],
        ])}
        <div style="margin-top:24px;text-align:center;background-color:${CARD}">${eBtn('View Full Invoice', data.invoiceUrl || data.invoice_url || APP_URL + '/billing')}</div>
      </div>`)
  }),

  // ─── Base / Admin custom email ────────────────────────────────────
  custom: (data) => ({
    subject: data.subject || 'Message from Eastape Studio',
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH((data.subject || 'Message from Eastape Studio').replace(/</g, '&lt;').replace(/>/g, '&gt;'))}
        <div class="etxt" style="font-size:15px;line-height:1.65;color:${T2};-webkit-text-fill-color:${T2};background-color:${CARD};font-family:${FONT};margin-bottom:${data.ctaText && data.ctaUrl ? '24px' : '0'}">
          ${(data.body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
        </div>
        ${data.ctaText && data.ctaUrl ? eBtn(data.ctaText, data.ctaUrl) : ''}
      </div>`)
  }),

  // ─── Notification templates (updated to new design) ───────────────
  teamInvite: (data) => ({
    subject: `${data.inviterName} invited you to ${data.projectName}`,
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH("You've been invited!")}
        ${eP(`<strong style="color:${T1}">${data.inviterName}</strong> invited you to collaborate on a project:`)}
        <div style="margin-bottom:24px">${eBox(`
          <div style="font-size:18px;font-weight:700;color:${T1};-webkit-text-fill-color:${T1};margin-bottom:4px;font-family:${FONT};background-color:${SURFACE}">${data.projectIcon || '🎬'}&nbsp;${data.projectName}</div>
          <div style="font-size:13px;color:${ACCENT};-webkit-text-fill-color:${ACCENT};margin-bottom:4px;font-family:${FONT};background-color:${SURFACE}">Your role: <strong>${data.role}</strong></div>
          ${data.clientName ? `<div style="font-size:12px;color:${T3};-webkit-text-fill-color:${T3};font-family:${FONT};background-color:${SURFACE}">Client: ${data.clientName}</div>` : ''}
        `)}</div>
        ${eBtn('Accept Invitation', data.acceptUrl || APP_URL + '/projects')}
        <p style="font-size:12px;color:${T4};-webkit-text-fill-color:${T4};margin-top:12px;font-family:${FONT};background-color:${CARD}">This invitation expires in 7 days</p>
      </div>`)
  }),

  commentAdded: (data) => ({
    subject: `${data.commenterName} commented on ${data.fileName}`,
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('New comment')}
        ${eP(`<strong style="color:${T1}">${data.commenterName}</strong> commented on <strong style="color:${T1}">${data.fileName}</strong>${data.timestamp ? ` at <span style="color:${ACCENT};font-weight:600;font-family:${MONO}">${data.timestamp}</span>` : ''}`)}
        <div style="background-color:${SURFACE};background:${SURFACE};border-left:3px solid ${ACCENT};padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px">
          <div style="font-size:15px;line-height:1.6;color:${T1};-webkit-text-fill-color:${T1};font-style:italic;font-family:${FONT};background-color:${SURFACE}">"${data.commentBody}"</div>
        </div>
        ${eBtn('View & Reply', data.viewUrl || APP_URL)}
      </div>`)
  }),

  mentionedInComment: (data) => ({
    subject: `${data.mentionerName} mentioned you in a comment`,
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('You were mentioned')}
        ${eP(`<strong style="color:${T1}">${data.mentionerName}</strong> mentioned you in a comment on <strong style="color:${T1}">${data.fileName}</strong>`)}
        <div style="background-color:${SURFACE};background:${SURFACE};border-left:3px solid ${ACCENT};padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px">
          <div style="font-size:15px;line-height:1.6;color:${T1};-webkit-text-fill-color:${T1};font-style:italic;font-family:${FONT};background-color:${SURFACE}">"${data.commentBody}"</div>
        </div>
        ${eBtn('View Comment', data.viewUrl || APP_URL)}
      </div>`)
  }),

  statusChanged: (data) => {
    const statusColor = (s: string) =>
      s === 'Approved' ? '#4ade80' : s === 'Revision' ? '#f87171' : '#fbbf24'
    return {
      subject: `${data.fileName} marked as ${data.newStatus}`,
      html: eWrap(`
        ${eLogo()}
        <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
          ${eH('Status updated')}
          ${eP(`<strong style="color:${T1}">${data.changedBy}</strong> updated the status of <strong style="color:${T1}">${data.fileName}</strong>`)}
          <div style="margin-bottom:24px">${eBox(`
            <div style="font-size:11px;color:${T4};-webkit-text-fill-color:${T4};text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:10px;font-family:${FONT};background-color:${SURFACE}">Status change</div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;background-color:${SURFACE}">
              <span style="background:${T4}22;color:${T3};-webkit-text-fill-color:${T3};padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600;font-family:${FONT}">${data.oldStatus}</span>
              <span style="color:${T4};-webkit-text-fill-color:${T4};font-size:14px">→</span>
              <span style="background:${statusColor(data.newStatus)}22;color:${statusColor(data.newStatus)};-webkit-text-fill-color:${statusColor(data.newStatus)};padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600;font-family:${FONT}">${data.newStatus}</span>
            </div>
            ${data.projectName ? `<div style="font-size:12px;color:${T3};-webkit-text-fill-color:${T3};margin-top:10px;font-family:${FONT};background-color:${SURFACE}">Project: ${data.projectName}</div>` : ''}
          `)}</div>
          ${eBtn('View File', data.viewUrl || APP_URL)}
        </div>`)
    }
  },

  fileUploaded: (data) => ({
    subject: `New file uploaded to ${data.projectName}`,
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('New file uploaded')}
        ${eP(`<strong style="color:${T1}">${data.uploaderName}</strong> uploaded a new file to <strong style="color:${T1}">${data.projectName}</strong>`)}
        <div style="margin-bottom:24px">${eBox(`
          <div style="font-size:15px;font-weight:600;color:${T1};-webkit-text-fill-color:${T1};margin-bottom:4px;font-family:${FONT};background-color:${SURFACE}">📄&nbsp;${data.fileName}</div>
          ${data.fileSize ? `<div style="font-size:13px;color:${T3};-webkit-text-fill-color:${T3};font-family:${MONO};background-color:${SURFACE}">${data.fileSize}</div>` : ''}
        `)}</div>
        ${eBtn('View Project', data.projectUrl || APP_URL)}
      </div>`)
  }),

  shotAssigned: (data) => ({
    subject: `You've been assigned: ${data.shotName}`,
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('Shot assigned to you')}
        ${eP(`<strong style="color:${T1}">${data.assignedBy}</strong> assigned you a shot in <strong style="color:${T1}">${data.projectName}</strong>`)}
        <div style="margin-bottom:24px">${eBox(`
          <div style="font-size:16px;font-weight:700;color:${T1};-webkit-text-fill-color:${T1};margin-bottom:6px;font-family:${FONT};background-color:${SURFACE}">${data.shotNumber ? `<span style="color:${T3};-webkit-text-fill-color:${T3};font-size:13px;font-weight:400">${data.shotNumber}&nbsp;</span>` : ''}${data.shotName}</div>
          ${data.dueDate ? `<div style="color:#fbbf24;-webkit-text-fill-color:#fbbf24;font-size:13px;margin:4px 0;font-family:${FONT};background-color:${SURFACE}">📅&nbsp;Due: ${data.dueDate}</div>` : ''}
          ${data.priority && data.priority !== 'normal' ? `<div style="color:${data.priority === 'urgent' ? '#f87171' : '#fbbf24'};-webkit-text-fill-color:${data.priority === 'urgent' ? '#f87171' : '#fbbf24'};font-size:13px;font-weight:600;margin:4px 0;font-family:${FONT};background-color:${SURFACE}">⚡&nbsp;Priority: ${data.priority.toUpperCase()}</div>` : ''}
        `)}</div>
        ${eBtn('View Shot', data.projectUrl || APP_URL)}
      </div>`)
  }),

  deadlineReminder: (data) => ({
    subject: `${data.projectName} deadline in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}`,
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('Deadline approaching')}
        ${eP(`<strong style="color:${T1}">${data.projectName}</strong> is due in <strong style="color:#fbbf24;font-size:17px">${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}</strong>`)}
        <div style="margin-bottom:24px">${eBox(`
          <div style="font-size:11px;color:${T4};-webkit-text-fill-color:${T4};text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;font-family:${FONT};background-color:${SURFACE}">Due date</div>
          <div style="font-size:16px;font-weight:700;color:${T1};-webkit-text-fill-color:${T1};font-family:${FONT};background-color:${SURFACE}">${data.dueDate}</div>
          ${data.clientName ? `<div style="font-size:13px;color:${T3};-webkit-text-fill-color:${T3};margin-top:6px;font-family:${FONT};background-color:${SURFACE}">Client: ${data.clientName}</div>` : ''}
        `)}</div>
        ${eBtn('Open Project', data.projectUrl || APP_URL)}
      </div>`)
  }),

  shareLink: (data) => ({
    subject: `${data.sharedBy} shared "${data.fileName}" with you`,
    html: eWrap(`
      ${eLogo()}
      <div class="ecard" style="padding:28px 40px 36px;background-color:${CARD}">
        ${eH('File shared with you')}
        ${eP(`<strong style="color:${T1}">${data.sharedBy}</strong> shared a file with you:`)}
        <div style="margin-bottom:24px">${eBox(`
          <div style="font-size:16px;font-weight:600;color:${T1};-webkit-text-fill-color:${T1};margin-bottom:4px;font-family:${FONT};background-color:${SURFACE}">📄&nbsp;${data.fileName}</div>
          ${data.message ? `<div style="border-top:1px solid ${LINE};margin-top:12px;padding-top:12px;background-color:${SURFACE}"><div style="font-size:12px;color:${T3};-webkit-text-fill-color:${T3};margin-bottom:4px;font-family:${FONT};background-color:${SURFACE}">Message:</div><div style="font-size:14px;color:${T2};-webkit-text-fill-color:${T2};font-style:italic;font-family:${FONT};background-color:${SURFACE}">"${data.message}"</div></div>` : ''}
        `)}</div>
        ${eBtn('View Shared File', data.shareUrl || APP_URL)}
        ${data.expiresAt ? `<p style="font-size:12px;color:${T4};-webkit-text-fill-color:${T4};text-align:center;margin-top:12px;font-family:${FONT};background-color:${CARD}">Link expires: ${data.expiresAt}</p>` : ''}
      </div>`)
  }),
}

// ── Aliases ───────────────────────────────────────────────────────
templates.password_reset      = templates.passwordReset
templates.security_alert      = templates.securityAlert
templates.new_signin          = templates.securityAlert
templates.newSignin           = templates.securityAlert
templates.account_deactivation = templates.accountDeactivation
templates.payment_receipt     = templates.paymentReceipt
templates.invoice             = templates.paymentReceipt

// ── Notification preference check ─────────────────────────────────
async function shouldSendEmail(
  userId: string,
  notificationType: string,
): Promise<{ send: boolean; email: string }> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    if (!user?.email) return { send: false, email: '' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email_notifications')
      .eq('id', userId)
      .single()

    const prefs = profile?.email_notifications || {}
    return { send: prefs[notificationType] !== false, email: user.email }
  } catch {
    return { send: false, email: '' }
  }
}

// ── Handler ───────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json()
    const { to, template, data, userId, notificationType, preview } = body

    // Preview mode: render HTML without sending (admin-only)
    if (preview === true) {
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: { user }, error: authErr } = await authClient.auth.getUser()
      if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
      const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data: prof } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!prof?.is_admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
      if (!template || !templates[template]) return new Response(JSON.stringify({ error: `Invalid template: ${template}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
      const { subject, html } = templates[template](data || {})
      return new Response(JSON.stringify({ subject, html }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    let recipientEmail = to

    if (userId && notificationType) {
      const { send, email } = await shouldSendEmail(userId, notificationType)
      if (!send) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'User preference disabled' }),
          { headers: { ...cors, 'Content-Type': 'application/json' } },
        )
      }
      if (!recipientEmail) recipientEmail = email
    }

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing recipient email' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    if (!template || !templates[template]) {
      return new Response(
        JSON.stringify({ error: `Invalid or missing template: ${template}` }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const { subject, html } = templates[template](data || {})

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: Array.isArray(recipientEmail) ? recipientEmail : [recipientEmail],
        subject,
        html,
      }),
    })

    const result = await resendRes.json()

    if (!resendRes.ok) {
      const msg = result.message || result.error || result.name || JSON.stringify(result)
      console.error(`Resend ${resendRes.status}:`, msg)
      return new Response(
        JSON.stringify({ error: `Resend: ${msg}` }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`✅ Email sent: template=${template} to=${recipientEmail} id=${result.id}`)
    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('send-email error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
})
