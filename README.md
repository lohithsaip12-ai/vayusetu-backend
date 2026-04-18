# ✈️ VayuSetu — Flight Reservation System
## Backend Setup Guide

---

## 📁 Project Structure

```
vayusetu-backend/
├── server.js                     ← Main Express server (entry point)
├── package.json
├── .env.example                  ← Copy this to .env and fill your DB password
├── config/
│   └── db.js                     ← MySQL connection pool
├── middleware/
│   └── auth.js                   ← JWT authentication middleware
├── routes/
│   ├── auth.js                   ← POST /api/auth/register  &  /api/auth/login
│   ├── flights.js                ← GET  /api/flights/search, /airports, /fare-classes, /:id/seats
│   ├── bookings.js               ← POST/GET/DELETE /api/bookings
│   └── users.js                  ← GET /api/users/me
└── VayuSetu_FlightReservation.html  ← Frontend (API-connected, no design changes)
```

---

## ⚙️ Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| MySQL | 8.0+ |
| npm | 9+ |

---

## 🚀 Setup Steps

### Step 1 — Import the Database
Open MySQL Workbench or the terminal and run your schema file:
```bash
mysql -u root -p < SourceCode_FlightResgistration.txt
```

### Step 2 — Install Backend Dependencies
```bash
cd vayusetu-backend
npm install
```

### Step 3 — Configure Environment
```bash
cp .env.example .env
```
Open `.env` and fill in:
```
DB_PASSWORD=your_actual_mysql_password
JWT_SECRET=any_long_random_secret_string
```

### Step 4 — Start the Backend Server
```bash
npm start
# or for auto-restart during development:
npm run dev
```

You should see:
```
✅  MySQL connected → FlightReservation_DbMs
🚀  VayuSetu API running on http://localhost:5000
```

### Step 5 — Open the Frontend
Simply open `VayuSetu_FlightReservation.html` in your browser.
> ⚠️ The browser must be able to reach `http://localhost:5000`. Keep the terminal with the server running.

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | ❌ | Register new user |
| POST | `/api/auth/login` | ❌ | Login, returns JWT |
| GET | `/api/users/me` | ✅ | Get logged-in user profile |
| GET | `/api/flights/airports` | ❌ | List all airports |
| GET | `/api/flights/categories` | ❌ | List passenger categories |
| GET | `/api/flights/fare-classes` | ❌ | Economy / Business classes |
| GET | `/api/flights/search` | ❌ | Search flights (`?from=DEL&to=BOM&date=2025-06-01&class_id=1`) |
| GET | `/api/flights/:id/seats` | ❌ | Get live seat map for a flight |
| POST | `/api/bookings` | ✅ | Create booking (calls `sp_create_booking`) |
| GET | `/api/bookings/my` | ✅ | Get all bookings for logged-in user |
| GET | `/api/bookings/pnr/:pnr` | ❌ | PNR lookup (calls `sp_get_booking_details`) |
| DELETE | `/api/bookings/:id` | ✅ | Cancel booking (calls `sp_cancel_booking`) |
| GET | `/api/health` | ❌ | Server health check |

✅ = Requires `Authorization: Bearer <token>` header

---

## 🔐 How Authentication Works

1. User registers or logs in → backend returns a **JWT token**
2. Frontend stores token in `localStorage` as `vs_token`
3. Every protected API call sends `Authorization: Bearer <token>`
4. On page refresh, the frontend auto-restores the session via `/api/users/me`

---

## 🗄️ Stored Procedures Used

| Procedure | Called by |
|-----------|-----------|
| `sp_create_booking` | `POST /api/bookings` |
| `sp_cancel_booking` | `DELETE /api/bookings/:id` |
| `sp_get_booking_details` | `GET /api/bookings/pnr/:pnr` |

---

## 🧪 Test Login (from your seed data)
```
Email:    rahul@example.com
Password: (use the password that generated the bcrypt hash in your SQL file)
```
Or simply register a new account from the frontend.

---

## ❗ Troubleshooting

| Problem | Solution |
|---------|----------|
| `MySQL connection failed` | Check DB_PASSWORD in `.env`; make sure MySQL is running |
| `CORS error` in browser | Make sure the server is running on port 5000 |
| `Invalid password hash` error on register | This means `bcrypt.hash()` produced < 60 chars — should not happen with bcryptjs |
| Flight search returns 0 results | Check that your DB has future-dated flights (the seed uses `DATE_ADD(NOW(), INTERVAL N DAY)`) |
| Seat map shows "Could not load seats" | Run `sp_generate_seats_for_flight` for those flight IDs in MySQL |
