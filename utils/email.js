const nodemailer = require('nodemailer');
const { etherealTestAccount } = require('./etherealAccount');

let transporter;

async function setupTransporter() {
  if (!transporter) {
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
  return transporter;
}


async function sendVerificationEmail(to, token) {
  console.log('📤 Sending email to:', to); // <--- ADD THIS LINE

  const transporter = await setupTransporter();
  const info = await transporter.sendMail({
    from: '"Kreativni Univerzum" <no-reply@kreativni.univerzum.com>',
    to,
    subject: 'Verify your account',
    html: `<p>Please verify your email by clicking the link below:</p>
           <a href="http://localhost:5000/api/users/verify?token=${token}">Verify Email</a>`
  });

}


module.exports = { sendVerificationEmail };
