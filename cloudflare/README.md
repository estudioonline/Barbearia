# Barbearia no Cloudflare

O site roda no Cloudflare Pages (`barbearia-7pe.pages.dev`), com as APIs em `functions/` e o banco D1 `barbearia-db`.

## Recursos

1. Projeto Cloudflare Pages conectado a este repositório.
2. Banco D1 com binding no Pages chamado exatamente `DB`.
3. Variáveis em **Settings → Variables and secrets**:

| Nome | Tipo | Valor |
|---|---|---|
| `ADMIN_PIN` | Secret | PIN da área do barbeiro (obrigatório; sem ele a área fica fechada) |
| `MP_ACCESS_TOKEN` | Secret | Access Token do Mercado Pago (o longo, não a Public Key) |
| `MP_WEBHOOK_SECRET` | Secret | Assinatura secreta do webhook do Mercado Pago |
| `PAYMENT_PROVIDER` | Text | `mercadopago` |
| `PAYMENT_ENABLED` | Text | `true` para cobrar o sinal, `false` para desligar |

Mudanças de variáveis só valem no próximo deploy (Deployments → ⋯ → Retry deployment).

## Banco de dados

- Banco novo: rodar `cloudflare/schema.sql`.
- Banco existente: rodar **uma vez** `cloudflare/migrations/0001_pagamento_mercadopago.sql`
  **antes** de publicar o código com pagamento. Pelo painel: D1 → `barbearia-db` → Console, colar o arquivo e executar.
  Ou: `npx wrangler d1 execute barbearia-db --remote --file=cloudflare/migrations/0001_pagamento_mercadopago.sql`

## Fluxo do sinal (Mercado Pago Checkout Pro)

1. Cliente escolhe serviço/data/horário e clica em **Pagar sinal**.
2. `POST /api` reserva a vaga como `aguardando_pagamento` (por 40 min) e cria a cobrança de 50% no Mercado Pago.
3. O cliente paga (Pix ou cartão) no Mercado Pago; o link expira em 30 min.
4. O Mercado Pago avisa `POST /payment-webhook` e o cliente volta para `/?pagamento=...`, que chama `POST /payment` (`action=confirm`).
   Nos dois casos o pagamento é consultado direto na API do Mercado Pago antes de marcar `Entrada paga`.
5. Se não pagar a tempo, a vaga é liberada automaticamente (`expirado`).

Com `PAYMENT_ENABLED=false` o agendamento é confirmado na hora, sem cobrança.

## Rotas

- `GET /api?date=AAAA-MM-DD`: disponibilidade.
- `POST /api`: cria agendamento (e a cobrança, se o pagamento estiver ligado).
- `POST /api` com `action=admin-list | complete | cancel | clear-all` e `pin`: área do barbeiro.
- `GET /payment`: configuração pública do pagamento.
- `POST /payment` com `action=confirm`: confere o pagamento na volta do checkout.
- `POST /payment-webhook`: notificações do Mercado Pago.

## Webhook no Mercado Pago

Suas integrações → aplicação → Webhooks → Configurar notificações:
URL `https://barbearia-7pe.pages.dev/payment-webhook`, evento **Pagamentos**.
Copie a assinatura secreta para o secret `MP_WEBHOOK_SECRET`.
