// DiaryFLIX — Server bootstrap.
// Works as a traditional Express server locally AND as a Vercel serverless function.

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { initDB, closePool } = require('./db');
const { errorHandler, notFound } = require('./middleware');

const authRoutes  = require('./routes/auth');
const logRoutes   = require('./routes/logs');
const adminRoutes = require('./routes/admin');

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
const corsOptions = config.cors.origins === '*'
  ? { origin: true, credentials: config.cors.credentials }
  : {
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (config.cors.origins.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: config.cors.credentials,
    };
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: config.bodyLimit }));

// Request log
app.use((req, _res, next) => {
  if (req.path !== '/health') {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  }
  next();
});

// Health check (no auth, no rate limit, no DB needed)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: config.env });
});

// ── DB initialisation ────────────────────────────────────────────────────────
// Start connecting immediately when the module loads.
// On Vercel this happens at cold start; locally it happens when the process starts.
const dbReady = initDB();

// All /api routes wait for the DB before proceeding.
app.use('/api', (req, res, next) => {
  dbReady
    .then(() => next())
    .catch(err => {
      console.error('[db] not ready:', err.message);
      res.status(503).json({ error: 'Service starting up — please retry in a moment' });
    });
});

// Rate limit
const apiLimiter = rateLimit({
  windowMs: config.rateLimits.api.windowMs,
  max:      config.rateLimits.api.max,
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth',  authRoutes);
app.use('/api/logs',  logRoutes);
app.use('/api/admin', adminRoutes);

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

// ── Local dev server ─────────────────────────────────────────────────────────
// On Vercel the module is imported directly; app.listen() must NOT be called.
if (!process.env.VERCEL) {
  dbReady
    .then(() => {
      const server = app.listen(config.port, config.host, () => {
        console.log(`DiaryFLIX API listening on http://${config.host}:${config.port}  [${config.env}]`);
      });

      const shutdown = async (signal) => {
        console.log(`\n${signal} received — shutting down.`);
        server.close(async (err) => {
          if (err) console.error('Error closing HTTP server:', err);
          await closePool();
          process.exit(err ? 1 : 0);
        });
        setTimeout(() => process.exit(1), 10_000).unref();
      };

      process.on('SIGINT',  () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch(err => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}

// Export for Vercel serverless
module.exports = app;
