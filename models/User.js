const mongoose = require('mongoose');

const paintingSchema = new mongoose.Schema({
  name: { type: String, required: true },      // NEW
  url: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  artistName: { type: String, required: true },
  price: { type: Number, required: true },
  tags: { type: [String], default: [] },
  isImportant: { type: Boolean, default: false },
  importantIndex: { type: Number, default: null },
  averageHue: { type: Number, required: true },
  dateAdded: { type: Date, default: Date.now }, // NEW
});

const userSchema = new mongoose.Schema({
  clerkUserId: { type: String, unique: true, sparse: true }, // NEW: user_...
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: false },
  profilePicture: { type: String, default: '' },
  profileCover: { type: String, default: "" },
  gallery: { type: [paintingSchema], default: [] },
  isVerified: { type: Boolean, default: true },
  verificationToken: { type: String },
  profileTheme: { type: String, default: 'default' },
});

module.exports = mongoose.model('User', userSchema);