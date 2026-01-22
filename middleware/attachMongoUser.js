// backend/middleware/attachMongoUser.js
const User = require('../models/User');
const { clerkClient } = require('@clerk/clerk-sdk-node');

async function attachMongoUser(req, res, next) {
  try {
    // This assumes your authMiddleware put Clerk data here
    const { clerkUserId } = req.auth || {};
    if (!clerkUserId) {
      return res.status(401).send('Not authenticated');
    }

    // 1) Try to find an existing Mongo user by clerkUserId
    let user = await User.findOne({ clerkUserId });

    // 2) If not found, fetch data from Clerk and create one
    if (!user) {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);

      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      );

      const firstName = clerkUser.firstName || 'User';
      const lastName = clerkUser.lastName || '';
      const email = primaryEmail?.emailAddress || `${clerkUserId}@placeholder.local`;
      const imageUrl = clerkUser.imageUrl || '';

      user = await User.create({
        clerkUserId,
        firstName,
        lastName,
        email,
        profilePicture: imageUrl,
        gallery: [],
        isVerified: true,        // Clerk already verified email
      });
    } else {
      // Optional: keep Mongo in sync with Clerk profile changes
      try {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        const primaryEmail = clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId
        );

        const updates = {};
        if (clerkUser.firstName && clerkUser.firstName !== user.firstName) {
          updates.firstName = clerkUser.firstName;
        }
        if (clerkUser.lastName && clerkUser.lastName !== user.lastName) {
          updates.lastName = clerkUser.lastName;
        }
        if (primaryEmail?.emailAddress && primaryEmail.emailAddress !== user.email) {
          updates.email = primaryEmail.emailAddress;
        }
        if (clerkUser.imageUrl && clerkUser.imageUrl !== user.profilePicture) {
          updates.profilePicture = clerkUser.imageUrl;
        }

        if (Object.keys(updates).length > 0) {
          Object.assign(user, updates);
          await user.save();
        }
      } catch (syncErr) {
        console.warn('attachMongoUser: failed to sync profile from Clerk', syncErr);
      }
    }

    // 3) Attach Mongo user to request for downstream routes
    req.user = { id: user._id.toString() };   // legacy pattern your routes use
    req.mongoUser = user;

    next();
  } catch (err) {
    console.error('attachMongoUser error:', err);
    res.status(500).send('Internal server error');
  }
}

module.exports = { attachMongoUser };