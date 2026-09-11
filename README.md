# Construtora GS

Sistema de ponto e diárias da Construtora GS, de Gilberto Sucegan, em Next.js, preparado para executar na Vercel com dados persistidos no Supabase.

## Configurar o Supabase

1. Crie um projeto no Supabase.
2. No **SQL Editor**, execute o arquivo `supabase/migrations/20260911153649_initial_schema.sql`.
3. Se quiser importar os três profissionais e os seis registros do `obra.db` original, execute também `supabase/seed.sql`.
4. A migration `supabase/migrations/20260911170000_improvements.sql` cria o histórico de alterações e impede nomes duplicados entre funcionários ativos.
5. Execute também `supabase/migrations/20260911180000_financeiro.sql` para criar a tabela de despesas usada na aba Financeiro.
6. Copie `.env.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL`: URL pública do projeto. `SUPABASE_URL` continua aceito localmente por compatibilidade.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave secreta do projeto (`sb_secret_...`). `SUPABASE_SECRET_KEY` continua aceito localmente por compatibilidade.

Nunca coloque a chave secreta no HTML, em `public/`, no Git ou em uma variável com prefixo público.

## Migrações automáticas

As migrations são aplicadas automaticamente pelo GitHub Actions quando houver alteração em `supabase/migrations/` na branch `main` ou `master`. Para ativar esse fluxo, crie no repositório a secret `SUPABASE_DB_PASSWORD` com a senha do banco PostgreSQL disponível em **Supabase → Project Settings → Database**.

O workflow monta e codifica a connection string automaticamente para o projeto Ponto-Obra. Não use a URL pública da API, a chave `anon` ou a service key nessa secret. Depois de configurar `SUPABASE_DB_PASSWORD`, basta publicar a migration no GitHub; o workflow `.github/workflows/supabase-migrations.yml` executará `supabase db push`.

## Rodar localmente

No PowerShell, carregue as duas variáveis de ambiente e execute:

```powershell
npm install
npm run dev
```

Abra `http://localhost:3000`. Para testar a conexão, acesse `http://localhost:3000/api/health` e confirme a resposta `{"ok":true}`.

Sem essas variáveis, a interface pode abrir, mas consultas e cadastros retornarão `503`, pois não há banco configurado. Use somente uma chave secreta/service role no backend; nunca use uma chave pública `anon` para cadastrar dados.

## Publicar no Vercel

1. Envie esta pasta para um repositório Git e importe-o no Vercel.
2. Em **Settings → Environment Variables**, cadastre `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` para Production, Preview e Development.
3. Faça o deploy. A Vercel detecta o Next.js automaticamente e publica as páginas e funções em `app/api`/`pages/api`.

## Verificação

```powershell
npm test
npm audit
```

O banco usa RLS e não concede acesso direto a `anon` ou `authenticated`. Somente a função de backend recebe a chave secreta e acessa as tabelas.
