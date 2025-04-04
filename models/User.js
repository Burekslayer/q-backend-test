const mongoose = require('mongoose');

const paintingSchema = new mongoose.Schema({
  url: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  artistName: { type: String, required: true },
  price: { type: Number, required: true },
  tags: { type: [String], default: [] }
});

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: { type: String, default: '' },
  gallery: { type: [paintingSchema], default: [] },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String }, // will be a UUID or random string
});

module.exports = mongoose.model('User', userSchema);