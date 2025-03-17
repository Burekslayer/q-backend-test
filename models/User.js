const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // Cloudinary URL for the profile picture
  profilePicture: { type: String, default: '' },
  // An array of strings for gallery items
  gallery: { type: [String], default: [] },
});

module.exports = mongoose.model('User', userSchema);