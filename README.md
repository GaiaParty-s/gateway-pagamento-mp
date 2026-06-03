# Gateway de Pagamento

API Vercel separada para criar preferencias do Mercado Pago e receber webhooks.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Variaveis de ambiente

Configure na Vercel do gateway:

```text
MERCADO_PAGO_ACCESS_TOKEN=APP_USR... ou TEST...
MERCADO_PAGO_USE_SANDBOX=true
PUBLIC_SITE_URL=https://seu-front.vercel.app
CORS_ORIGIN=https://seu-front.vercel.app
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

Opcional:

```text
MERCADO_PAGO_WEBHOOK_URL=https://seu-gateway.vercel.app/api/mercadopago/webhook
MERCADO_PAGO_WEBHOOK_SECRET=assinatura_secreta_do_webhook
```

No Mercado Pago Developers, configure o webhook de pagamentos para:

```text
https://seu-gateway.vercel.app/api/mercadopago/webhook
```

No front-end, configure:

```text
VITE_API_BASE_URL=https://seu-gateway.vercel.app
```
