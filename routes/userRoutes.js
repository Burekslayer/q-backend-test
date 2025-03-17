// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth'); // Some JWT auth
const upload = multer({ dest: 'uploads/' }); // or configure as you like

// Upload or update profile picture

router.get('/me', authMiddleware, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      // Return only the fields you want
      res.json({
        username: user.username,
        profilePicture: user.profilePicture,
        gallery: user.gallery,
      });
    } catch (error) {
      console.error('Error fetching user data:', error);
      res.status(500).send('Internal server error');
    }
  });


  router.get('/search', async (req, res) => {
    try {
      // e.g. /search?query=john
      const { query } = req.query;
      if (!query) {
        return res.status(400).send('No search query provided');
      }
  
      // Case-insensitive partial match on username
      const users = await User.find({
        username: { $regex: query, $options: 'i' },
      });
  
      // Return a minimal set of fields
      // e.g., username + profilePicture, or entire doc. Up to you:
      const results = users.map(user => ({
        _id: user._id,
        username: user.username,
        profilePicture: user.profilePicture,
        // etc. – you can decide how much public info to show
      }));
  
      res.json(results);
    } catch (error) {
      console.error(error);
      res.status(500).send('Error searching users');
    }
  });


router.post('/profile-picture', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    // 1. The user is identified by req.user.id (from JWT)
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).send('User not found');
    console.log('req.file:', req.file);
    console.log('req.user:', req.user);
    // 2. Upload new image to Cloudinary
    const filePath = req.file.path; // multer-saved path
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      folder: 'profile_pictures', // optional folder name in Cloudinary
    });

    // 3. Optionally remove old image if you want:
    /* if (user.profilePicture) {
      const publicId = extractPublicId(user.profilePicture);
      await cloudinary.uploader.destroy(publicId);
    } */

    // 4. Update user document
    user.profilePicture = uploadResult.secure_url;
    await user.save();

    // 5. Return updated user info
    res.json({
      message: 'Profile picture updated successfully',
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error uploading profile picture');
  }
});

// routes/userRoutes.js (continuing)
router.post('/gallery', authMiddleware, upload.array('images', 10), async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).send('User not found');
  
      const fileUploads = req.files.map(file => {
        return cloudinary.uploader.upload(file.path, {
          folder: 'art_gallery', // optional folder in Cloudinary
        });
      });
  
      // Wait for all uploads to finish
      const uploadResults = await Promise.all(fileUploads);
  
      // Push new Cloudinary URLs into the gallery array
      uploadResults.forEach(result => {
        user.gallery.push(result.secure_url);
      });
  
      await user.save();
  
      res.json({
        message: 'Gallery updated successfully',
        gallery: user.gallery,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send('Error uploading gallery images');
    }
  });
  
  router.get('/:username', async (req, res) => {
    try {
      const { username } = req.params;
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      // Return only public fields
      res.json({
        username: user.username,
        profilePicture: user.profilePicture,
        gallery: user.gallery,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send('Error fetching user profile');
    }
  });
  
module.exports = router;
