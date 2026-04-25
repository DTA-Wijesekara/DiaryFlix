# DiaryFLIX

> A personal cinema diary — log every film you watch, capture your mood, and rediscover your screening history.

**DiaryFLIX** is a full-stack web application that lets you keep a dated journal of every film or TV series you've ever watched. Record how you felt before and after, rate each entry, track rewatches, save favourite songs and quotes, and explore your habits through rich statistics — all behind a clean, editorial interface.

---

## Features

### Core Diary
- **Log a watch** — title, date, rating, platform, who you watched with, and occasion
- **Mood journey** — capture your mood before and after watching (stressed, happy, nostalgic, and more)
- **Rewatch tracking** — "Watch Again" creates a new diary entry with a fresh date and mood; the original entry's rewatch count updates automatically
- **Duplicate detection** — logging an already-watched film auto-increments the rewatch count instead of creating a duplicate
- **Edit entries** — update date, rating, mood, platform, notes, and more via an in-page modal
- **Favourite songs & quotes** — attach songs (with YouTube links) and memorable quotes to any entry

### Discovery & Insights
- **Statistics dashboard** — charts for watch count by month, industry breakdown, mood distribution, rating distribution, and total hours watched
- **Smart Rewatch** — surfaced recommendations for films worth revisiting
- **Calendar heatmap** — see your watch activity across the year at a glance
- **Library** — browse your full catalogue with filtering and search
- **Industry filter** — Bollywood, Hollywood, Kollywood, Mollywood, Tollywood, Sandalwood, Sinhala, and more

### Platform
- **TMDB integration** — search 900 000+ titles; cast, genres, runtime, and poster auto-filled
- **JWT authentication** — secure register / login with token expiry handling
- **Admin dashboard** — manage user accounts and roles
- **Landing page** — public-facing page at the root with sign-in CTA
- **Responsive design** — works on desktop, tablet, and mobile

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router v7, Vite 8 |
| Styling | Plain CSS with a custom design system (Fraunces + Inter + JetBrains Mono) |
| Charts | Chart.js 4, react-chartjs-2 |
| Icons | Lucide React |
| Backend | Node.js 18+, Express 5 |
| Auth | JSON Web Tokens (jsonwebtoken), bcryptjs |
| Database | Microsoft SQL Server (msnodesqlv8 on Windows · mssql/tedious on Linux/Docker) |
| Security | Helmet, express-rate-limit, CORS |
| Container | Docker, Docker Compose, nginx |

---

## Project Structure

```
diaryflix/
├── frontend/                   # React application
│   ├── src/
│   │   ├── components/         # Reusable UI (Sidebar, StarRating, MoodPicker, …)
│   │   ├── context/            # AuthContext
│   │   ├── pages/              # Route-level components
│   │   │   ├── Landing.jsx     # Public landing page
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Diary.jsx
│   │   │   ├── LogWatch.jsx    # Log / rewatch form
│   │   │   ├── MovieDetail.jsx # Entry detail + edit modal
│   │   │   ├── Library.jsx
│   │   │   ├── Statistics.jsx
│   │   │   ├── SmartRewatch.jsx
│   │   │   ├── Settings.jsx
│   │   │   └── AdminDashboard.jsx
│   │   └── services/           # API clients (auth, storage, tmdb, itunes)
│   ├── Dockerfile              # Multi-stage: Node build → nginx serve
│   └── nginx.conf              # SPA routing + /api proxy to backend
│
├── server/                     # Express API
│   ├── routes/
│   │   ├── auth.js             # /api/auth/*
│   │   ├── logs.js             # /api/logs/*
│   │   └── admin.js            # /api/admin/*
│   ├── db.js                   # SQL Server pool + schema migrations
│   ├── config.js               # Environment-driven configuration
│   ├── middleware.js            # Error handler, notFound
│   ├── server.js               # Express bootstrap
│   └── Dockerfile
│
├── docker-compose.yml          # SQL Server + backend + frontend
├── .env.example                # Environment variable template
└── README.md
```

---

## Getting Started (Local Development)

### Prerequisites

