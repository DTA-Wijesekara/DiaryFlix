// CineLog — Server bootstrap.
// Configures security headers, CORS, body parsing, rate limits, and mounts route modules.

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { initDB, closePool } = require('./db');
const { errorHandler, notFound } = require('./middleware');

const authRoutes = require('./routes/auth');
const logRoutes = require('./routes/logs');
const adminRoutes = require('./routes/admin');

const app = express();

// Security headers — helmet defaults are sensible.
app.use(helmet({
  // API doesn't serve HTML, so the default CSP isn't a concern here.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
const corsOptions = config.cors.origins === '*'
  ? { origin: true, credentials: config.cors.credentials }
  : {
      origin(origin, cb) {
        if (!origin) return cb(null, true); // allow tools like curl
        if (config.cors.origins.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: config.cors.credentials,
    };
app.use(cors(corsOptions));

// Body parsing with a size cap
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: config.bodyLimit }));

// Minimal request log (skip health checks)
app.use((req, _res, next) => {
  if (req.path !== '/health') {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  }
  next();
});

// Health check — no auth, no rate limit
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: config.env });
});

// General API rate limit (applied after health check so monitors aren't throttled)
const apiLimiter = rateLimit({
  windowMs: config.rateLimits.api.windowMs,
  max: config.rateLimits.api.max,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/admin', adminRoutes);

// 404 + error handler (must be last)
app.use(notFound);
app.use(errorHandler);

// ---- Boot ----

async function start() {
  await initDB();

  const server = app.listen(config.port, config.host, () => {
    console.log(`CineLog API listening on http://${config.host}:${config.port}  [${config.env}]`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down.`);
    server.close(async (err) => {
      if (err) console.error('Error closing HTTP server:', err);
      await closePool();
      process.exit(err ? 1 : 0);
    });
    // Hard-exit fallback
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (err) => {
    console.error('Unhandled promise rejection:', err);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    // Best-effort: close the HTTP server then exit.
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
