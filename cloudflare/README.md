# Migração da Barbearia para Cloudflare

Este repositório já contém a API compatível com Cloudflare Pages Functions em `functions/api.js`.

## Recursos necessários

1. Um projeto Cloudflare Pages conectado a este repositório.
2. Um banco D1.
3. Um binding D1 no Pages com o nome exato `DB`.
4. Um secret/variável de produção chamado `ADMIN_PIN`.
5. Executar `cloudflare/schema.sql` no banco D1.
6. Após o primeiro deploy validado, alterar o front-end para usar `/api` no lugar da Edge Function antiga do Supabase.

## Rotas

- `GET /api?date=AAAA-MM-DD`: disponibilidade.
- `POST /api`: cria agendamento.
- `POST /api` com `action=admin-list`: lista agenda.
- `POST /api` com `action=complete`: conclui atendimento.
- `POST /api` com `action=cancel`: cancela atendimento.
- `POST /api` com `action=clear-all`: limpa agenda.

O PIN administrativo não deve ser salvo no repositório. Configure-o como secret/variável no Cloudflare.
