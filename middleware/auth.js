const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
  jwksUri: process.env.CLERK_JWKS_URL, // e.g. https://<your-frontend-api>/.well-known/jwks.json
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send('No token provided');

  jwt.verify(
    token,
    getKey,
    {
      // Issuer is important: must match your Clerk Frontend API URL issuer
      issuer: process.env.CLERK_ISSUER,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err) return res.status(401).send('Invalid token');

      // Clerk user id is in `sub`
      req.auth = { clerkUserId: decoded.sub, sessionClaims: decoded };
      next();
    }
  );
}

module.exports = { authMiddleware };
