const { getSupabase } = require('../../lib/supabase');
const { requireAdmin, cors } = require('../../lib/auth');
const { generateKey, getExpiry } = require('../../lib/keyUtils');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const db = getSupabase();

  // GET /api/keys/manage - List all keys
  if (req.method === 'GET') {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    let query = db.from('api_keys')
      .select('*, users(username)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (search) query = query.ilike('key', `%${search}%`);
    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'inactive') query = query.eq('is_active', false);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data, total: count, page: Number(page), limit: Number(limit) });
  }

  // POST /api/keys/manage - Create key
  if (req.method === 'POST') {
    const { plan, label, user_id, notes, count = 1 } = req.body || {};
    if (!plan) return res.status(400).json({ success: false, error: 'Thiếu plan' });

    const batchCount = Math.min(Number(count), 50);
    const keys = [];

    for (let i = 0; i < batchCount; i++) {
      const key = generateKey();
      const expires_at = getExpiry(plan);
      keys.push({
        key,
        label: label || `Key ${plan}`,
        plan,
        user_id: user_id || null,
        expires_at,
        notes: notes || null,
        created_by: admin.id
      });
    }

    const { data, error } = await db.from('api_keys').insert(keys).select();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data, message: `Đã tạo ${data.length} key` });
  }

  // PUT /api/keys/manage - Toggle active
  if (req.method === 'PUT') {
    const { id, is_active, label, notes } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: 'Thiếu id' });

    const updates = {};
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    if (label !== undefined) updates.label = label;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await db.from('api_keys').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  // DELETE /api/keys/manage - Delete key
  if (req.method === 'DELETE') {
    const { id } = req.body || req.query || {};
    if (!id) return res.status(400).json({ success: false, error: 'Thiếu id' });

    const { error } = await db.from('api_keys').delete().eq('id', id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, message: 'Đã xóa key' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};
