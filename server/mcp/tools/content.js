const { query } = require('../../db');

const definitions = [
  {
    name: 'get_recent_logs',
    description: 'Most recent watch logs across all users, with movie title and user info',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of logs (default 20, max 100)' },
      },
    },
  },
  {
    name: 'search_logs',
    description: 'Search watch logs by movie title, user email, minimum rating, or mood',
    inputSchema: {
      type: 'object',
      properties: {
        title:      { type: 'string', description: 'Movie title (partial match)' },
        user_email: { type: 'string', description: 'Filter by user email (partial match)' },
        min_rating: { type: 'number', description: 'Minimum rating 1–10' },
        mood_after: { type: 'string', description: 'Mood after watching (exact)' },
        limit:      { type: 'number', description: 'Max results (default 20, max 100)' },
      },
    },
  },
  {
    name: 'get_top_wishlisted',
    description: 'Most wishlisted movies across all users',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of results (default 10, max 50)' },
      },
    },
  },
  {
    name: 'get_mood_stats',
    description: 'Most common moods before and after watching across the platform',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_platform_breakdown',
    description: 'Watch log counts grouped by streaming platform (Netflix, Disney+, etc.)',
    inputSchema: { type: 'object', properties: {} },
  },
];

const handlers = {
  async get_recent_logs({ limit = 20 } = {}) {
    const cap = Math.min(Number(limit) || 20, 100);
    const result = await query(`
      SELECT
        wl.id,
        wl.date_watched  AS "dateWatched",
        wl.rating,
        wl.mood_before   AS "moodBefore",
        wl.mood_after    AS "moodAfter",
        wl.platform,
        wl.created_at    AS "createdAt",
        m.title, m.type, m.year,
        u.email          AS "userEmail",
        u.display_name   AS "userName"
      FROM watchlogs wl
      LEFT JOIN movies m ON m.id = wl.movie_id
      LEFT JOIN users  u ON u.id = wl.user_id
      ORDER BY wl.created_at DESC
      LIMIT @limit
    `, { limit: cap });

    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  },

  async search_logs({ title, user_email, min_rating, mood_after, limit = 20 } = {}) {
    const cap = Math.min(Number(limit) || 20, 100);
    let sql = `
      SELECT
        wl.id,
        wl.date_watched  AS "dateWatched",
        wl.rating,
        wl.mood_before   AS "moodBefore",
        wl.mood_after    AS "moodAfter",
        wl.platform,
        wl.notes,
        wl.created_at    AS "createdAt",
        m.title, m.type, m.year,
        u.email          AS "userEmail",
        u.display_name   AS "userName"
      FROM watchlogs wl
      LEFT JOIN movies m ON m.id = wl.movie_id
      LEFT JOIN users  u ON u.id = wl.user_id
      WHERE 1=1
    `;
    const params = {};

    if (title)      { sql += ' AND LOWER(m.title) LIKE @title';           params.title     = `%${title.toLowerCase()}%`; }
    if (user_email) { sql += ' AND LOWER(u.email) LIKE @email';           params.email     = `%${user_email.toLowerCase()}%`; }
    if (min_rating) { sql += ' AND wl.rating >= @minRating';              params.minRating = Number(min_rating); }
    if (mood_after) { sql += ' AND LOWER(wl.mood_after) = @moodAfter';   params.moodAfter = mood_after.toLowerCase(); }

    sql += ' ORDER BY wl.created_at DESC LIMIT @limit';
    params.limit = cap;

    const result = await query(sql, params);
    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  },

  async get_top_wishlisted({ limit = 10 } = {}) {
    const cap = Math.min(Number(limit) || 10, 50);
    const result = await query(`
      SELECT
        title, type, year, industry,
        COUNT(*)::INTEGER              AS wishlist_count,
        COUNT(DISTINCT user_id)::INTEGER AS unique_users
      FROM wishlist
      GROUP BY title, type, year, industry
      ORDER BY wishlist_count DESC
      LIMIT @limit
    `, { limit: cap });
    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  },

  async get_mood_stats() {
    const [beforeRes, afterRes] = await Promise.all([
      query(`
        SELECT mood_before AS mood, COUNT(*)::INTEGER AS count
        FROM watchlogs
        WHERE mood_before IS NOT NULL AND mood_before <> ''
        GROUP BY mood_before ORDER BY count DESC LIMIT 10
      `),
      query(`
        SELECT mood_after AS mood, COUNT(*)::INTEGER AS count
        FROM watchlogs
        WHERE mood_after IS NOT NULL AND mood_after <> ''
        GROUP BY mood_after ORDER BY count DESC LIMIT 10
      `),
    ]);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ moodBefore: beforeRes.rows, moodAfter: afterRes.rows }, null, 2),
      }],
    };
  },

  async get_platform_breakdown() {
    const result = await query(`
      SELECT
        COALESCE(NULLIF(platform, ''), 'Unknown') AS platform,
        COUNT(*)::INTEGER                          AS log_count,
        COUNT(DISTINCT user_id)::INTEGER           AS unique_users
      FROM watchlogs
      GROUP BY platform
      ORDER BY log_count DESC
    `);
    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  },
};

module.exports = { definitions, handlers };
