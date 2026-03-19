# 🔑 KeyMaster — Hướng dẫn Deploy

Hệ thống quản lý API Key hoàn chỉnh: Node.js + Supabase + Telegram Bot + Vercel

## 📁 Cấu trúc Project

```
keymaster/
├── api/
│   ├── auth/
│   │   └── login.js          # POST /api/auth/login
│   ├── keys/
│   │   ├── check.js          # GET/POST /api/keys/check (public)
│   │   └── manage.js         # CRUD keys (admin)
│   ├── users/
│   │   └── manage.js         # CRUD users (admin)
│   ├── admin/
│   │   └── stats.js          # Dashboard stats
│   └── telegram/
│       └── webhook.js        # Telegram bot webhook
├── lib/
│   ├── supabase.js           # Supabase client
│   ├── auth.js               # JWT helpers
│   └── keyUtils.js           # Key generation helpers
├── public/
│   ├── index.html            # Landing page / API docs
│   └── admin.html            # Admin dashboard
├── supabase_schema.sql       # Database schema
├── vercel.json               # Vercel config
├── package.json
└── .env.example              # Environment variables template
```

---

## 🚀 Bước 1: Tạo Supabase Database

1. Đăng ký tài khoản tại [supabase.com](https://supabase.com)
2. Tạo project mới
3. Vào **SQL Editor** → chạy toàn bộ nội dung file `supabase_schema.sql`
4. Sau khi chạy, sẽ có:
   - Bảng `users`, `api_keys`, `key_logs`, `telegram_sessions`
   - Tài khoản admin mặc định: `admin` / `Admin@123`
5. Lấy thông tin kết nối:
   - Vào **Settings** → **API**
   - Copy **Project URL** → `SUPABASE_URL`
   - Copy **service_role** key → `SUPABASE_SERVICE_KEY`

---

## 🤖 Bước 2: Tạo Telegram Bot

1. Mở Telegram, tìm **@BotFather**
2. Gõ `/newbot`, đặt tên và username cho bot
3. BotFather sẽ trả về **Bot Token** → `TELEGRAM_BOT_TOKEN`
4. Lấy Chat ID của bạn:
   - Nhắn tin @userinfobot
   - Copy **Id** → `TELEGRAM_ADMIN_IDS`

---

## ☁️ Bước 3: Deploy lên Vercel

### Option A: Vercel CLI
```bash
npm install -g vercel
cd keymaster
vercel
```

### Option B: GitHub
1. Push code lên GitHub repository
2. Vào [vercel.com](https://vercel.com) → Import Project
3. Chọn repository → Deploy

### Thêm Environment Variables trên Vercel:
Vào **Project** → **Settings** → **Environment Variables**, thêm:
```
SUPABASE_URL          = https://xxxx.supabase.co
SUPABASE_SERVICE_KEY  = eyJhbGci...
JWT_SECRET            = your-random-secret-string
TELEGRAM_BOT_TOKEN    = 1234567890:ABCdef...
TELEGRAM_ADMIN_IDS    = 123456789
TELEGRAM_WEBHOOK_SECRET = optional-secret
```

---

## 🔗 Bước 4: Đăng ký Telegram Webhook

Sau khi deploy xong, chạy lệnh sau (thay `YOUR_DOMAIN` và `YOUR_BOT_TOKEN`):

```bash
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://YOUR_DOMAIN.vercel.app/api/telegram/webhook",
    "secret_token": "optional-secret-same-as-env"
  }'
```

---

## 📖 API Endpoints

### Public (không cần auth)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/keys/check?key=KM-xxx` | Kiểm tra key |
| POST | `/api/keys/check` | Kiểm tra key (body) |

### Admin (cần Bearer Token)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/auth/login` | Đăng nhập |
| GET | `/api/keys/manage` | Danh sách keys |
| POST | `/api/keys/manage` | Tạo key mới |
| PUT | `/api/keys/manage` | Cập nhật key |
| DELETE | `/api/keys/manage` | Xóa key |
| GET | `/api/users/manage` | Danh sách users |
| POST | `/api/users/manage` | Tạo user |
| PUT | `/api/users/manage` | Cập nhật user |
| DELETE | `/api/users/manage` | Xóa user |
| GET | `/api/admin/stats` | Thống kê dashboard |

---

## 🤖 Lệnh Telegram Bot

| Lệnh | Mô tả |
|------|-------|
| `/help` | Xem tất cả lệnh |
| `/addkey month 5 Premium` | Tạo 5 key gói tháng |
| `/addkey lifetime 1 VIP` | Tạo 1 key vĩnh viễn |
| `/checkkey KM-XXXX-...` | Kiểm tra key |
| `/listkeys 1` | Xem danh sách key trang 1 |
| `/delkey KM-XXXX-...` | Xóa key |
| `/togglekey KM-XXXX-...` | Bật/tắt key |

---

## 🗂️ Plans & Thời hạn

| Plan | Thời hạn |
|------|----------|
| `trial` | 3 ngày |
| `day` | 1 ngày |
| `week` | 7 ngày |
| `month` | 30 ngày |
| `year` | 365 ngày |
| `lifetime` | Vĩnh viễn |

---

## 🔐 Thông tin mặc định

- **Admin URL**: `https://your-domain.vercel.app/admin`
- **Username**: `admin`
- **Password**: `Admin@123`

> ⚠️ **Đổi password ngay sau khi deploy!** Dùng Admin UI hoặc API PUT /api/users/manage

---

## 💡 Tích hợp vào app của bạn

```javascript
// Kiểm tra key trước khi cho phép truy cập
async function validateApiKey(key) {
  const res = await fetch(`https://your-domain.vercel.app/api/keys/check?key=${key}`);
  const data = await res.json();
  return data.valid === true;
}

// Trong middleware của bạn
app.use(async (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || !(await validateApiKey(key))) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
});
```
