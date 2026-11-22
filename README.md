# ESQUENTA 31 — Cardápio Virtual

Aplicação responsiva de cardápio e painel administrativo.

## Arquitetura
- Vercel: hospedagem do front-end e API Express serverless.
- Supabase PostgreSQL: produtos, categorias, configurações, administradores e sessões.
- Supabase Storage: imagens públicas do cardápio.

## Variáveis de ambiente
- `POSTGRES_URL`: Transaction Pooler do Supabase.
- `SESSION_SECRET`: segredo aleatório com pelo menos 32 caracteres.
- `ADMIN_EMAIL`: e-mail do administrador inicial.
- `ADMIN_NAME`: nome exibido do estabelecimento.
- `ADMIN_SETUP_TOKEN`: código temporário para criar o primeiro administrador.
- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_SECRET_KEY`: chave secreta do Supabase, usada somente no servidor para enviar imagens.

## Configuração inicial
1. Configure todas as variáveis na Vercel para Production, Preview e Development.
2. Acesse `/admin/setup` e crie a senha do administrador usando o código `ADMIN_SETUP_TOKEN`.
3. Após a criação, entre em `/admin/login`.

Nunca coloque `SUPABASE_SECRET_KEY` em arquivos públicos, HTML ou variáveis `NEXT_PUBLIC_*`.
