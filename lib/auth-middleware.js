import { supabaseAdmin } from './supabase.js';

/**
 * Express middleware that verifies a Supabase JWT and attaches req.user.
 *
 * Token resolution order:
 *   1. Authorization: Bearer <token> header
 *   2. sb-access-token cookie
 *
 * On success:  req.user = { id, email } and calls next()
 * On failure:  responds 401 { error: 'Unauthorized' }
 *
 * NOTE: For Vercel serverless functions (api/ directory) this middleware
 * cannot be used directly via app.use() because Vercel functions do not go
 * through the Express router. Use the extractUser() helper exported below
 * to inline the same logic inside individual handlers.
 */
export default async function authMiddleware(req, res, next) {
  const user = await extractUser(req);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = user;
  next();
}

/**
 * Extracts and verifies the Supabase JWT from the request.
 * Returns { id, email } on success, or null if the token is missing/invalid.
 *
 * Export this helper so Vercel API handlers can call it inline:
 *
 *   import { extractUser } from '../lib/auth-middleware.js';
 *
 *   export default async function handler(req, res) {
 *     const user = await extractUser(req);
 *     if (!user) return res.status(401).json({ error: 'Unauthorized' });
 *     // ... rest of handler
 *   }
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ id: string, email: string } | null>}
 */
export async function extractUser(req) {
  let token = null;

  // 1. Authorization header
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // 2. Cookie fallback
  if (!token) {
    const cookieHeader = req.headers?.cookie || '';
    const match = cookieHeader.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
    if (match) {
      token = decodeURIComponent(match[1]).trim();
    }
  }

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) return null;

  return {
    id: data.user.id,
    email: data.user.email,
  };
}
