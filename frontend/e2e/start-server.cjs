const path = require('path');
module.exports = async function startServer() {
  Object.assign(process.env, { VITE_API_URL:'http://127.0.0.1:5000/api', VITE_POSTHOG_KEY:'', VITE_GOOGLE_CLIENT_ID:'', VITE_TMDB_API_KEY:'' });
  const { createServer } = await import('vite');
  const server = await createServer({ root:path.resolve(__dirname,'..'), server:{ host:'127.0.0.1',port:5179,strictPort:true } });
  await server.listen();
  return async () => { await server.close(); };
};
