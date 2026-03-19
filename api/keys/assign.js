const { getSupabase } = require('../../lib/supabase');
const { requireAdmin, cors } = require('../../lib/auth');

// POST /api/keys/assign  { key_id, user_id }
// DELETE /api/keys/assign { key_id }  → unassign
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const db = getSupabase();
  const { key_id, user_id } = req.body || {};

  if (!key_id) return res.status(400).json({ success: false, error: 'Thiếu key_id' });

  // Verify key exists
  const { data: key, error: keyErr } = await db
    .from('api_keys').select('id, key, user_id').eq('id', key_id).single();
  if (keyErr || !key) return res.status(404).json({ success: false, error: 'Key không tồn tại' });

  if (req.method === 'POST') {
    if (!user_id) return res.status(400).json({ success: false, error: 'Thiếu user_id' });

    // Verify user exists
    const { data: user, error: userErr } = await db
      .from('users').select('id, username').eq('id', user_id).single();
    if (userErr || !user) return res.status(404).json({ success: false, error: 'User không tồn tại' });

    const { data, error } = await db
      .from('api_keys').update({ user_id }).eq('id', key_id).select('*, users(username)').single();
    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, data, message: `Đã gán key cho ${user.username}` });
  }

  if (req.method === 'DELETE') {
    const { data, error } = await db
      .from('api_keys').update({ user_id: null }).eq('id', key_id).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data, message: 'Đã bỏ gán key' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};
