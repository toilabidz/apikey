const { getSupabase } = require('../../lib/supabase');
const { isKeyExpired } = require('../../lib/keyUtils');
const { cors } = require('../../lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = (req.method === 'GET' ? req.query.key : req.body?.key) || '';

  if (!key) {
    return res.status(400).json({ success: false, valid: false, error: 'Thiếu key' });
  }

  try {
    const db = getSupabase();
    const { data: apiKey, error } = await db
      .from('api_keys')
      .select('*, users(username, email, is_active)')
      .eq('key', key.trim())
      .single();

    if (error || !apiKey) {
      return res.status(404).json({ success: false, valid: false, error: 'Key không tồn tại' });
    }

    if (!apiKey.is_active) {
      return res.json({ success: true, valid: false, reason: 'KEY_DISABLED', message: 'Key đã bị vô hiệu hóa' });
    }

    if (isKeyExpired(apiKey.expires_at)) {
      return res.json({ success: true, valid: false, reason: 'KEY_EXPIRED', message: 'Key đã hết hạn', expires_at: apiKey.expires_at });
    }

    // Update use count & last used
    await db.from('api_keys').update({
      use_count: (apiKey.use_count || 0) + 1,
      last_used_at: new Date().toISOString()
    }).eq('id', apiKey.id);

    // Log
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    await db.from('key_logs').insert({
      key_id: apiKey.id,
      action: 'validate',
      ip_address: ip.split(',')[0].trim(),
      user_agent: req.headers['user-agent'] || '',
      metadata: { method: req.method }
    });

    return res.json({
      success: true,
      valid: true,
      key: {
        id: apiKey.id,
        label: apiKey.label,
        plan: apiKey.plan,
        expires_at: apiKey.expires_at,
        user: apiKey.users ? { username: apiKey.users.username } : null
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, valid: false, error: err.message });
  }
};
