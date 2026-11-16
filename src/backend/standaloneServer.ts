import path from 'node:path';
import { createBackendServer } from './apiServer';

async function main() {
  const distDir = path.resolve(__dirname, '../../dist');
  const instance = await createBackendServer(4741, distDir);
  console.log(
    `[Open MusicFlow Studio] Backend API & Audio Server listening on http://127.0.0.1:${instance.apiPort}`
  );
  console.log(
    `[Open MusicFlow Studio] Virtual LG Soundbar TCP 9741 Simulator listening on 127.0.0.1:${instance.mockSoundbarPort}`
  );
}

main().catch((err) => {
  console.error('Failed to start Open MusicFlow server:', err);
  process.exit(1);
});
