import { db, serverTimestamp } from '../_lib/firebaseAdmin.js'
import { allowCors, getGatewayBaseUrl, readJsonBody, sendJson } from '../_lib/http.js'
import { updateListaPaymentStatus } from '../_lib/lista.js'
import { criarPagamento } from '../_lib/mercadoPago.js'

const cleanUndefined = (value) => {
  if (Array.isArray(value)) return value.map(cleanUndefined)
  if (!value || typeof value !== 'object') return value

  return Object.entries(value).reduce((clean, [key, entryValue]) => {
    if (entryValue === undefined || entryValue === null || entryValue === '') return clean
    clean[key] = cleanUndefined(entryValue)
    return clean
  }, {})
}

export default async function handler(req, res) {
  if (allowCors(req, res)) return

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Metodo nao permitido.' })
  }

  try {
    const body = await readJsonBody(req)
    const pedidoId = String(body.pedidoId || '').trim()
    const formData = body.formData || {}

    if (!pedidoId) throw new Error('Pedido invalido.')

    const pedidoRef = db.collection('pedidos').doc(pedidoId)
    const pedidoDoc = await pedidoRef.get()

    if (!pedidoDoc.exists) throw new Error('Pedido nao encontrado.')

    const pedido = pedidoDoc.data()
    const amount = Number(pedido.total)

    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor do pedido invalido.')

    const gatewayBaseUrl = getGatewayBaseUrl(req)
    const paymentPayload = cleanUndefined({
      transaction_amount: amount,
      token: formData.token,
      description: pedido.itemNome,
      installments: formData.installments ? Number(formData.installments) : undefined,
      payment_method_id: formData.payment_method_id,
      issuer_id: formData.issuer_id,
      external_reference: pedidoId,
      notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL || `${gatewayBaseUrl}/api/mercadopago/webhook`,
      metadata: {
        pedido_id: pedidoId,
        tipo: pedido.tipo,
        item_id: pedido.itemId,
      },
      payer: {
        email: pedido.comprador?.email || formData.payer?.email,
        identification: {
          type: formData.payer?.identification?.type || 'CPF',
          number: pedido.comprador?.cpf || formData.payer?.identification?.number,
        },
      },
    })

    await pedidoRef.update({
      status: 'processando_pagamento',
      paymentMethodId: paymentPayload.payment_method_id || null,
      atualizadoEm: serverTimestamp(),
    })

    const payment = await criarPagamento(paymentPayload, `${pedidoId}-${Date.now()}`)

    await pedidoRef.set({
      status: payment.status,
      statusDetail: payment.status_detail || null,
      paymentId: String(payment.id),
      paymentMethodId: payment.payment_method_id || null,
      paymentTypeId: payment.payment_type_id || null,
      paidAmount: payment.transaction_amount || amount,
      providerResponse: {
        dateApproved: payment.date_approved || null,
        dateCreated: payment.date_created || null,
        liveMode: payment.live_mode || false,
      },
      atualizadoEm: serverTimestamp(),
    }, { merge: true })

    await updateListaPaymentStatus(pedidoId, payment)

    return sendJson(res, 200, {
      id: payment.id,
      status: payment.status,
      statusDetail: payment.status_detail,
      paymentMethodId: payment.payment_method_id,
      paymentTypeId: payment.payment_type_id,
      pointOfInteraction: payment.point_of_interaction || null,
    })
  } catch (error) {
    console.error(error)
    return sendJson(res, 400, { error: error.message || 'Nao foi possivel processar o pagamento.' })
  }
}
