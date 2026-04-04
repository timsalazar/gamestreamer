import { parseLineup } from '../../lib/claude.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST /api/lineup/scan — scan a lineup card image
  if (req.method === 'POST') {
    const { image_base64, media_type } = req.body;

    if (!image_base64 || !media_type) {
      return res.status(400).json({ error: 'image_base64 and media_type are required' });
    }

    // Validate media type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(media_type)) {
      return res.status(400).json({ error: `Unsupported media type: ${media_type}` });
    }

    try {
      const result = await parseLineup(image_base64, media_type);

      // Validate result has players array
      if (!result.players || !Array.isArray(result.players)) {
        return res.status(422).json({
          error: 'Could not extract lineup from image',
          detail: 'Claude did not return a valid players array',
        });
      }

      return res.status(200).json(result);
    } catch (err) {
      return res.status(503).json({
        error: 'Failed to scan lineup card',
        detail: err.message,
      });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
