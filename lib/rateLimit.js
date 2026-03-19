const { getSupabase } = require('./supabase');

/**
 * Simple rate limiter using Supabase key_logs table.
 * Counts requests from an IP in the last `windowSec` seconds.
 */
async function rateLimit(req, res, { max = 30, windowSec = 60 } = {}) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (!ip) return true; // can't determine IP, let through

  try {
    const db = getSupabase();
    const since = new Date(Date.now() - windowSec * 1000).toISOString();

    const { count } = await db
      .from('key_logs')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', since);

    if (count >= max) {
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please slow down.',
        retry_after: windowSec
      });
      return false;
    }
    return true;
  } catch {
    return true; // fail open
  }
}

module.exports = { rateLimit };
