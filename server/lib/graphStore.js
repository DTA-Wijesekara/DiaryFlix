// DiaryFLIX — Graph Store
// Holds the single shared RecommendationGraph instance in module scope so the
// server (which builds it on startup) and the route (which queries it) share
// the same object. Rebuilt periodically as new watch logs arrive.

let graph = null;
let lastBuiltAt = null;

function setGraph(g, builtAt = new Date()) {
  graph = g;
  lastBuiltAt = builtAt;
}

function getGraph() {
  return graph;
}

function getLastBuiltAt() {
  return lastBuiltAt;
}

module.exports = { setGraph, getGraph, getLastBuiltAt };
