const { getSupabase } = require('../../lib/supabase');
const { requireAdmin, cors } = require('../../lib/auth');

// POST /api/keys/bulk
// body: { action: 'delete'|'activate'|'deactivate', ids: [...] }
// or:   { action: 'delete_expired' }  → delete all expired
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { action, ids } = req.body || {};
  if (!action) return res.status(400).json({ success: false, error: 'Thiếu action' });

  const db = getSupabase();

  if (action === 'delete_expired') {
    const { error, count } = await db
      .from('api_keys')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, message: `Đã xóa ${count || 0} key hết hạn` });
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Thiếu danh sách ids' });
  }
  if (ids.length > 200) {
    return res.status(400).json({ success: false, error: 'Tối đa 200 keys mỗi lần' });
  }

  if (action === 'delete') {
    const { error } = await db.from('api_keys').delete().in('id', ids);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, message: `Đã xóa ${ids.length} key` });
  }

  if (action === 'activate' || action === 'deactivate') {
    const is_active = action === 'activate';
    const { error } = await db.from('api_keys').update({ is_active }).in('id', ids);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, message: `Đã ${is_active ? 'bật' : 'tắt'} ${ids.length} key` });
  }

  return res.status(400).json({ success: false, error: `Action không hợp lệ: ${action}` });
};
