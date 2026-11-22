import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query } from './db.js';
import { requireAdmin } from './middleware.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});
const productSchema = z.object({
  name: z.string().trim().min(1).max(100), description: z.string().max(1000).optional().default(''),
  price: z.coerce.number().min(0), promo_price: z.union([z.coerce.number().min(0), z.literal(''), z.null()]).optional(),
  category_id: z.coerce.number().int().positive(),
  available: z.preprocess(v => v === true || v === 'true' || v === 1 || v === '1', z.boolean()).optional().default(true),
  featured: z.preprocess(v => v === true || v === 'true' || v === 1 || v === '1', z.boolean()).optional().default(false)
});
const categorySchema = z.object({
  name: z.string().trim().min(1).max(60), description: z.string().max(300).optional().default(''),
  sort_order: z.coerce.number().int().default(0),
  active: z.preprocess(v => v === true || v === 'true' || v === 1 || v === '1', z.boolean()).optional().default(true)
});
const settingKeys = ['name', 'tagline', 'description', 'phone', 'address', 'instagram', 'hours', 'logo', 'banner'];
const productSelect = `select p.*, c.name as category_name from public.products p join public.categories c on c.id = p.category_id`;
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function getSettings() {
  const { rows } = await query('select key, value from public.settings');
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

async function uploadImage(buffer) {
  const optimized = await sharp(buffer).rotate()
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer();
  const id = randomUUID();
  await query('insert into public.media_files(id, content_type, image_data) values($1,$2,$3)',
    [id, 'image/webp', optimized]);
  return `/api/public/images/${id}`;
}

router.get('/health', asyncRoute(async (_req, res) => {
  await query('select 1');
  res.json({ ok: true, database: 'connected' });
}));
router.get('/public/images/:id', asyncRoute(async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(400).end();
  const { rows } = await query('select content_type, image_data from public.media_files where id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).end();
  res.set('Content-Type', rows[0].content_type);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(rows[0].image_data);
}));
router.get('/auth/setup-status', asyncRoute(async (_req, res) => {
  const { rows } = await query('select count(*)::int as total from public.admins');
  res.json({ setupRequired: rows[0].total === 0 });
}));
router.post('/auth/setup', asyncRoute(async (req, res) => {
  const { name, email, password, setupToken } = req.body || {};
  const expectedEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!process.env.ADMIN_SETUP_TOKEN || !setupToken || setupToken !== process.env.ADMIN_SETUP_TOKEN) return res.status(403).json({ error: 'Código de configuração inválido.' });
  if (!name || String(email || '').trim().toLowerCase() !== expectedEmail) return res.status(400).json({ error: 'Use o e-mail de administrador configurado no projeto.' });
  if (String(password || '').length < 10) return res.status(400).json({ error: 'A senha precisa ter pelo menos 10 caracteres.' });
  const { rows: countRows } = await query('select count(*)::int as total from public.admins');
  if (countRows[0].total > 0) return res.status(409).json({ error: 'O administrador inicial já foi configurado.' });
  const hash = await bcrypt.hash(String(password), 12);
  const { rows } = await query('insert into public.admins(name,email,password_hash) values($1,$2,$3) returning id,name,email', [String(name).trim(), expectedEmail, hash]);
  req.session.adminId = rows[0].id;
  req.session.adminName = rows[0].name;
  res.status(201).json({ ok: true, admin: rows[0] });
}));
router.post('/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await query('select * from public.admins where email = $1', [String(email || '').trim().toLowerCase()]);
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(String(password || ''), admin.password_hash))) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  req.session.adminId = admin.id;
  req.session.adminName = admin.name;
  res.json({ id: admin.id, name: admin.name, email: admin.email });
}));
router.post('/auth/logout', (req, res) => req.session.destroy(() => { res.clearCookie('esquenta31.sid'); res.json({ ok: true }); }));
router.get('/auth/me', requireAdmin, (req, res) => res.json({ id: req.session.adminId, name: req.session.adminName }));
router.use('/admin', requireAdmin);

