const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const User = require('../models/User');
const upload = multer({ dest: 'uploads/' });
const bcrypt = require('bcryptjs');
const { authMiddleware } = require('../middleware/auth');
const { attachMongoUser } = require('../middleware/attachMongoUser');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/email');
const sharp = require('sharp')

// Helper: convert raw 0–255 RGB into {h:0–360, s,l}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = 0; s = 0;
  } else {
    const d = max - min;
    s = l > 0.5
      ? d / (2 - max - min)
      : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2);               break;
      case b: h = ((r - g) / d + 4);               break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

router.get('/me', authMiddleware, attachMongoUser, async (req, res) => {
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
      profileTheme: user.profileTheme,
      profileCover: user.profileCover,
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).send('Internal server error');
  }
});

// Upload profile picture and replace existing one if present
router.post('/profile-picture', upload.single('image'), authMiddleware, attachMongoUser, async (req, res) => {
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

// Upload profile cover image
router.post("/profile-cover", authMiddleware, attachMongoUser, upload.single("image"), async (req, res) => {
    try {
      const userId = req.user.id; // however you store it

      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "ku/profile-covers",
        transformation: [{ width: 2048, height: 600, crop: "fill" }], // optional
      });

      const user = await User.findByIdAndUpdate(
        userId,
        { profileCover: uploadResult.secure_url },
        { new: true }
      );

      res.json({ profileCover: user.profileCover });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to upload cover" });
    }
  }
);

//Update profile page colors
router.patch('/profile-theme', authMiddleware, attachMongoUser, async (req, res) => {
  const { theme } = req.body;

  if (!['default', 'dark', 'pastel'].includes(theme)) {
    return res.status(400).send('Invalid theme');
  }

  try {
    const user = await User.findById(req.user.id);
    user.profileTheme = theme;
    await user.save();
    res.send({ message: 'Theme updated', theme });
  } catch (err) {
    console.error('Theme update error:', err);
    res.status(500).send('Server error');
  }
});

// Upload images to cloudinary
router.post(
  '/gallery',
  upload.array('images'),
  authMiddleware,
  attachMongoUser,
  async (req, res) => {
    console.log('Received gallery upload request');
    console.log('Files:', req.files);

    try {
      const { widths, heights, prices, tags, names } = req.body;

      // Helper to normalize single vs multiple values
      const normalize = (value) =>
        Array.isArray(value) ? value : value != null ? [value] : [];

      const widthArray = normalize(widths);
      const heightArray = normalize(heights);
      const priceArray = normalize(prices);
      const tagArray = normalize(tags);
      const nameArray = normalize(names); // NEW

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).send('User not found');

      if (!req.files || req.files.length === 0) {
        return res.status(400).send('No files uploaded');
      }

      // Basic length check – prevent weird mismatches
      if (
        !(
          req.files.length === priceArray.length &&
          req.files.length === tagArray.length &&
          req.files.length === nameArray.length
        )
      ) {
        console.warn('Metadata mismatch', {
          files: req.files.length,
          prices: priceArray.length,
          tags: tagArray.length,
          names: nameArray.length,
        });
        return res
          .status(400)
          .send('Mismatched number of files and metadata fields');
      }

      // 1) Upload all images to Cloudinary
      const uploadedImages = await Promise.all(
        req.files.map((file) => cloudinary.uploader.upload(file.path))
      );

      // 2) Compute hue for each local file (small safety check so sharp
      //    doesn’t throw ENOENT if a file is missing for some reason)
      const hueValues = await Promise.all(
        req.files.map((file) => {
          if (!fs.existsSync(file.path)) {
            console.error('File missing on disk for hue calc:', file.path);
            // Fallback: neutral hue if missing
            return 0;
          }

          return sharp(file.path)
            .resize(1, 1) // collapse to one pixel (average color)
            .raw()
            .toBuffer({ resolveWithObject: true })
            .then(({ data }) => {
              const [r, g, b] = data;
              const { h } = rgbToHsl(r, g, b);
              return Math.round(h);
            });
        })
      );

      console.log('Hue values: ', hueValues);

      uploadedImages.forEach((upload, i) => {
        const rawTag = tagArray[i];
        const tagsForPainting = Array.isArray(rawTag)
          ? rawTag
          : typeof rawTag === 'string'
          ? [rawTag]
          : [];

        const rawName = nameArray[i];
        const name =
          rawName && rawName.trim()
            ? rawName.trim()
            : `Artwork ${user.gallery.length + i + 1}`;

        user.gallery.push({
          name, // NEW
          url: upload.secure_url,
          width: upload.width,
          height: upload.height,
          price: parseFloat(priceArray[i]),
          artistName: `${user.firstName} ${user.lastName}`,
          tags: tagsForPainting,
          isImportant: false,
          importantIndex: null,
          averageHue: hueValues[i],
          dateAdded: new Date(), // NEW (optional; schema default also works)
        });
      });

      await user.save();
      res.status(201).send('Gallery updated!');
    } catch (error) {
      console.error('Gallery upload error:', error);
      res.status(500).send('Failed to upload gallery images');
    }
  }
);

// Add important tags to Gallery Images
router.patch('/gallery/important', authMiddleware, attachMongoUser, async (req, res) => {
  const { url, isImportant } = req.body;
  if (typeof url !== 'string' || typeof isImportant !== 'boolean') {
    return res.status(400).send('Invalid input');
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).send('User not found');

    const image = user.gallery.find(img => img.url === url);
    if (!image) return res.status(404).send('Image not found');

    if (isImportant) {
      const currentCount = user.gallery.filter(img => img.isImportant).length;
      if (currentCount >= 3) return res.status(400).send('Maximum 3 important images allowed');
      image.isImportant = true;
      image.importantIndex = currentCount;
    } else {
      image.isImportant = false;
      image.importantIndex = null;
    }

    await user.save();
    res.send('Image importance updated');
  } catch (error) {
    console.error('Error updating importance:', error);
    res.status(500).send('Server error');
  }
});

router.delete('/gallery', authMiddleware, attachMongoUser, async (req, res) => {
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
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send('User not found');

    res.json({
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicture: user.profilePicture,
      profileTheme: user.profileTheme,       // ✅ NEW
      gallery: user.gallery || []
    });
  } catch (error) {
    console.error('Error fetching public profile:', error);
    res.status(500).send('Server error');
  }
});


// Get users information for gallery setup
router.get('/all', async (req, res) => {
  try {
    const users = await User.find({}, 'firstName lastName gallery');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Server error');
  }
});

// GET /api/users/gallery/nearest?hue=123&count=24
router.get('/gallery/nearest', async (req, res) => {
  try {
    const clickedHue = parseInt(req.query.hue, 10);
    if (isNaN(clickedHue)) {
      return res.status(400).send('Missing or invalid hue');
    }
    // default to 24 closest by hue
    const count = parseInt(req.query.count, 10) || 24;

    const matches = await User.aggregate([
      { $unwind: '$gallery' },
      { $addFields: {
          'gallery.diff': {
            $let: {
              vars: {
                d: { $abs: { $subtract: ['$gallery.averageHue', clickedHue] } }
              },
              in: { $min: ['$$d', { $subtract: [360, '$$d'] }] }
            }
          }
        }
      },
      { $sort: { 'gallery.diff': 1 } },
      { $limit: count },
      { $replaceRoot: { newRoot: '$gallery' } }
    ]);

    res.json(matches);
  } catch (err) {
    console.error('Error fetching nearest images:', err);
    res.status(500).send('Server error');
  }
});



module.exports = router;
