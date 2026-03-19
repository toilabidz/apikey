const { getSupabase } = require('../../lib/supabase');
const { generateKey, getExpiry, getPlanLabel, isKeyExpired } = require('../../lib/keyUtils');
const { cors } = require('../../lib/auth');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_ADMINS = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function tgCall(method, body) {
  if (!BOT_TOKEN) return null;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

const send = (chat_id, text, extra = {}) =>
  tgCall('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });

const edit = (chat_id, message_id, text, extra = {}) =>
  tgCall('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', ...extra });

const answerCbq = (callback_query_id, text = '', show_alert = false) =>
  tgCall('answerCallbackQuery', { callback_query_id, text, show_alert });

function isAdmin(chatId) {
  if (!ALLOWED_ADMINS.length) return true;
  return ALLOWED_ADMINS.includes(String(chatId));
}

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: '🔑 Tạo Key', callback_data: 'menu_addkey' }, { text: '📋 Danh sách Key', callback_data: 'list_1' }],
    [{ text: '🔍 Kiểm tra Key', callback_data: 'menu_check' }, { text: '📊 Thống kê', callback_data: 'stats' }],
    [{ text: '🗑 Xóa hết key hết hạn', callback_data: 'del_expired' }]
  ]
};

const PLAN_KEYBOARD = {
  inline_keyboard: [
    [{ text: '🆓 Dùng thử (3 ngày)', callback_data: 'pickplan_trial' }],
    [{ text: '📅 1 Ngày', callback_data: 'pickplan_day' }, { text: '📆 7 Ngày', callback_data: 'pickplan_week' }],
    [{ text: '🗓 30 Ngày', callback_data: 'pickplan_month' }, { text: '📅 1 Năm', callback_data: 'pickplan_year' }],
    [{ text: '♾ Vĩnh Viễn', callback_data: 'pickplan_lifetime' }],
    [{ text: '« Quay lại', callback_data: 'main_menu' }]
  ]
};

function countKeyboard(plan) {
  return {
    inline_keyboard: [
      [1, 3, 5].map(n => ({ text: `${n} key`, callback_data: `create_${plan}_${n}` })),
      [10, 20, 50].map(n => ({ text: `${n} key`, callback_data: `create_${plan}_${n}` })),
      [{ text: '« Chọn plan khác', callback_data: 'menu_addkey' }]
    ]
  };
}

function keyActionKeyboard(keyId, isActive) {
  return {
    inline_keyboard: [
      [
        { text: isActive ? '⏸ Tắt Key' : '▶ Bật Key', callback_data: `toggle_${keyId}_${!isActive}` },
        { text: '🗑 Xóa Key', callback_data: `confirmdelete_${keyId}` }
      ],
      [{ text: '« Danh sách', callback_data: 'list_1' }]
    ]
  };
}

async function handleStats(chatId, db, msgId) {
  const [{ count: totalKeys }, { count: activeKeys }, { count: totalUsers }, { data: plans }] = await Promise.all([
    db.from('api_keys').select('*', { count: 'exact', head: true }),
    db.from('api_keys').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('users').select('*', { count: 'exact', head: true }),
    db.from('api_keys').select('plan').eq('is_active', true)
  ]);

  const byPlan = {};
  (plans || []).forEach(k => { byPlan[k.plan] = (byPlan[k.plan] || 0) + 1; });
  const planLines = Object.entries(byPlan).map(([p, c]) => `  • ${getPlanLabel(p)}: <b>${c}</b>`).join('\n') || '  Chưa có key nào';

  const text = `📊 <b>Thống kê KeyMaster</b>\n\n🔑 Tổng Keys: <b>${totalKeys}</b>\n✅ Keys Active: <b>${activeKeys}</b>\n👥 Tổng Users: <b>${totalUsers}</b>\n\n<b>Keys theo Plan:</b>\n${planLines}`;
  const kb = { inline_keyboard: [[{ text: '« Menu chính', callback_data: 'main_menu' }]] };
  return msgId ? edit(chatId, msgId, text, { reply_markup: kb }) : send(chatId, text, { reply_markup: kb });
}

