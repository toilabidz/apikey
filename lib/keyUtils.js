const crypto = require('crypto');
const dayjs = require('dayjs');

const PLAN_DAYS = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
  lifetime: null,
  trial: 3
};

function generateKey(prefix = 'KM') {
  const rand = crypto.randomBytes(18).toString('hex').toUpperCase();
  // Format: KM-XXXX-XXXX-XXXX-XXXX-XXXX
  const parts = rand.match(/.{1,6}/g).slice(0, 4);
  return `${prefix}-${parts.join('-')}`;
}

function getExpiry(plan) {
  const days = PLAN_DAYS[plan];
  if (days === null) return null; // lifetime
  return dayjs().add(days, 'day').toISOString();
}

function isKeyExpired(expiresAt) {
  if (!expiresAt) return false; // lifetime
  return dayjs().isAfter(dayjs(expiresAt));
}

function getPlanLabel(plan) {
  const labels = {
    day: '1 Ngày',
    week: '7 Ngày',
    month: '30 Ngày',
    year: '365 Ngày',
    lifetime: 'Vĩnh Viễn',
    trial: 'Dùng Thử (3 ngày)'
  };
  return labels[plan] || plan;
}

module.exports = { generateKey, getExpiry, isKeyExpired, getPlanLabel, PLAN_DAYS };
