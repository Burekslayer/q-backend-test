// backend/models/Order.js

const mongoose = require('mongoose');
const { Schema } = mongoose;

// You can adjust/expand these sub-schemas as needed.

// 1) Schema for each line item in the order:
const lineItemSchema = new Schema(
  {
    paintingId: { type: mongoose.Schema.Types.ObjectId, ref: 'User.gallery', required: true },
    price:      { type: Number, required: true },
    quantity:   { type: Number, required: true },
  },
  { _id: false } // no separate _id for each subdocument
);

// 2) Schema for shipping address:
const addressSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName:  { type: String, required: true },
    street:    { type: String, required: true },
    city:      { type: String, required: true },
    postal:    { type: String, required: true },
    country:   { type: String, required: true },
  },
  { _id: false }
);

// 3) Schema for payment info (you may want to omit sensitive fields in production)
const paymentSchema = new Schema(
  {
    cardNumber: { type: String, required: true },
    expiryDate: { type: String, required: true },
    cvv:        { type: String, required: true },
  },
  { _id: false }
);

// 4) The main Order schema
const orderSchema = new Schema(
  {
    buyerEmail:     { type: String, required: true },
    shippingAddress: addressSchema,
    paymentInfo:     paymentSchema,
    items:         [lineItemSchema],
    totalPrice:    { type: Number, required: true },
    createdAt:     { type: Date, default: () => new Date() },
  },
  { collection: 'orders' }
);

module.exports = mongoose.model('Order', orderSchema);
