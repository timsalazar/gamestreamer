/**
 * Local dev server — wraps the Vercel API handlers in Express.
 * Run with: node server.js
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import livereload from 'livereload';
import connectLivereload from 'connect-livereload';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Live reload — watches /public and /api for changes
const lrServer = livereload.createServer();
lrServer.watch([path.join(__dirname, 'public'), path.join(__dirname, 'api'), path.join(__dirname, 'lib')]);
app.use(connectLivereload());

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Helper: adapt Vercel-style handlers to Express
function vercel(handler) {
  return async (req, res) => {
    // Merge path params into query so handlers can use req.query.id etc.
    req.query = { ...req.query, ...req.params };
    await handler(req, res);
  };
}

// Lazy-import handlers (so env vars are loaded first)
async function loadRoutes() {
  const { default: games }     = await import('./api/games.js');
  const { default: state }     = await import('./api/game/[id]/state.js');
  const { default: play }      = await import('./api/game/[id]/play.js');
  const { default: count }     = await import('./api/game/[id]/count.js');
  const { default: plays }     = await import('./api/game/[id]/plays.js');

  app.get ('/api/games',              vercel(games));
  app.post('/api/games',              vercel(games));

  app.get  ('/api/game/:id/state',    vercel(state));
  app.patch('/api/game/:id/state',    vercel(state));

  app.post  ('/api/game/:id/play',    vercel(play));
  app.delete('/api/game/:id/play',    vercel(play));

  app.patch ('/api/game/:id/count',   vercel(count));
  app.get   ('/api/game/:id/plays',   vercel(plays));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n⚾  GameStreamer running at http://localhost:${PORT}`);
    console.log(`   Scorer:  http://localhost:${PORT}/scorer.html`);
    console.log(`   Viewer:  http://localhost:${PORT}/viewer.html?game=GAMEID\n`);
  });
}

loadRoutes().catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
