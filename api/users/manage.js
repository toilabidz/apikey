const { getSupabase } = require('../../lib/supabase');
const { requireAdmin, hashPassword, cors } = require('../../lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const db = getSupabase();

  // GET - List users
  if (req.method === 'GET') {
    const { page = 1, limit = 20, search = '' } = req.query;
    let query = db.from('users')
      .select('id, username, email, role, is_active, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (search) query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data, total: count });
  }

  // POST - Create user
  if (req.method === 'POST') {
    const { username, email, password, role = 'user' } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Thiếu username hoặc password' });
    }

    const { data, error } = await db.from('users').insert({
      username, email, password_hash: hashPassword(password), role
    }).select('id, username, email, role, is_active, created_at').single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ success: false, error: 'Username hoặc email đã tồn tại' });
      return res.status(500).json({ success: false, error: error.message });
    }
    return res.json({ success: true, data, message: 'Tạo user thành công' });
  }

  // PUT - Update user
  if (req.method === 'PUT') {
    const { id, username, email, password, role, is_active } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: 'Thiếu id' });

    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (password) updates.password_hash = hashPassword(password);
    if (role) updates.role = role;
    if (typeof is_active === 'boolean') updates.is_active = is_active;

    const { data, error } = await db.from('users').update(updates).eq('id', id)
      .select('id, username, email, role, is_active, created_at').single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  // DELETE - Delete user
  if (req.method === 'DELETE') {
    const { id } = req.body || req.query || {};
    if (!id) return res.status(400).json({ success: false, error: 'Thiếu id' });

    const { error } = await db.from('users').delete().eq('id', id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, message: 'Đã xóa user' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};