router.get('/public/menu', asyncRoute(async (_req, res) => {
  const settings = await getSettings();
  const [{ rows: categories }, { rows: products }] = await Promise.all([
    query('select * from public.categories where active = true order by sort_order, name'),
    query(`${productSelect} where p.available = true and c.active = true order by p.featured desc, p.name`)
  ]);
  res.json({ settings, categories, products });
}));
router.get('/admin/summary', asyncRoute(async (_req, res) => {
  const [{ rows: p }, { rows: c }] = await Promise.all([
    query('select count(*)::int as total, count(*) filter (where available = true)::int as active, count(*) filter (where available = false)::int as unavailable from public.products'),
    query('select count(*)::int as total from public.categories')
  ]);
  res.json({ products: p[0].total, active: p[0].active, unavailable: p[0].unavailable, categories: c[0].total });
}));
router.get('/admin/products', asyncRoute(async (_req, res) => {
  const { rows } = await query(`${productSelect} order by p.created_at desc`);
  res.json(rows);
}));
router.post('/admin/products', upload.single('image'), asyncRoute(async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const { rows: cats } = await query('select id from public.categories where id = $1', [d.category_id]);
  if (!cats.length) return res.status(400).json({ error: 'Categoria inválida.' });
  const image = req.file ? await uploadImage(req.file.buffer) : '';
  const { rows } = await query(`insert into public.products(name,description,price,promo_price,image,category_id,available,featured)
    values($1,$2,$3,$4,$5,$6,$7,$8) returning id`, [d.name, d.description, d.price, d.promo_price === '' || d.promo_price == null ? null : d.promo_price, image, d.category_id, d.available, d.featured]);
  res.status(201).json({ id: rows[0].id });
}));
router.put('/admin/products/:id', upload.single('image'), asyncRoute(async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const { rows: oldRows } = await query('select * from public.products where id = $1', [req.params.id]);
  if (!oldRows.length) return res.status(404).json({ error: 'Produto não encontrado.' });
  const image = req.file ? await uploadImage(req.file.buffer) : oldRows[0].image;
  await query(`update public.products set name=$1,description=$2,price=$3,promo_price=$4,image=$5,category_id=$6,available=$7,featured=$8,updated_at=now() where id=$9`,
    [d.name, d.description, d.price, d.promo_price === '' || d.promo_price == null ? null : d.promo_price, image, d.category_id, d.available, d.featured, req.params.id]);
  res.json({ ok: true });
}));
router.delete('/admin/products/:id', asyncRoute(async (req, res) => {
  const { rowCount } = await query('delete from public.products where id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json({ ok: true });
}));
router.get('/admin/categories', asyncRoute(async (_req, res) => {
  const { rows } = await query('select * from public.categories order by sort_order,name');
  res.json(rows);
}));
router.post('/admin/categories', asyncRoute(async (req, res) => {
  const p = categorySchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const d = p.data;
  const { rows } = await query('insert into public.categories(name,description,sort_order,active) values($1,$2,$3,$4) returning id', [d.name,d.description,d.sort_order,d.active]);
  res.status(201).json({ id: rows[0].id });
}));
router.put('/admin/categories/:id', asyncRoute(async (req, res) => {
  const p = categorySchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const d = p.data;
  const { rowCount } = await query('update public.categories set name=$1,description=$2,sort_order=$3,active=$4 where id=$5', [d.name,d.description,d.sort_order,d.active,req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ ok: true });
}));
router.delete('/admin/categories/:id', asyncRoute(async (req, res) => {
  const { rows } = await query('select count(*)::int as total from public.products where category_id=$1', [req.params.id]);
  if (rows[0].total) return res.status(409).json({ error: 'Esta categoria possui produtos. Mova ou remova os produtos antes de excluir.' });
  const result = await query('delete from public.categories where id=$1', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ ok: true });
}));
router.get('/admin/settings', asyncRoute(async (_req, res) => res.json(await getSettings())));
router.put('/admin/settings', asyncRoute(async (req, res) => {
  for (const key of settingKeys) if (req.body[key] !== undefined) await query('insert into public.settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value', [key, String(req.body[key]).slice(0, 2000)]);
  res.json(await getSettings());
}));
router.post('/admin/settings/image', upload.single('image'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecione uma imagem válida.' });
  const url = await uploadImage(req.file.buffer);
  res.json({ url });
}));

export default router;
