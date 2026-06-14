import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../config/env";
import { SMTP, ETHEREAL } from "../config/constants";

let transporter: Transporter | null = null;

/**
 * Get or create the nodemailer transporter.
 * Uses Ethereal (fake SMTP) if no SMTP_HOST is configured — great for dev.
 */
async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (env.SMTP_HOST) {
    // Production / real SMTP
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === SMTP.SECURE_PORT,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    console.log(`📧 Email configured: ${env.SMTP_HOST}:${env.SMTP_PORT}`);
  } else {
    // Dev — use Ethereal fake SMTP
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: ETHEREAL.HOST,
      port: ETHEREAL.PORT,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`📧 Email configured: Ethereal (dev mode)`);
    console.log(`   Preview emails at: https://ethereal.email/login`);
    console.log(`   User: ${testAccount.user} / Pass: ${testAccount.pass}`);
  }

  return transporter;
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

  const transport = await getTransporter();

  const info = await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "🎯 Verify your Tambola account",
    html,
  });

  // In dev mode, log preview URL
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`📧 Preview email: ${previewUrl}`);
  }
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

  const transport = await getTransporter();

  const info = await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "🔑 Reset your Tambola password",
    html,
  });

  // In dev mode, log preview URL
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`📧 Preview reset email: ${previewUrl}`);
  }
}
