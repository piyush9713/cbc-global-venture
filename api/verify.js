/**
 * Vercel Serverless Function: POST /api/verify
 * Validates Content Studio access passcode on the backend.
 * Keeps secret passcodes securely on the server and completely hidden from the frontend.
 */

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is supported.' });
  }

  try {
    const { passcode } = req.body || {};

    if (!passcode || typeof passcode !== 'string') {
      return res.status(400).json({ error: 'Passcode is required.' });
    }

    // Server-side authorized passcodes (never exposed to client browser)
    const validCodes = ['cbc2026', 'admin', 'cbc@admin'];
    if (process.env.STUDIO_SECRET_CODE) {
      validCodes.push(process.env.STUDIO_SECRET_CODE.trim());
    }

    const isValid = validCodes.some(c => c.toLowerCase() === passcode.trim().toLowerCase());

    if (isValid) {
      return res.status(200).json({
        success: true,
        message: 'Content Studio unlocked successfully.'
      });
    } else {
      return res.status(401).json({
        error: 'Incorrect passcode. Try again.'
      });
    }
  } catch (err) {
    console.error('Verify API error:', err);
    return res.status(500).json({
      error: 'Internal Server Error: ' + (err.message || 'Unknown error')
    });
  }
};
