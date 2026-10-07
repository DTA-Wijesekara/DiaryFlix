const { query } = require('../db');
const { RecommendationGraph } = require('./recommendationGraph');
const { setGraph } = require('./graphStore');
let loadedVersion = null;
async function loadSnapshot() {
  const { rows } = await query('SELECT data, built_at, built_at::text AS version FROM graph_snapshots WHERE id=1');
  const row = rows[0];
  if (!row || row.version === loadedVersion) return;
  const graph = new RecommendationGraph();
  for (const [id, meta] of row.data.nodes) graph.addNode(id, meta);
  for (const [a, b, weight] of row.data.edges) graph.addEdge(a, b, weight);
  setGraph(graph, row.built_at);
  loadedVersion = row.version;
}
module.exports = { loadSnapshot };
