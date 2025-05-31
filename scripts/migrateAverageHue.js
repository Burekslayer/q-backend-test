// scripts/migrateAverageHue.js
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../models/User');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await User.updateMany(
    {},
    { $set: { "gallery.$[].averageHue": 0 } }
  );
  console.log(`Matched ${result.n} docs, modified ${result.nModified}`);
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
