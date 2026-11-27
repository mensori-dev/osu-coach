import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

const server = await createServer();
await server.listen();

const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173';
console.log('\n  renderer  ' + url + '\n');

const child = spawn(electron, ['--remote-debugging-port=9223', '.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

child.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
