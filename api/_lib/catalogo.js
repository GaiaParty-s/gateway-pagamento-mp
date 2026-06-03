import { db } from './firebaseAdmin.js'

const collectionsByType = {
  produto: 'Produtos',
  ingresso: 'ingressos',
}

export const carregarItemCheckout = async ({ tipo, id }) => {
  const collectionName = collectionsByType[tipo]

  if (!collectionName || !id) {
    throw new Error('Item invalido.')
  }

  const document = await db.collection(collectionName).doc(String(id)).get()

  if (!document.exists) {
    throw new Error('Item nao encontrado.')
  }

  return {
    id: document.id,
    ...document.data(),
  }
}

export const validarItemCheckout = (item, tipo, quantidade) => {
  if (item.ativo !== true) {
    throw new Error('Item indisponivel para compra.')
  }

  if (tipo === 'ingresso' && item.esgotado === true) {
    throw new Error('Ingresso esgotado.')
  }

  if (tipo === 'produto' && typeof item.estoque === 'number' && item.estoque < quantidade) {
    throw new Error('Estoque insuficiente.')
  }

  const preco = Number(item.preco)

  if (!Number.isFinite(preco) || preco <= 0) {
    throw new Error('Preco invalido.')
  }

  return preco
}
