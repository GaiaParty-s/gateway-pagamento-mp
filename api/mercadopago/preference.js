import { carregarItemCheckout, validarItemCheckout } from '../_lib/catalogo.js'
import { db, serverTimestamp } from '../_lib/firebaseAdmin.js'
import { allowCors, getGatewayBaseUrl, getReturnBaseUrl, readJsonBody, sendJson } from '../_lib/http.js'
import { criarPreferencia } from '../_lib/mercadoPago.js'

const sanitizeBuyer = (comprador = {}) => ({
  nome: String(comprador.nome || '').trim(),
  email: String(comprador.email || '').trim().toLowerCase(),
  telefone: String(comprador.telefone || '').replace(/\D/g, ''),
})

const validateBuyer = (comprador) => {
  if (comprador.nome.length < 3) throw new Error('Informe o nome do comprador.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(comprador.email)) throw new Error('Informe um e-mail valido.')
  if (!/^[0-9]{10,11}$/.test(comprador.telefone)) throw new Error('Informe um telefone valido com DDD.')
}

export default async function handler(req, res) {
  if (allowCors(req, res)) return

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Metodo nao permitido.' })
  }

  try {
    const body = await readJsonBody(req)
    const tipo = String(body.tipo || '').trim()
    const id = String(body.id || '').trim()
    const quantidade = Math.max(1, Math.min(Number(body.quantidade) || 1, 10))
    const comprador = sanitizeBuyer(body.comprador)

    validateBuyer(comprador)

    const item = await carregarItemCheckout({ tipo, id })
    const preco = validarItemCheckout(item, tipo, quantidade)
    const returnBaseUrl = getReturnBaseUrl(req)
    const gatewayBaseUrl = getGatewayBaseUrl(req)
    const pedidoRef = db.collection('pedidos').doc()
    const pedidoId = pedidoRef.id
    const titulo = tipo === 'produto' ? item.nome : `Ingresso ${item.nome}`
    const notificationUrl = process.env.MERCADO_PAGO_WEBHOOK_URL || `${gatewayBaseUrl}/api/mercadopago/webhook`

    await pedidoRef.set({
      tipo,
      itemId: id,
      itemNome: item.nome,
      quantidade,
      precoUnitario: preco,
      total: preco * quantidade,
      comprador,
      status: 'aguardando_pagamento',
      provider: 'mercado_pago',
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    })

    const preference = await criarPreferencia({
      items: [
        {
          id: `${tipo}-${id}`,
          title: titulo,
          description: item.descricao || item.dataLimite || titulo,
          quantity: quantidade,
          currency_id: 'BRL',
          unit_price: preco,
        },
      ],
      payer: {
        name: comprador.nome,
        email: comprador.email,
        phone: {
          number: comprador.telefone,
        },
      },
      back_urls: {
        success: `${returnBaseUrl}/checkout-retorno?status=sucesso&pedido=${pedidoId}`,
        failure: `${returnBaseUrl}/checkout-retorno?status=falha&pedido=${pedidoId}`,
        pending: `${returnBaseUrl}/checkout-retorno?status=pendente&pedido=${pedidoId}`,
      },
      auto_return: 'approved',
      external_reference: pedidoId,
      notification_url: notificationUrl,
      metadata: {
        pedido_id: pedidoId,
        tipo,
        item_id: id,
      },
    })

    await pedidoRef.update({
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      atualizadoEm: serverTimestamp(),
    })

    return sendJson(res, 200, {
      pedidoId,
      preferenceId: preference.id,
      initPoint: process.env.MERCADO_PAGO_USE_SANDBOX === 'true'
        ? preference.sandbox_init_point
        : preference.init_point,
    })
  } catch (error) {
    console.error(error)
    return sendJson(res, 400, { error: error.message || 'Nao foi possivel iniciar o pagamento.' })
  }
}