- **Node.js** 18 or later
- **SQL Server** (local instance or Docker) — see [Docker option](#docker) below
- A free **TMDB API key** from [themoviedb.org](https://www.themoviedb.org/settings/api) (optional — the app works without it but movie search will be disabled)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/diaryflix.git
cd diaryflix
```

### 2. Start the backend

```bash
cd server
npm install
```

Create `server/.env`:

```env
PORT=5000
DB_SERVER=localhost
DB_NAME=cinemadiary
DB_TRUSTED=true          # Windows Auth; set false and add DB_USER/DB_PASSWORD for SQL login
JWT_SECRET=your-secret-at-least-32-chars
CORS_ORIGIN=http://localhost:5173
CORS_CREDENTIALS=true
```

```bash
npm start
```

The server creates the database and all tables automatically on first boot.

### 3. Start the frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_TMDB_API_KEY=your_tmdb_key_here   # optional
```

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Environment Variables

### Backend (`server/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `5000` | HTTP port |
| `DB_SERVER` | Yes | `localhost` | SQL Server host |
| `DB_NAME` | No | `cinemadiary` | Database name |
| `DB_TRUSTED` | No | `true` | Use Windows Auth (`true`) or SQL login (`false`) |
| `DB_USER` | If not trusted | — | SQL Server username |
| `DB_PASSWORD` | If not trusted | — | SQL Server password |
| `JWT_SECRET` | Yes | — | Min 32 chars in production |
| `JWT_EXPIRES_IN` | No | `7d` | Token lifetime |
| `CORS_ORIGIN` | Yes | `*` in dev | Allowed frontend origin |
| `SEED_ADMIN` | No | `false` | Create an admin account on first boot |
| `SEED_ADMIN_EMAIL` | If seeding | — | Admin email |
| `SEED_ADMIN_PASSWORD` | If seeding | — | Admin password |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Backend API base URL |
| `VITE_TMDB_API_KEY` | No | TMDB v3 API key for movie search |

---

## Docker

Run the full stack — SQL Server, backend API, and frontend — with a single command.

### 1. Create the env file

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
DB_SA_PASSWORD=YourStrong@Password123
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=http://localhost
```

### 2. Start everything

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| App (frontend) | http://localhost |
| API | http://localhost/api |
| SQL Server | localhost:1433 |

The first boot takes about 30–60 seconds while SQL Server initialises. The backend waits for the database healthcheck before connecting.

### Stopping

```bash
docker compose down          # keep data
docker compose down -v       # also delete database volume
```

---

## Deployment

### Frontend → Vercel + Backend → Railway (recommended)

1. Push the repository to GitHub.
2. **Vercel** — import the repo, set the root directory to `frontend`, add `VITE_API_URL=https://your-backend.railway.app/api` as an environment variable, and deploy.
3. **Railway** — create a new project, point it at the `server/` folder, add all backend environment variables (use Railway's managed SQL Server or Azure SQL for the database), and deploy.
4. Update `CORS_ORIGIN` on the backend to match your Vercel domain.

### Full stack → Docker on a VPS

Copy the project to your server, fill in `.env`, and run:

```bash
docker compose up -d --build
```

Point your domain's DNS to the server and terminate TLS with a reverse proxy (nginx, Caddy, or Traefik) in front of port 80.

---

## API Overview

All routes are prefixed with `/api`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Create account |
| `POST` | `/auth/login` | Public | Sign in, returns JWT |
| `GET` | `/auth/me` | User | Current user profile |
| `PUT` | `/auth/me` | User | Update display name / avatar |
| `GET` | `/logs` | User | All diary entries |
| `POST` | `/logs` | User | Create entry |
| `PUT` | `/logs/:id` | User | Update entry |
| `DELETE` | `/logs/:id` | User | Delete entry |
| `PUT` | `/logs/:id/rewatch` | User | Increment rewatch count |
| `GET` | `/admin/users` | Admin | List all users |
| `PUT` | `/admin/users/:id/role` | Admin | Change user role |
| `DELETE` | `/admin/users/:id` | Admin | Delete user |
| `GET` | `/health` | Public | Health check |

---

## License

MIT © [Dasun Theekshana](https://github.com/your-username)
