const { getSupabase } = require('../../lib/supabase');
const { requireAdmin, cors } = require('../../lib/auth');

// GET /api/admin/logs?page=1&limit=50&key_id=xxx
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { page = 1, limit = 50, key_id } = req.query;
  const db = getSupabase();

  let query = db.from('key_logs')
    .select('*, api_keys(key, label, plan)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (key_id) query = query.eq('key_id', key_id);

  const { data, count, error } = await query;
  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.json({ success: true, data, total: count, page: Number(page), limit: Number(limit) });
};
