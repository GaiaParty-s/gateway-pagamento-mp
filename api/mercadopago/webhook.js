import crypto from 'crypto'
import { db, serverTimestamp } from '../_lib/firebaseAdmin.js'
import { allowCors, readJsonBody, sendJson } from '../_lib/http.js'
import { buscarPagamento } from '../_lib/mercadoPago.js'

const getPaymentId = (req, body) =>
  req.query?.['data.id'] ||
  req.query?.id ||
  body?.data?.id ||
  body?.id

const getEventType = (req, body) =>
  req.query?.type ||
  body?.type ||
  body?.topic ||
  body?.action

const parseSignature = (signature = '') =>
  signature.split(',').reduce((parts, part) => {
    const [key, value] = part.split('=')
    if (key && value) parts[key.trim()] = value.trim()
    return parts
  }, {})

const verifyWebhookSignature = (req, paymentId) => {
  if (!process.env.MERCADO_PAGO_WEBHOOK_SECRET) return true

  const { ts, v1 } = parseSignature(req.headers['x-signature'])
  const requestId = req.headers['x-request-id']

  if (!ts || !v1 || !requestId || !paymentId) return false

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
  const expected = crypto
    .createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex')

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(v1)

  return expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

export default async function handler(req, res) {
  if (allowCors(req, res)) return

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Metodo nao permitido.' })
  }

  try {
    const body = await readJsonBody(req)
    const eventType = getEventType(req, body)
    const paymentId = getPaymentId(req, body)

    if (!String(eventType || '').includes('payment') || !paymentId) {
      return sendJson(res, 200, { received: true, ignored: true })
    }

    if (!verifyWebhookSignature(req, paymentId)) {
      return sendJson(res, 401, { error: 'Assinatura invalida.' })
    }

    const payment = await buscarPagamento(paymentId)
    const pedidoId = payment.external_reference || payment.metadata?.pedido_id

    if (!pedidoId) {
      return sendJson(res, 200, { received: true, ignored: true })
    }

    await db.collection('pedidos').doc(String(pedidoId)).set({
      status: payment.status,
      statusDetail: payment.status_detail || null,
      paymentId: String(payment.id),
      paymentMethodId: payment.payment_method_id || null,
      paymentTypeId: payment.payment_type_id || null,
      paidAmount: payment.transaction_amount || null,
      providerResponse: {
        dateApproved: payment.date_approved || null,
        dateCreated: payment.date_created || null,
        liveMode: payment.live_mode || false,
      },
      atualizadoEm: serverTimestamp(),
    }, { merge: true })

    return sendJson(res, 200, { received: true })
  } catch (error) {
    console.error(error)
    return sendJson(res, 500, { error: 'Nao foi possivel processar o webhook.' })
  }
}