async function handleListKeys(chatId, page, db, msgId) {
  const limit = 6;
  const { data: keys, count } = await db.from('api_keys')
    .select('id, key, plan, is_active, expires_at, label', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  const totalPages = Math.max(1, Math.ceil(count / limit));
  let text = `📋 <b>Danh sách Keys</b> (Trang ${page}/${totalPages}) — Tổng: <b>${count}</b>\n\n`;

  const inlineRows = [];
  (keys || []).forEach(k => {
    const expired = isKeyExpired(k.expires_at);
    const icon = !k.is_active ? '🔴' : expired ? '🟡' : '🟢';
    text += `${icon} <code>${k.key}</code>\n   ${getPlanLabel(k.plan)}${k.label ? ' — ' + k.label : ''}\n\n`;
    inlineRows.push([{ text: `🔍 ...${k.key.slice(-13)}`, callback_data: `info_${k.id}` }]);
  });

  const navRow = [];
  if (page > 1) navRow.push({ text: '← Trước', callback_data: `list_${page - 1}` });
  if (page < totalPages) navRow.push({ text: 'Sau →', callback_data: `list_${page + 1}` });
  if (navRow.length) inlineRows.push(navRow);
  inlineRows.push([{ text: '+ Tạo Key', callback_data: 'menu_addkey' }, { text: '« Menu', callback_data: 'main_menu' }]);

  const kb = { inline_keyboard: inlineRows };
  return msgId ? edit(chatId, msgId, text, { reply_markup: kb }) : send(chatId, text, { reply_markup: kb });
}

async function handleKeyInfo(chatId, keyId, db, msgId) {
  const { data: k } = await db.from('api_keys').select('*, users(username)').eq('id', keyId).single();
  if (!k) return send(chatId, '❌ Không tìm thấy key.');
  const expired = isKeyExpired(k.expires_at);
  const status = !k.is_active ? '🔴 Bị tắt' : expired ? '🟡 Hết hạn' : '🟢 Hợp lệ';
  const text = `🔑 <b>Chi tiết Key</b>\n\nKey: <code>${k.key}</code>\nLabel: ${k.label || '—'}\nPlan: <b>${getPlanLabel(k.plan)}</b>\nTrạng thái: ${status}\nHết hạn: ${k.expires_at ? new Date(k.expires_at).toLocaleString('vi-VN') : '♾ Vĩnh viễn'}\nUser: ${k.users?.username || '—'}\nĐã dùng: <b>${k.use_count || 0}</b> lần\nTạo lúc: ${new Date(k.created_at).toLocaleString('vi-VN')}`;
  const kb = keyActionKeyboard(k.id, k.is_active);
  return msgId ? edit(chatId, msgId, text, { reply_markup: kb }) : send(chatId, text, { reply_markup: kb });
}

async function handleMessage(chatId, text, db) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === '/start' || cmd === '/menu') {
    return send(chatId, '👋 Chào mừng đến với <b>KeyMaster Bot</b>!\nChọn chức năng bên dưới:', { reply_markup: MAIN_MENU });
  }
  if (cmd === '/help') {
    return send(chatId, `🔑 <b>KeyMaster — Hướng dẫn</b>\n\n/menu — Menu chính\n/addkey [plan] [count] — Tạo key\n/checkkey [key] — Kiểm tra key\n/listkeys [page] — Danh sách\n/delkey [key] — Xóa key\n/togglekey [key] — Bật/tắt\n/stats — Thống kê\n\n<b>Plans:</b> trial|day|week|month|year|lifetime`);
  }
  if (cmd === '/addkey') {
    const plan = parts[1];
    const validPlans = ['day', 'week', 'month', 'year', 'lifetime', 'trial'];
    if (!plan || !validPlans.includes(plan)) return send(chatId, '🔑 <b>Chọn gói thời hạn:</b>', { reply_markup: PLAN_KEYBOARD });
    const count = Math.min(parseInt(parts[2]) || 1, 50);
    const label = parts.slice(3).join(' ') || `Key ${getPlanLabel(plan)}`;
    const keys = Array.from({ length: count }, () => ({ key: generateKey(), plan, label, expires_at: getExpiry(plan) }));
    const { data, error } = await db.from('api_keys').insert(keys).select();
    if (error) return send(chatId, `❌ Lỗi: ${error.message}`);
    let msg = `✅ Tạo <b>${data.length}</b> key <b>${getPlanLabel(plan)}</b> thành công!\n\n`;
    data.forEach((k, i) => { msg += `${i + 1}. <code>${k.key}</code>\n`; if (k.expires_at) msg += `   ⏱ ${new Date(k.expires_at).toLocaleDateString('vi-VN')}\n`; });
    return send(chatId, msg, { reply_markup: { inline_keyboard: [[{ text: '📋 Xem danh sách', callback_data: 'list_1' }]] } });
  }
  if (cmd === '/checkkey') {
    if (!parts[1]) return send(chatId, '❌ Cú pháp: /checkkey KM-XXXX-...');
    const { data: k } = await db.from('api_keys').select('id').eq('key', parts[1]).single();
    if (!k) return send(chatId, '❌ Key không tồn tại.');
    return handleKeyInfo(chatId, k.id, db, null);
  }
  if (cmd === '/listkeys') return handleListKeys(chatId, parseInt(parts[1]) || 1, db, null);
  if (cmd === '/delkey') {
    if (!parts[1]) return send(chatId, '❌ Cú pháp: /delkey KM-XXXX-...');
    const { data: k } = await db.from('api_keys').select('id').eq('key', parts[1]).single();
    if (!k) return send(chatId, '❌ Key không tồn tại.');
    await db.from('api_keys').delete().eq('id', k.id);
    return send(chatId, `🗑 Đã xóa key:\n<code>${parts[1]}</code>`);
  }
  if (cmd === '/togglekey') {
    if (!parts[1]) return send(chatId, '❌ Cú pháp: /togglekey KM-XXXX-...');
    const { data: k } = await db.from('api_keys').select('id, is_active').eq('key', parts[1]).single();
    if (!k) return send(chatId, '❌ Key không tồn tại.');
    const s = !k.is_active;
    await db.from('api_keys').update({ is_active: s }).eq('id', k.id);
    return send(chatId, `${s ? '✅ Đã bật' : '🔴 Đã tắt'} key:\n<code>${parts[1]}</code>`);
  }
  if (cmd === '/stats') return handleStats(chatId, db, null);

  return send(chatId, '❓ Lệnh không hợp lệ. Gõ /menu hoặc /help');
}

