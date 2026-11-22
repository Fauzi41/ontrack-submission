import { API_PORT } from '../config';
import { buildServer } from './server';

const app = buildServer();

app
  .listen({ port: API_PORT, host: '127.0.0.1' })
  .then((addr) => console.log(`OnTrack API  ${addr}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
