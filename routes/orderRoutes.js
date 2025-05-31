// backend/routes/orderRoutes.js

const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');

const User  = require('../models/User');
const Order = require('../models/Order'); // ← Import the Order model
const {
  sendOrderToCompany,
  sendOrderToArtist,
  sendOrderConfirmationToBuyer,
} = require('../utils/email');

router.post('/', async (req, res) => {
  try {
    const { buyerEmail, shippingAddress, paymentInfo, items, totalPrice } = req.body;

    // Basic validation
    if (!buyerEmail || !items || !items.length) {
      return res.status(400).json({ error: 'Missing buyerEmail or items.' });
    }

    // ─────────────────────────────────────────────────────────────
    // Step A: Create & save the Order document in MongoDB
    // ─────────────────────────────────────────────────────────────

    // 1) Map the payload items to match our Order schema
    const orderItems = items.map((i) => {
      // Ensure i.id is a valid ObjectId string; if not, set paintingId = null
      const paintingId = mongoose.Types.ObjectId.isValid(i.id)
        ? new mongoose.Types.ObjectId(i.id)
        : null;

      return {
        paintingId,
        price:    i.price,
        quantity: i.quantity,
      };
    });

    // 2) If any paintingId was invalid (null), reject immediately
    const invalidLine = orderItems.find((ln) => !ln.paintingId);
    if (invalidLine) {
      return res.status(400).json({ error: 'One or more painting IDs are invalid.' });
    }

    // 3) Instantiate and save the Order
    const newOrder = new Order({
      buyerEmail,
      shippingAddress,
      paymentInfo,
      items: orderItems,
      totalPrice,
      createdAt: new Date(),
    });

    const savedOrder = await newOrder.save();
    // ─────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────
    // Step B: Now run your existing email logic using savedOrder
    // ─────────────────────────────────────────────────────────────

    // Build a map: artistEmail → [ subarray of this artist’s lines ]
    const artistItemMap = {}; 

    for (let line of savedOrder.items) {
      const paintingId = line.paintingId;

      // Find the User whose gallery subdocument has _id = paintingId
      const userDoc = await User.findOne(
        { 'gallery._id': paintingId },
        { email: 1, 'gallery.$': 1 }
      ).lean();

      if (!userDoc) {
        console.warn(`⚠️ No user found for paintingId ${paintingId}. Skipping.`);
        continue;
      }

      const artistEmail = userDoc.email;
      if (!artistEmail) {
        console.warn(`⚠️ User ${userDoc._id} has no email. Skipping.`);
        continue;
      }

      if (!artistItemMap[artistEmail]) {
        artistItemMap[artistEmail] = [];
      }
      artistItemMap[artistEmail].push({
        paintingId: paintingId.toString(),
        price:      line.price,
        quantity:   line.quantity,
      });
    }

    const now = savedOrder.createdAt;

    // 1) Email to company
    await sendOrderToCompany({
      buyerEmail,
      shippingAddress,
      items:       savedOrder.items,
      totalPrice,
      date:        now,
    });

    // 2) Email to each artist
    for (let [artistEmail, artistLines] of Object.entries(artistItemMap)) {
      await sendOrderToArtist(
        { items: artistLines, date: now },
        artistEmail
      );
    }

    // 3) Confirmation email to buyer
    await sendOrderConfirmationToBuyer(
      { shippingAddress, totalPrice, date: now },
      buyerEmail
    );
    // ─────────────────────────────────────────────────────────────

    return res.status(201).json({
      message: 'Order saved to DB and emails sent.',
      orderId: savedOrder._id,
    });
  } catch (err) {
    console.error('Error in POST /api/orders:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
