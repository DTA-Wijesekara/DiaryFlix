const { Socket } = require('node:net');

// pg still receives the DNS hostname, preserving TLS SNI and hostname checks.
// Only TCP address selection changes; no IP is pinned and no query is retried.
function createDatabaseStream(family) {
  if (![4, 6].includes(family)) throw new Error('DB_IP_FAMILY must be 4 or 6');
  return () => new class extends Socket {
    connect(port, host) {
      return super.connect({ port, host, family });
    }
  }();
}

module.exports = { createDatabaseStream };
