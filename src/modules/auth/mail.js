const nodemailer = require('nodemailer');
const { fail } = require('../../utils/validation');

async function send(email, subject, text) {
  try {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const port = Number(process.env.SMTP_PORT || 587);
      const smtp = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port, secure: port === 465 || process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 8000, socketTimeout: 12000,
      });
      await smtp.sendMail({ from: process.env.MAIL_FROM || { name: 'DigiPay', address: process.env.SMTP_USER }, to: email, subject, text });
      return;
    }
    if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) {
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(12000),
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [email], subject, text }),
      });
      if (response.ok) return;
    }
  } catch { /* Return only the user-facing error below. */ }
  fail(503, 'Email delivery is unavailable. Please try again later.');
}

exports.sendResetLink = (email, url) => send(email, 'Reset your DigiPay password',
  'Open this single-use link within 15 minutes to reset your DigiPay password:\n' + url + '\n\nIf you did not request this, you can ignore this email.');

exports.sendCode = (email, code) => send(email, 'Verify your DigiPay email',
  'Your DigiPay verification code is ' + code + '. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.');
