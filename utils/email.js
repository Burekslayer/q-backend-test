// backend/utils/email.js
const nodemailer = require('nodemailer');
const { etherealTestAccount } = require('./etherealAccount');

let transporter;

// (1) Re‐use your existing setupTransporter logic
async function setupTransporter() {
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST, // e.g. smtp.gmail.com
        port: process.env.EMAIL_PORT, // e.g. 465
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    } else {
      // In development, use Ethereal
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

// (2) Existing verification email function
async function sendVerificationEmail(to, token) {
  console.log('📤 Sending verification email to:', to);

  const transporter = await setupTransporter();
  const verificationLink = `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/users/verify?token=${token}`;
  
  const info = await transporter.sendMail({
    from: '"Kreativni Univerzum" <no-reply@kreativni.univerzum.com>',
    to,
    subject: 'Verify your account',
    html: `<p>Please verify your email by clicking the link below:</p>
           <a href="${verificationLink}">Verify Email</a>`
  });

  console.log('📬 Verification email sent:', info.messageId);
}

// ────────────────────────────────────────────────────────────────
// (3) Below: new order‐related email functions
// ────────────────────────────────────────────────────────────────

/**
 *  Sends a notification email to the company whenever a new order is placed.
 *  @param {Object} orderData
 *    - buyerEmail: string
 *    - shippingAddress: { firstName, lastName, street, city, postal, country }
 *    - items: Array<{ title, price, quantity }>
 *    - totalPrice: Number
 *    - date: Date (or epoch) – pass new Date() from the route
 */
async function sendOrderToCompany(orderData) {
  const transporter = await setupTransporter();

  const {
    buyerEmail,
    shippingAddress,
    items,
    totalPrice,
    date,
  } = orderData;

  // Hard-code your company’s “orders” address here:
  const companyEmail = process.env.COMPANY_EMAIL || 'orders@kreativni-univerzum.com';

  // Build the plaintext body
  let bodyLines = [];
  bodyLines.push(`A new order was placed on ${new Date(date).toLocaleString()}`)
  bodyLines.push('');
  bodyLines.push(`Buyer Email: ${buyerEmail}`);
  bodyLines.push(
    `Shipping Address: ${shippingAddress.firstName} ${shippingAddress.lastName}`
  );
  bodyLines.push(
    `  ${shippingAddress.street}, ${shippingAddress.city}, ${shippingAddress.postal}, ${shippingAddress.country}`
  );
  bodyLines.push('');
  bodyLines.push('Order Details:');
  items.forEach((line) => {
    bodyLines.push(
      `  • ${line.title}  × ${line.quantity}  → $${(line.price * line.quantity).toFixed(2)}`
    );
  });
  bodyLines.push('');
  bodyLines.push(`Order Total: $${totalPrice.toFixed(2)}`);

  const info = await transporter.sendMail({
    from: '"Kreativni Univerzum" <no-reply@kreativni.univerzum.com>',
    to: companyEmail,
    subject: '📩 New Order Received',
    text: bodyLines.join('\n'),
  });

  console.log(`📬 Company notification sent to ${companyEmail}:`, info.messageId);
}

/**
 *  Sends a notification email to a single artist, letting them know
 *  their artwork has been purchased. You should call this once for each
 *  distinct artist, passing in that artist’s email.
 *
 *  @param {Object} orderData
 *    - items: Array<{ title, price, quantity }>
 *      (only include the lines that belong to this artist)
 *    - date: Date (or ISO string)
 *  @param {String} artistEmail
 */
async function sendOrderToArtist(orderData, artistEmail) {
  const transporter = await setupTransporter();
  const { items, date } = orderData;

  // Build the plaintext body
  let bodyLines = [];
  bodyLines.push(`Hello Artist,`);
  bodyLines.push('');
  bodyLines.push(`Your artwork has been purchased on ${new Date(date).toLocaleString()}:`);
  bodyLines.push('');
  let subtotalForArtist = 0;
  items.forEach((line) => {
    const lineTotal = line.price * line.quantity;
    subtotalForArtist += lineTotal;
    bodyLines.push(
      `  • ${line.title}  × ${line.quantity}  → $${lineTotal.toFixed(2)}`
    );
  });
  bodyLines.push('');
  bodyLines.push(`Total for your items: $${subtotalForArtist.toFixed(2)}`);
  bodyLines.push('');
  bodyLines.push('Thank you for sharing your art!');
  bodyLines.push('');
  bodyLines.push('— Kreativni Univerzum Team');

  const info = await transporter.sendMail({
    from: '"Kreativni Univerzum" <no-reply@kreativni.univerzum.com>',
    to: artistEmail,
    subject: '🎨 Someone bought your artwork!',
    text: bodyLines.join('\n'),
  });

  console.log(`📬 Artist notification sent to ${artistEmail}:`, info.messageId);
}

/**
 *  Sends a confirmation email to the buyer, acknowledging that their
 *  order has been recorded.
 *
 *  @param {Object} orderData
 *    - shippingAddress: { firstName, lastName, street, city, postal, country }
 *    - totalPrice: Number
 *    - date: Date (or epoch)
 *  @param {String} buyerEmail
 */
async function sendOrderConfirmationToBuyer(orderData, buyerEmail) {
  const transporter = await setupTransporter();
  const { shippingAddress, totalPrice, date } = orderData;

  const body = `
Hello,

Thank you for your purchase! Your order has been received on ${new Date(date).toLocaleString()}.

Your order total is $${totalPrice.toFixed(2)}. We will ship to:

${shippingAddress.firstName} ${shippingAddress.lastName}
${shippingAddress.street}
${shippingAddress.city}, ${shippingAddress.postal}, ${shippingAddress.country}

If you have any questions, reply to this email.

Narudzbina je evidentirana.

Regards,
Kreativni Univerzum Team
`;

  const info = await transporter.sendMail({
    from: '"Kreativni Univerzum" <no-reply@kreativni.univerzum.com>',
    to: buyerEmail,
    subject: '✅ Your order is confirmed',
    text: body,
  });

  console.log(`📬 Buyer confirmation sent to ${buyerEmail}:`, info.messageId);
}

module.exports = {
  sendVerificationEmail,
  sendOrderToCompany,
  sendOrderToArtist,
  sendOrderConfirmationToBuyer,
};
