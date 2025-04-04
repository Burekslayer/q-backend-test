const nodemailer = require('nodemailer');
const { etherealTestAccount } = require('./etherealAccount');

let transporter;

async function setupTransporter() {
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST, // smtp.gmail.com
        port: process.env.EMAIL_PORT, // 465
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    } else {
      const account = await etherealTestAccount();
      transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
          user: account.user,
          pass: account.pass,
        },
      });
    }
  }
  return transporter;
}

async function sendVerificationEmail(to, token) {
  console.log('📤 Sending email to:', to);

  const transporter = await setupTransporter();
  const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify?token=${token}`;

  const info = await transporter.sendMail({
    from: '"Kreativni Univerzum" <no-reply@kreativni.univerzum.com>',
    to,
    subject: 'Verify your account',
    html: `<p>Please verify your email by clicking the link below:</p>
           <a href="${verificationLink}">Verify Email</a>`
  });

  console.log('📬 Email sent:', info.messageId);
}

module.exports = { sendVerificationEmail };
