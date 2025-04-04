const nodemailer = require('nodemailer');

async function etherealTestAccount() {
  return {
    smtp: {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10),
      secure: true,
    },
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  };
}

module.exports = { etherealTestAccount };