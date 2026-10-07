const { changeUser } = require('../../lib/userAdministration');
const { query } = require('../../db');

const definitions = [
  {
    name: 'list_users',
    description: 'List DiaryFLIX users with log/wishlist counts. Filter by role or active status.',
    inputSchema: {
      type: 'object',
      properties: {
        limit:       { type: 'number',  description: 'Max results (default 50, max 200)' },
        role:        { type: 'string',  description: "Filter by role: 'user' or 'admin'" },
        active_only: { type: 'boolean', description: 'Only return active accounts' },
      },
    },
  },
  {
    name: 'get_user_detail',
    description: 'Full profile, stats, and recent activity for a single user. Provide id or email.',
    inputSchema: {
      type: 'object',
      properties: {
        id:    { type: 'string', description: 'User ID' },
        email: { type: 'string', description: 'User email' },
      },
    },
  },
  {
    name: 'deactivate_user',
    description: 'Deactivate a user account — prevents them from logging in',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'User ID to deactivate' },
      },
    },
  },
  {
    name: 'activate_user',
    description: 'Re-activate a previously deactivated user account',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'User ID to activate' },
      },
    },
  },
  {
    name: 'change_user_role',
    description: "Promote a user to admin or demote an admin to user",
    inputSchema: {
      type: 'object',
      required: ['id', 'role'],
      properties: {
        id:   { type: 'string', description: 'User ID' },
        role: { type: 'string', enum: ['user', 'admin'] },
      },
    },
  },
  {
    name: 'delete_user',
    description: 'Permanently delete a user and all their watch logs, movies, and wishlist entries',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'User ID to permanently delete' },
      },
    },
  },
];

const handlers = {
  async list_users({ limit = 50, role, active_only } = {}) {
    const cap = Math.min(Number(limit) || 50, 200);
    let sql = `
      SELECT
        u.id, u.email, u.display_name AS "displayName", u.role,
        u.is_active AS "isActive", u.created_at AS "createdAt", u.last_login AS "lastLogin",
        (SELECT COUNT(*)::INTEGER FROM watchlogs w WHERE w.user_id = u.id) AS "logsCount",
        (SELECT COUNT(*)::INTEGER FROM wishlist  w WHERE w.user_id = u.id) AS "wishlistCount"
      FROM users u
      WHERE 1=1
    `;
    const params = {};

    if (role)        { sql += ' AND u.role = @role';       params.role = role; }
    if (active_only) { sql += ' AND u.is_active = TRUE'; }

    sql += ' ORDER BY u.created_at DESC LIMIT @limit';
    params.limit = cap;

    const result = await query(sql, params);
    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  },

  async get_user_detail({ id, email } = {}) {
    if (!id && !email) {
      return { content: [{ type: 'text', text: 'Provide id or email' }], isError: true };
    }

    const userRes = await query(
      `SELECT id, email, display_name AS "displayName", role, avatar,
              is_active AS "isActive", created_at AS "createdAt",
              last_login AS "lastLogin", google_id IS NOT NULL AS "isGoogleAccount"
       FROM users WHERE ${id ? 'id = @id' : 'email = @email'}`,
      id ? { id } : { email }
    );

    if (userRes.rows.length === 0) {
      return { content: [{ type: 'text', text: 'User not found' }], isError: true };
    }
    const user = userRes.rows[0];

    const [statsRes, recentLogsRes] = await Promise.all([
      query(`
        SELECT
          COUNT(wl.id)::INTEGER                               AS total_watched,
          COALESCE(AVG(NULLIF(wl.rating, 0)::FLOAT), 0)      AS avg_rating,
          COALESCE(SUM(wl.watched_minutes), 0)::INTEGER                AS total_minutes,
          GREATEST(0, COUNT(wl.id) FILTER (WHERE m.type='movie') - COUNT(DISTINCT wl.movie_id) FILTER (WHERE m.type='movie'))::INTEGER AS rewatches,
          (SELECT COUNT(*)::INTEGER FROM wishlist WHERE user_id = @userId) AS wishlist_count
        FROM watchlogs wl
        LEFT JOIN movies m ON m.id = wl.movie_id
        WHERE wl.user_id = @userId
      `, { userId: user.id }),
      query(`
        SELECT wl.date_watched AS "dateWatched", wl.rating, wl.mood_after AS "moodAfter", m.title
        FROM watchlogs wl
        LEFT JOIN movies m ON m.id = wl.movie_id
        WHERE wl.user_id = @userId
        ORDER BY wl.created_at DESC
        LIMIT 5
      `, { userId: user.id }),
    ]);

    const s = statsRes.rows[0];
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...user,
          stats: {
            totalWatched:  s.total_watched,
            avgRating:     Number(s.avg_rating).toFixed(1),
            totalHours:    Math.round((s.total_minutes || 0) / 60),
            rewatches:     s.rewatches,
            wishlistCount: s.wishlist_count,
          },
          recentLogs: recentLogsRes.rows,
        }, null, 2),
      }],
    };
  },

  async deactivate_user({ id } = {}) { return result(await changeUser(id, { isActive: false })); },
  async activate_user({ id } = {}) { return result(await changeUser(id, { isActive: true })); },
  async change_user_role({ id, role } = {}) {
    if (!['user','admin'].includes(role)) throw new Error('Invalid role');
    return result(await changeUser(id, { role }));
  },
  async delete_user({ id } = {}) { return result(await changeUser(id, { remove: true })); },
};
function result(value) { return { content: [{ type: 'text', text: JSON.stringify(value) }] }; }
module.exports = { definitions, handlers };
