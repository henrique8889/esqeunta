import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import { Pool } from 'pg';
import api from '../src/routes.js';

const app = express();
const PgStore = connectPgSimple(session);
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new PgStore({ pool, tableName: 'user_sessions', createTableIfMissing: false, pruneSessionInterval: 15 * 60 }),
  name: 'esquenta31.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 1000 * 60 * 60 * 8 }
}));
app.use('/api', api);
app.get('/api/health', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true, database: 'connected' }); }
  catch (error) { console.error('Database health check failed:', error); res.status(503).json({ ok: false, database: 'disconnected' }); }
});
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor.' });
});

export default app;
