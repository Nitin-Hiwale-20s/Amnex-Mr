// Vercel serverless entry: the whole Express app runs as one function.
// vercel.json rewrites every /api/* request here.
module.exports = require('../server/server');
