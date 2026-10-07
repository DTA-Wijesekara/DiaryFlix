const { query, transaction } = require('../db');
const { HttpError } = require('../middleware');
const MAX_ADMINS = 3;
async function changeUser(id, change, actor = null) {
  if (!id || typeof id !== 'string') throw new HttpError(400, 'User ID is required');
  if (change.role !== undefined && !['admin','user'].includes(change.role)) throw new HttpError(400, 'Invalid role');
  if (change.isActive !== undefined && typeof change.isActive !== 'boolean') throw new HttpError(400, 'isActive must be a boolean');
  return transaction(async () => {
    // Serialize administrative mutations, including the local MCP interface.
    await query('SELECT pg_advisory_xact_lock(734922)');
    if (actor) {
      const current = (await query('SELECT * FROM users WHERE id=@id FOR UPDATE', { id: actor.id })).rows[0];
      if (!current || !current.is_active || !current.email_verified_at || current.role !== 'admin' || current.auth_version !== actor.version) throw new HttpError(403, 'Admin access required');
      if (id === actor.id && (change.remove || change.isActive === false)) throw new HttpError(400, 'You cannot deactivate or delete your own account');
    }
    const user = (await query('SELECT * FROM users WHERE id=@id FOR UPDATE', { id })).rows[0];
    if (!user) throw new HttpError(404, 'User not found');
    if (change.role === 'admin' && user.role !== 'admin') {
      if (!user.email_verified_at) throw new HttpError(400, 'Verify the account email before promoting it to admin');
      const count = (await query("SELECT COUNT(*)::int AS cnt FROM users WHERE role='admin'")).rows[0].cnt;
      if (count >= MAX_ADMINS) throw new HttpError(409, 'Only 3 admin accounts are allowed. Demote an existing admin first.', 'ADMIN_LIMIT_REACHED');
    }
    if (user.role === 'admin' && user.is_active && (change.remove || change.role === 'user' || change.isActive === false)) {
      const count = (await query("SELECT COUNT(*)::int AS cnt FROM users WHERE role='admin' AND is_active=TRUE")).rows[0].cnt;
      if (count <= 1) throw new HttpError(400, 'Cannot remove the last active admin');
      if (user.email_verified_at) {
        const verified = (await query("SELECT COUNT(*)::int AS cnt FROM users WHERE role='admin' AND is_active=TRUE AND email_verified_at IS NOT NULL")).rows[0].cnt;
        if (verified <= 1) throw new HttpError(400, 'Cannot remove the last verified active admin');
      }
    }
    if (change.remove) await query('DELETE FROM users WHERE id=@id', { id });
    else await query('UPDATE users SET role=@role, is_active=@active, auth_version=auth_version+1 WHERE id=@id', { id, role: change.role ?? user.role, active: change.isActive ?? user.is_active });
    return { success: true };
  });
}
module.exports = { changeUser, MAX_ADMINS };
