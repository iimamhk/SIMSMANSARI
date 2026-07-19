import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, validateServerConfig } from './config/env.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { aiRouter } from './routes/ai.routes.js';
import { authRouter } from './routes/auth.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root proyek (satu level di atas folder dist/server saat build, atau src/server saat dev).
const projectRoot = path.resolve(__dirname, '..', '..');
// Folder statis frontend berada di <root>/src (index.html di sana).
const frontendDir = path.resolve(projectRoot, 'src');

const app = express();

// ---- Keamanan & CORS ----
const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    const requestOrigin = origin ?? '';
    if (!env.allowedOrigins.length) {
      // Mode pengembangan: izinkan semua.
      callback(null, true);
      return;
    }
    if (!requestOrigin || env.allowedOrigins.includes(requestOrigin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin tidak diizinkan'), false);
  },
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

// Batasi ukuran body untuk mencegah abuse.
app.use(express.json({ limit: '64kb' }));

app.disable('x-powered-by');

// ---- Health check ----
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    configured: Boolean(env.apiKey) && env.apiKey !== 'sk-xxxxxxxxxxxxxxxx',
    model: env.model,
    time: new Date().toISOString(),
  });
});

// ---- API AI (dilindungi rate limiter) ----
const aiRateLimiter = createRateLimiter(env.rateLimitMax, env.rateLimitWindowMs);
app.use('/api/ai', aiRateLimiter, aiRouter);
app.use('/api/auth', authRouter);

// ---- Frontend statis ----
app.use(express.static(frontendDir, { extensions: ['html'] }));

// Fallback ke index.html (aplikasi menggunakan hash routing).
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// ---- Penanganan error terpusat ----
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Kesalahan server tidak diketahui.';
  const status = typeof err === 'object' && err !== null && 'statusCode' in err
    ? Number((err as { statusCode?: number }).statusCode) || 500
    : 500;
  if (!res.headersSent) {
    res.status(status).json({ error: message, code: 'server_error' });
  } else {
    res.end();
  }
});

// ---- Validasi konfigurasi saat startup ----
const configErrors = validateServerConfig();
if (configErrors.length) {
  console.warn('\n[PERINGATAN] Konfigurasi server belum lengkap:');
  configErrors.forEach((err) => console.warn(`  - ${err}`));
  console.warn('  Edit file server/.env sebelum menggunakan fitur AI.\n');
}

app.listen(env.port, () => {
  console.log(`\nSIM SMANSARI server berjalan di http://localhost:${env.port}`);
  console.log(`  API AI:   POST http://localhost:${env.port}/api/ai/generate-material`);
  console.log(`  Frontend: http://localhost:${env.port}/\n`);
});
