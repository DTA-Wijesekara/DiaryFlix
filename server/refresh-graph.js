const { query, closePool } = require('./db');
const { buildGraphFromDB } = require('./lib/graphBuilder');
async function refreshGraph() {
  await query('DELETE FROM rate_limit_buckets WHERE expires_at < NOW()');
  await query('DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used_at IS NOT NULL');
  const graph = await buildGraphFromDB(query);
  const edges = [];
  for (const [a, neighbors] of graph.adjacency) for (const { to: b, weight } of neighbors) if (a < b) edges.push([a,b,weight]);
  await query('INSERT INTO graph_snapshots(id,data) VALUES (1,@data::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,built_at=NOW()', { data: JSON.stringify({ nodes: [...graph.nodes], edges }) });
  console.error('Recommendation snapshot published');
}
if (require.main === module) refreshGraph().catch(e => { console.error(e.message); process.exitCode=1; }).finally(closePool);
module.exports = { refreshGraph };