async function handleCallback(cbq, db) {
  const chatId = cbq.message.chat.id;
  const msgId = cbq.message.message_id;
  const data = cbq.data;
  await answerCbq(cbq.id);

  if (data === 'main_menu') return edit(chatId, msgId, '👋 <b>Menu chính</b> — chọn chức năng:', { reply_markup: MAIN_MENU });
  if (data === 'menu_addkey') return edit(chatId, msgId, '🔑 <b>Chọn gói thời hạn:</b>', { reply_markup: PLAN_KEYBOARD });
  if (data === 'menu_check') return edit(chatId, msgId, '🔍 Gửi lệnh:\n<code>/checkkey KM-XXXX-XXXX-XXXX-XXXX</code>', { reply_markup: { inline_keyboard: [[{ text: '« Quay lại', callback_data: 'main_menu' }]] } });
  if (data === 'stats') return handleStats(chatId, db, msgId);
  if (data.startsWith('list_')) return handleListKeys(chatId, parseInt(data.split('_')[1]) || 1, db, msgId);
  if (data.startsWith('info_')) return handleKeyInfo(chatId, data.slice(5), db, msgId);

  if (data.startsWith('pickplan_')) {
    const plan = data.slice(9);
    return edit(chatId, msgId, `🔑 Gói <b>${getPlanLabel(plan)}</b> — chọn số lượng:`, { reply_markup: countKeyboard(plan) });
  }

  if (data.startsWith('create_')) {
    const [, plan, countStr] = data.split('_');
    const count = parseInt(countStr) || 1;
    await answerCbq(cbq.id, `Đang tạo ${count} key...`);
    const keys = Array.from({ length: count }, () => ({ key: generateKey(), plan, label: `Key ${getPlanLabel(plan)}`, expires_at: getExpiry(plan) }));
    const { data: created, error } = await db.from('api_keys').insert(keys).select();
    if (error) return send(chatId, `❌ Lỗi: ${error.message}`);
    let msg = `✅ Tạo <b>${created.length}</b> key <b>${getPlanLabel(plan)}</b> thành công!\n\n`;
    created.forEach((k, i) => { msg += `${i + 1}. <code>${k.key}</code>\n`; if (k.expires_at) msg += `   ⏱ ${new Date(k.expires_at).toLocaleDateString('vi-VN')}\n`; });
    return send(chatId, msg, { reply_markup: { inline_keyboard: [[{ text: '🔑 Tạo thêm', callback_data: 'menu_addkey' }, { text: '📋 Danh sách', callback_data: 'list_1' }]] } });
  }

  if (data.startsWith('toggle_')) {
    const [, keyId, statusStr] = data.split('_');
    const newStatus = statusStr === 'true';
    await db.from('api_keys').update({ is_active: newStatus }).eq('id', keyId);
    await answerCbq(cbq.id, newStatus ? '✅ Đã bật key' : '🔴 Đã tắt key');
    return handleKeyInfo(chatId, keyId, db, msgId);
  }

  if (data.startsWith('confirmdelete_')) {
    const keyId = data.slice(14);
    const { data: k } = await db.from('api_keys').select('key').eq('id', keyId).single();
    return edit(chatId, msgId, `⚠️ Xác nhận xóa key:\n<code>${k?.key}</code>\n\nHành động không thể hoàn tác!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Xóa', callback_data: `dodelete_${keyId}` }, { text: '❌ Hủy', callback_data: `info_${keyId}` }]
        ]
      }
    });
  }

  if (data.startsWith('dodelete_')) {
    const keyId = data.slice(9);
    const { data: k } = await db.from('api_keys').select('key').eq('id', keyId).single();
    await db.from('api_keys').delete().eq('id', keyId);
    await answerCbq(cbq.id, '🗑 Đã xóa key');
    return edit(chatId, msgId, `🗑 Đã xóa key:\n<code>${k?.key || keyId}</code>`, {
      reply_markup: { inline_keyboard: [[{ text: '« Danh sách', callback_data: 'list_1' }]] }
    });
  }

  if (data === 'del_expired') {
    const { count } = await db.from('api_keys').delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString()).not('expires_at', 'is', null);
    await answerCbq(cbq.id, `Đã xóa ${count || 0} key hết hạn`);
    return edit(chatId, msgId, `🗑 Đã xóa <b>${count || 0}</b> key hết hạn.`, {
      reply_markup: { inline_keyboard: [[{ text: '« Menu chính', callback_data: 'main_menu' }]] }
    });
  }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(403).json({ ok: false });
  }

  res.status(200).json({ ok: true }); // Respond immediately

  try {
    const update = req.body;
    const db = getSupabase();

    if (update.callback_query) {
      const cbq = update.callback_query;
      if (!isAdmin(cbq.message.chat.id)) { await answerCbq(cbq.id, '⛔ Không có quyền truy cập.', true); return; }
      await handleCallback(cbq, db);
      return;
    }

    const message = update.message || update.edited_message;
    if (!message?.text) return;
    if (!isAdmin(message.chat.id)) { await send(message.chat.id, '⛔ Bạn không có quyền sử dụng bot này.'); return; }
    await handleMessage(message.chat.id, message.text, db);
  } catch (err) {
    console.error('Telegram webhook error:', err);
  }
};
