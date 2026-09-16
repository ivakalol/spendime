import http from 'node:http';

const host = process.env.HOSTNAME ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Spendime</title>
  </head>
  <body>
    <main>
      <h1>Spendime</h1>
      <p>Infrastructure is ready. The application UI will be added in a later step.</p>
    </main>
  </body>
</html>`);
});

server.listen(port, host, () => {
  console.log(`Spendime placeholder listening on http://${host}:${port}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received; shutting down.`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
