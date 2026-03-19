const { getSupabase } = require('../../lib/supabase');
const { requireAdmin, cors } = require('../../lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const db = getSupabase();
  try {
    const [
      { count: totalKeys },
      { count: activeKeys },
      { count: totalUsers },
      { count: activeUsers },
      { data: planStats },
      { data: recentLogs }
    ] = await Promise.all([
      db.from('api_keys').select('*', { count: 'exact', head: true }),
      db.from('api_keys').select('*', { count: 'exact', head: true }).eq('is_active', true),
      db.from('users').select('*', { count: 'exact', head: true }),
      db.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true),
      db.from('api_keys').select('plan').eq('is_active', true),
      db.from('key_logs').select('*, api_keys(key, label)').order('created_at', { ascending: false }).limit(10)
    ]);

    // Count by plan
    const byPlan = {};
    (planStats || []).forEach(k => {
      byPlan[k.plan] = (byPlan[k.plan] || 0) + 1;
    });

    return res.json({
      success: true,
      stats: {
        totalKeys, activeKeys,
        totalUsers, activeUsers,
        byPlan, recentLogs: recentLogs || []
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
