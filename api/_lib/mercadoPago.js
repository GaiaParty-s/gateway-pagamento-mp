const mercadoPagoRequest = async (path, options = {}) => {
  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error('MERCADO_PAGO_ACCESS_TOKEN nao configurado.')
  }

  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = body.message || body.error || 'Erro na API do Mercado Pago.'
    throw new Error(message)
  }

  return body
}

export const criarPreferencia = (payload) =>
  mercadoPagoRequest('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const criarPagamento = (payload, idempotencyKey) =>
  mercadoPagoRequest('/v1/payments', {
    method: 'POST',
    headers: {
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  })

export const buscarPagamento = (paymentId) =>
  mercadoPagoRequest(`/v1/payments/${paymentId}`, {
    method: 'GET',
  })
