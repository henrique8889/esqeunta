export function requireAdmin(req, res, next) {
  if (!req.session?.adminId) return res.status(401).json({ error: 'Faça login para continuar.' });
  next();
}
