const { getSupabase } = require('../../lib/supabase');
const { hashPassword, generateToken, cors } = require('../../lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Thiếu username hoặc password' });
  }

  try {
    const db = getSupabase();
    const { data: user, error } = await db
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password_hash', hashPassword(password))
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Sai username hoặc password' });
    }

    const token = generateToken({ id: user.id, username: user.username, role: user.role });
    return res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, email: user.email }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
