import { env } from "../config/env";

/**
 * Send an email via Resend's HTTP API.
 * https://resend.com/docs/api-reference/emails/send-email
 */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // Dev fallback — just log the email
    console.log(`📧 [DEV] Would send email to: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   (Set RESEND_API_KEY to send real emails)`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Resend API error (${res.status}): ${JSON.stringify(error)}`);
  }

  const data = await res.json();
  console.log(`📧 Email sent to ${to} (id: ${data.id})`);
}

/**
 * Send a verification email with a styled HTML template.
 */
export async function sendVerificationEmail(
  to: string,
  token: string,
  displayName: string
): Promise<void> {
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1d27;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 0;text-align:center;">
              <div style="font-size:48px;margin-bottom:8px;">🎯</div>
              <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">Tambola</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px;">
                Hey <strong style="color:#f5c842;">${displayName}</strong>,
              </p>
              <p style="color:#b0b0b0;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Welcome to Tambola! Please verify your email address to start playing.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${verifyUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#f5c842,#e6a817);color:#0f1117;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;font-size:16px;">
                      Verify My Email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#777;font-size:13px;line-height:1.5;margin:0 0 16px;">
                Or copy this link into your browser:<br>
                <a href="${verifyUrl}" style="color:#36d6b5;word-break:break-all;">${verifyUrl}</a>
              </p>
              <p style="color:#555;font-size:12px;margin:0;">
                This link expires in 24 hours. If you didn't create an account, you can ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="color:#555;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} Tambola — Play Online
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendEmail(to, "🎯 Verify your Tambola account", html);
}

/**
 * Send a password reset email with a styled HTML template.
 */
export async function sendPasswordResetEmail(
  to: string,
  token: string,
  displayName: string
): Promise<void> {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1d27;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 0;text-align:center;">
              <div style="font-size:48px;margin-bottom:8px;">🔑</div>
              <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">Password Reset</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px;">
                Hey <strong style="color:#f5c842;">${displayName}</strong>,
              </p>
              <p style="color:#b0b0b0;font-size:15px;line-height:1.6;margin:0 0 24px;">
                We received a request to reset your password. Click the button below to choose a new one.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${resetUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#f5c842,#e6a817);color:#0f1117;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;font-size:16px;">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#777;font-size:13px;line-height:1.5;margin:0 0 16px;">
                Or copy this link into your browser:<br>
                <a href="${resetUrl}" style="color:#36d6b5;word-break:break-all;">${resetUrl}</a>
              </p>
              <p style="color:#555;font-size:12px;margin:0;">
                This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="color:#555;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} Tambola — Play Online
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendEmail(to, "🔑 Reset your Tambola password", html);
}
