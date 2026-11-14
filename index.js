const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const MAX_STRESS_MS = 5000;

app.disable('x-powered-by');

// Prevent browsers from MIME-sniffing responses into something executable
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'pass' });
});

// Burns CPU for a bounded amount of time, used to demo the HPA
app.get('/stress', (req, res) => {
  const requested = parseInt(req.query.ms, 10);
  const ms = Number.isNaN(requested)
    ? 200
    : Math.min(Math.max(requested, 0), MAX_STRESS_MS);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    Math.sqrt(Math.random() * Math.random()); // busy loop
  }
  res.type('text/plain').send(`burned CPU for ${ms}ms`);
});

app.get('/hello', (req, res) => {
  const name = req.query.name || 'World';
  // text/plain so user input is never rendered as HTML (prevents reflected XSS)
  res.type('text/plain').send(`Hello, ${name}!`);
});

if (require.main === module) {
  const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  // Graceful shutdown: Kubernetes sends SIGTERM before killing the pod.
  // Node running as PID 1 ignores it unless handled explicitly.
  const shutdown = (signal) => {
    console.log(`${signal} received, closing server...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
