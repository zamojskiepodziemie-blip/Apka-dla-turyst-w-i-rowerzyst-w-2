const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html }) {
  // Jeśli brak konfiguracji SMTP — loguj do konsoli (tryb dev)
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log('=== EMAIL (tryb dev — brak SMTP) ===');
    console.log(`Do: ${to}`);
    console.log(`Temat: ${subject}`);
    console.log('Treść HTML pominięta w konsoli.');
    console.log('===================================');
    return;
  }

  await getTransporter().sendMail({
    from: `"Szlaki Lubelszczyzny" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html
  });
}

module.exports = { sendEmail };
