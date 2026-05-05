const { query } = require('../../db');

const definitions = [
  {
    name: 'get_platform_stats',
    description: 'Overall DiaryFLIX platform stats: total users, logs, wishlists, and signup counts for last 7 and 30 days',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_top_movies',
    description: 'Most logged movies across all users, with average rating and unique viewer count',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of results (default 10, max 50)' },
      },
    },
  },
  {
    name: 'get_rating_distribution',
    description: 'How ratings are distributed across all watch logs (1–10)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_signup_trend',
    description: 'Daily user signups for the last N days',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days to look back (default 30, max 90)' },
      },
    },
  },
  {
    name: 'get_industry_breakdown',
    description: 'Watch log counts grouped by movie industry (Hollywood, Bollywood, etc.)',
    inputSchema: { type: 'object', properties: {} },
  },
];

const handlers = {
  async get_platform_stats() {
    const [usersRes, logsRes, wishlistRes, weekRes, monthRes] = await Promise.all([
      query(`SELECT COUNT(*)::INTEGER AS total,
               SUM(CASE WHEN is_active THEN 1 ELSE 0 END)::INTEGER AS active
             FROM users WHERE role = 'user'`),
      query('SELECT COUNT(*)::INTEGER AS total FROM watchlogs'),
      query('SELECT COUNT(*)::INTEGER AS total FROM wishlist'),
      query(`SELECT COUNT(*)::INTEGER AS total FROM users
             WHERE role = 'user' AND created_at >= NOW() - INTERVAL '7 days'`),
      query(`SELECT COUNT(*)::INTEGER AS total FROM users
             WHERE role = 'user' AND created_at >= NOW() - INTERVAL '30 days'`),
    ]);

    const stats = {
      users:    { total: usersRes.rows[0].total, active: usersRes.rows[0].active },
      logs:     { total: logsRes.rows[0].total },
      wishlist: { total: wishlistRes.rows[0].total },
      signups:  { last7Days: weekRes.rows[0].total, last30Days: monthRes.rows[0].total },
    };

    return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
  },

  async get_top_movies({ limit = 10 } = {}) {
    const cap = Math.min(Number(limit) || 10, 50);
    const result = await query(`
      SELECT
        m.title, m.type, m.year, m.industry,
        COUNT(wl.id)::INTEGER                                   AS log_count,
        ROUND(AVG(NULLIF(wl.rating, 0))::NUMERIC, 1)           AS avg_rating,
        COUNT(DISTINCT wl.user_id)::INTEGER                     AS unique_users
      FROM watchlogs wl
      JOIN movies m ON m.id = wl.movie_id
      GROUP BY m.id, m.title, m.type, m.year, m.industry
      ORDER BY log_count DESC
      LIMIT @limit
    `, { limit: cap });

    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  },

  async get_rating_distribution() {
    const result = await query(`
      SELECT rating, COUNT(*)::INTEGER AS count
      FROM watchlogs
      WHERE rating > 0
      GROUP BY rating
      ORDER BY rating
    `);
    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  },

  async get_signup_trend({ days = 30 } = {}) {
    const cap = Math.min(Number(days) || 30, 90);
    const result = await query(`
      SELECT DATE(created_at) AS date, COUNT(*)::INTEGER AS signups
      FROM users
      WHERE created_at >= NOW() - (@days || ' days')::INTERVAL
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, { days: cap });
    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  },

  async get_industry_breakdown() {
    const result = await query(`
      SELECT
        COALESCE(m.industry, 'Unknown') AS industry,
        COUNT(wl.id)::INTEGER           AS log_count,
        COUNT(DISTINCT wl.user_id)::INTEGER AS unique_users
      FROM watchlogs wl
      JOIN movies m ON m.id = wl.movie_id
      GROUP BY m.industry
      ORDER BY log_count DESC
    `);
    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  },
};

module.exports = { definitions, handlers };
