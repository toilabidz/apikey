const { getSupabase } = require('../../lib/supabase');
const { requireAdmin, cors } = require('../../lib/auth');

// GET /api/keys/export?format=csv|json&status=active&plan=month
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { format = 'json', status, plan } = req.query;
  const db = getSupabase();

  let query = db.from('api_keys')
    .select('key, label, plan, is_active, expires_at, use_count, created_at, notes, users(username)')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (status === 'active') query = query.eq('is_active', true);
  if (status === 'inactive') query = query.eq('is_active', false);
  if (plan) query = query.eq('plan', plan);

  const { data, error } = await query;
  if (error) return res.status(500).json({ success: false, error: error.message });

  if (format === 'csv') {
    const headers = ['key', 'label', 'plan', 'is_active', 'expires_at', 'use_count', 'username', 'created_at', 'notes'];
    const rows = data.map(k => [
      k.key, k.label || '', k.plan, k.is_active,
      k.expires_at || 'lifetime', k.use_count || 0,
      k.users?.username || '', k.created_at, k.notes || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="keys_export_${Date.now()}.csv"`);
    return res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  }

  // JSON
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="keys_export_${Date.now()}.json"`);
  return res.json({ success: true, count: data.length, exported_at: new Date().toISOString(), data });
};
