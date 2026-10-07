const { query } = require('../db');
class PostgresRateStore {
  constructor(namespace) { this.namespace = namespace; this.localKeys = false; }
  init(options) { this.windowMs = options.windowMs; }
  async increment(key) {
    const { rows } = await query(
      "INSERT INTO rate_limit_buckets(namespace,key,hits,expires_at) VALUES (@namespace,@key,1,NOW()+@windowMs * INTERVAL '1 millisecond') ON CONFLICT(namespace,key) DO UPDATE SET hits=CASE WHEN rate_limit_buckets.expires_at <= NOW() THEN 1 ELSE rate_limit_buckets.hits+1 END, expires_at=CASE WHEN rate_limit_buckets.expires_at <= NOW() THEN EXCLUDED.expires_at ELSE rate_limit_buckets.expires_at END RETURNING hits,expires_at",
      { namespace: this.namespace, key, windowMs: this.windowMs });
    return { totalHits: rows[0].hits, resetTime: rows[0].expires_at };
  }
  async decrement(key) { await query('UPDATE rate_limit_buckets SET hits=GREATEST(0,hits-1) WHERE namespace=@namespace AND key=@key', { namespace: this.namespace, key }); }
  async resetKey(key) { await query('DELETE FROM rate_limit_buckets WHERE namespace=@namespace AND key=@key', { namespace: this.namespace, key }); }
}
module.exports = { PostgresRateStore };
