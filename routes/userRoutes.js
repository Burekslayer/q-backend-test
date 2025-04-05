const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const upload = multer({ dest: 'uploads/' });
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/email');

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).send('User not found');
    }

    res.json({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profilePicture: user.profilePicture,
      gallery: user.gallery,
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).send('Internal server error');
  }
});

// Login Route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).send('Invalid credentials');
    }
    if (!user.isVerified) {
      return res.status(403).send('Please verify your email before logging in');
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).send('Error logging in');
  }
});

// Register Route
router.post('/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).send('All fields are required');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      verificationToken,
      isVerified: false,
    });

    await user.save();
    await sendVerificationEmail(email, verificationToken);

    res.status(201).send('Registration successful! Please check your email to verify your account.');
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      if (error.keyPattern?.email) return res.status(400).send('Email already registered');
    }
    res.status(500).send('Error registering user');
  }
});

// Email verification route
router.get('/verify', async (req, res) => {
  const { token } = req.query;
  try {
    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).send('Invalid or expired verification token');

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?verified=true&token=${jwtToken}`);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).send('Server error during verification');
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send('User not found');
    if (user.isVerified) return res.status(400).send('User is already verified');

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    await user.save();

    await sendVerificationEmail(email, verificationToken);
    res.send('Verification email resent');
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).send('Error resending verification email');
  }
});

// Upload profile picture and replace existing one if present
router.post('/profile-picture', upload.single('image'), authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).send('User not found');

    // If user already has a profile picture on Cloudinary, delete it
    if (user.profilePicture) {
      const publicId = user.profilePicture.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    }

    const uploaded = await cloudinary.uploader.upload(req.file.path);
    user.profilePicture = uploaded.secure_url;
    await user.save();

    res.status(200).json({ profilePicture: uploaded.secure_url });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).send('Failed to upload profile picture');
  }
});

// Upload images to cloudinary
router.post('/gallery', upload.array('images'), authMiddleware, async (req, res) => {
  try {
    const { widths, heights, prices, tags } = req.body;

    const widthArray = Array.isArray(widths) ? widths : [widths];
    const heightArray = Array.isArray(heights) ? heights : [heights];
    const priceArray = Array.isArray(prices) ? prices : [prices];
    const tagArray = Array.isArray(tags) ? tags : [tags];

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).send('User not found');

    const uploadedImages = await Promise.all(req.files.map(file =>
      cloudinary.uploader.upload(file.path)
    ));

    uploadedImages.forEach((upload, i) => {
      user.gallery.push({
        url: upload.secure_url,
        width: parseInt(widthArray[i]),
        height: parseInt(heightArray[i]),
        price: parseFloat(priceArray[i]),
        artistName: `${user.firstName} ${user.lastName}`,
        tags: [tagArray[i]],
      });
    });

    await user.save();
    res.status(201).send('Gallery updated!');
  } catch (error) {
    console.error('Gallery upload error:', error);
    res.status(500).send('Failed to upload gallery images');
  }
});

router.delete('/gallery', authMiddleware, async (req, res) => {
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images)) {
      return res.status(400).send('No images provided for deletion');
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).send('User not found');

    user.gallery = user.gallery.filter(painting => !images.includes(painting.url));
    await user.save();

    res.status(200).send('Selected images deleted');
  } catch (error) {
    console.error('Error deleting images:', error);
    res.status(500).send('Failed to delete images');
  }
});

// Search logic
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).send('Missing search query');

    const users = await User.find({
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { 'gallery.tags': { $regex: query, $options: 'i' } },
      ]
    }).select('firstName lastName profilePicture gallery');

    res.json(users);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).send('Error performing search');
  }
});

// Public profile id
router.get('/public/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -verificationToken');
    if (!user) return res.status(404).send('User not found');
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading public profile');
  }
});
module.exports = router;
