import { carregarCadastroPreLista, carregarItemCheckout, validarItemCheckout } from '../_lib/catalogo.js'
import { db, serverTimestamp } from '../_lib/firebaseAdmin.js'
import { allowCors, readJsonBody, sendJson } from '../_lib/http.js'

const validateBuyer = (comprador) => {
  if (comprador.nome.length < 3) throw new Error('Cadastro da pre-lista sem nome valido.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(comprador.email)) throw new Error('Cadastro da pre-lista sem e-mail valido.')
  if (!/^[0-9]{10,11}$/.test(comprador.telefone)) throw new Error('Cadastro da pre-lista sem telefone valido.')
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
    const comprador = await carregarCadastroPreLista(body.cpf)

    validateBuyer(comprador)

    const item = await carregarItemCheckout({ tipo, id })
    const preco = validarItemCheckout(item, tipo, quantidade)
    const pedidoRef = db.collection('pedidos').doc()
    const pedidoId = pedidoRef.id
    const total = Number((preco * quantidade).toFixed(2))

    await pedidoRef.set({
      tipo,
      itemId: id,
      itemNome: item.nome,
      quantidade,
      precoUnitario: preco,
      total,
      comprador,
      preListaStatus: comprador.status,
      status: 'aguardando_dados_pagamento',
      provider: 'mercado_pago',
      checkoutMode: 'payment_brick',
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    })

    return sendJson(res, 200, {
      pedidoId,
      amount: total,
      item: {
        nome: item.nome,
        descricao: item.descricao || item.dataLimite || item.nome,
      },
      comprador: {
        nome: comprador.nome,
        email: comprador.email,
        cpf: comprador.cpf,
      },
    })
  } catch (error) {
    console.error(error)
    return sendJson(res, 400, { error: error.message || 'Nao foi possivel iniciar o checkout.' })
  }
}
