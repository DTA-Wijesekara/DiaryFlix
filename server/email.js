// DiaryFLIX — Email service (Nodemailer / SMTP)

const nodemailer = require('nodemailer');
const config = require('./config');

let transporter = null;

function getTransporter() {
  if (!config.smtp.user || !config.smtp.pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

async function send({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.warn(`[email] SMTP not configured. Would send to <${to}>:\n  Subject: ${subject}\n  ${text || ''}`);
    return { delivered: false };
  }
  const info = await t.sendMail({
    from: config.smtp.from || config.smtp.user,
    to, subject, text, html,
  });
  return { delivered: true, id: info.messageId };
}

// ── Password reset templates ─────────────────────────────────────────────────

function buildPasswordResetEmail({ displayName, resetUrl, ttlMinutes }) {
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const text = [
    `Hi ${name},`,
    '',
    `Someone (hopefully you) requested a password reset for your DiaryFLIX account.`,
    `Click the link below to choose a new password. The link expires in ${ttlMinutes} minutes.`,
    '',
    resetUrl,
    '',
    `If you didn't request this, you can safely ignore this email — your password will stay the same.`,
    '',
    '— DiaryFLIX',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#fbfcfe;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0b1220;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbfcfe;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;max-width:520px;width:100%;">
        <tr><td style="padding:32px 36px 8px 36px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:22px;letter-spacing:-0.01em;color:#0b1220;">DiaryFLIX</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin-top:4px;">A cinema diary</div>
        </td></tr>
        <tr><td style="padding:24px 36px 8px 36px;">
          <h1 style="font-family:Georgia,serif;font-weight:500;font-size:24px;letter-spacing:-0.02em;margin:0 0 16px;color:#0b1220;">Reset your password</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#0b1220;">Hi ${escapeHtml(name)},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#0b1220;">Someone (hopefully you) requested a password reset for your DiaryFLIX account. Click the button below to choose a new password.</p>
        </td></tr>
        <tr><td style="padding:8px 36px 24px 36px;">
          <a href="${resetUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">Choose a new password</a>
        </td></tr>
        <tr><td style="padding:0 36px 24px 36px;">
          <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#6b7280;">This link expires in ${ttlMinutes} minutes. If you didn't request this, you can safely ignore this email — your password will stay the same.</p>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:#9ca3af;font-family:'JetBrains Mono',monospace;word-break:break-all;">If the button doesn't work, paste this link into your browser:<br>${escapeHtml(resetUrl)}</p>
        </td></tr>
        <tr><td style="padding:18px 36px 28px 36px;border-top:1px solid #e5e7eb;">
          <div style="font-size:11px;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;font-family:'JetBrains Mono',monospace;">Sent by DiaryFLIX</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: 'Reset your DiaryFLIX password', text, html };
}

function buildOAuthOnlyEmail({ displayName }) {
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const loginUrl = `${config.appUrl.replace(/\/$/, '')}/login`;
  const text = [
    `Hi ${name},`,
    '',
    `You (or someone using your email) requested a password reset for DiaryFLIX.`,
    `Your account uses Sign in with Google — there's no password to reset.`,
    `Just sign in with Google again at:`,
    '',
    loginUrl,
    '',
    `If you didn't request this, you can ignore this email.`,
    '',
    '— DiaryFLIX',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#fbfcfe;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0b1220;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbfcfe;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;max-width:520px;width:100%;">
        <tr><td style="padding:32px 36px 8px 36px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:22px;letter-spacing:-0.01em;color:#0b1220;">DiaryFLIX</div>
        </td></tr>
        <tr><td style="padding:16px 36px 24px 36px;">
          <h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;letter-spacing:-0.02em;margin:0 0 16px;color:#0b1220;">Your account uses Google sign-in</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#0b1220;">Hi ${escapeHtml(name)},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#0b1220;">You requested a password reset, but your DiaryFLIX account uses <strong>Sign in with Google</strong> — there's no password to reset. Just sign in with Google again.</p>
          <a href="${loginUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">Open DiaryFLIX</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: 'About your DiaryFLIX password reset', text, html };
}

module.exports = { send, buildPasswordResetEmail, buildOAuthOnlyEmail };
