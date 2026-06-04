import crypto from 'crypto'
import { db, serverTimestamp } from './firebaseAdmin.js'

const HUB_CPF_URL = 'http://ws.hubdodesenvolvedor.com.br/v2/cpf/'

export const onlyDigits = (value) => String(value || '').replace(/\D/g, '')

export const cpfHash = (cpf) =>
  crypto.createHash('sha256').update(onlyDigits(cpf)).digest('hex').slice(0, 32)

const normalizeName = (name) =>
  String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const relevantWords = (name) =>
  normalizeName(name).split(' ').filter((word) => word && !['DA', 'DE', 'DI', 'DO', 'DAS', 'DOS', 'E'].includes(word))

const similarity = (a, b) => {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right) return 0

  const longer = left.length > right.length ? left : right
  const shorter = left.length > right.length ? right : left
  const costs = Array.from({ length: shorter.length + 1 }, (_, index) => index)

  for (let i = 1; i <= longer.length; i += 1) {
    let previous = i
    for (let j = 1; j <= shorter.length; j += 1) {
      const value = longer[i - 1] === shorter[j - 1]
        ? costs[j - 1]
        : Math.min(costs[j - 1], previous, costs[j]) + 1
      costs[j - 1] = previous
      previous = value
    }
    costs[shorter.length] = previous
  }

  return (longer.length - costs[shorter.length]) / longer.length
}

export const namesMatch = (submittedName, officialName) => {
  const submittedWords = relevantWords(submittedName)
  const officialWords = relevantWords(officialName)
  const minimumWords = Math.min(2, submittedWords.length, officialWords.length)
  const exactMatches = submittedWords.filter((word) => officialWords.includes(word)).length
  const fuzzyMatches = submittedWords.filter((word) =>
    officialWords.some((officialWord) => similarity(word, officialWord) >= 0.84)
  ).length

  return similarity(submittedName, officialName) >= 0.70 ||
    similarity(submittedWords.sort().join(' '), officialWords.sort().join(' ')) >= 0.70 ||
    exactMatches >= minimumWords ||
    fuzzyMatches >= minimumWords
}

export const formatDateToHub = (value) => {
  const raw = String(value || '').trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-')
    return `${day}/${month}/${year}`
  }
  return raw
}

export const publicStatus = (lista = {}) => {
  if (lista.pagamento?.status === 'pago' || lista.status === 'pago') return 'pago'
  if (lista.status === 'recusado' || lista.status === 'reprovado') return 'recusado'
  if (lista.status === 'aprovado') return 'aprovado'
  return 'pendente'
}

export const publicMessage = (status) => {
  if (status === 'pago') return 'Pagamento confirmado.'
  if (status === 'aprovado') return 'CPF e dados OK.'
  if (status === 'recusado') return 'CPF ou dados incorretos.'
  return 'Pendente da aprovacao.'
}

export const upsertLista = async (form) => {
  const cpf = onlyDigits(form.cpf)
  if (!/^[0-9]{11}$/.test(cpf)) throw new Error('Informe um CPF valido.')

  const data = {
    nome: String(form.nome || '').trim().replace(/\s+/g, ' '),
    cpf,
    nascimento: String(form.nascimento || '').trim(),
    telefone: onlyDigits(form.telefone),
    email: String(form.email || '').trim().toLowerCase(),
    consentimento: form.consentimento === true,
    status: form.status || 'pendente',
    atualizadoEm: serverTimestamp(),
  }

  if (data.nome.length < 5) throw new Error('Informe o nome completo.')
  if (!/^[0-9]{10,11}$/.test(data.telefone)) throw new Error('Informe um telefone valido.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) throw new Error('Informe um e-mail valido.')
  if (!data.consentimento) throw new Error('Confirme o consentimento.')

  const listaRef = db.collection('Lista').doc(cpf)
  const current = await listaRef.get()

  await listaRef.set({
    ...data,
    criadoEm: current.exists ? current.data().criadoEm : serverTimestamp(),
  }, { merge: true })

  await db.collection('preLista').doc(cpf).set({
    ...data,
    criadoEm: current.exists ? current.data().criadoEm : serverTimestamp(),
  }, { merge: true })

  const status = publicStatus(data)
  await db.collection('preListaPublica').doc(cpfHash(cpf)).set({
    nome: data.nome,
    cpfFinal: cpf.slice(-4),
    status,
    observacaoPublica: publicMessage(status),
    atualizadoEm: serverTimestamp(),
  }, { merge: true })

  return { cpf, ...data, status }
}

export const readListaByCpf = async (cpf) => {
  const cleanCpf = onlyDigits(cpf)
  if (!/^[0-9]{11}$/.test(cleanCpf)) throw new Error('Informe um CPF valido.')

  const listaDoc = await db.collection('Lista').doc(cleanCpf).get()
  if (listaDoc.exists) return { id: listaDoc.id, ...listaDoc.data() }

  const preListaDoc = await db.collection('preLista').doc(cleanCpf).get()
  if (preListaDoc.exists) {
    const data = { id: preListaDoc.id, ...preListaDoc.data() }
    await db.collection('Lista').doc(cleanCpf).set({
      ...data,
      atualizadoEm: serverTimestamp(),
    }, { merge: true })
    return data
  }

  return null
}

export const publicListaResult = (lista) => {
  if (!lista) return null
  const status = publicStatus(lista)
  return {
    nome: lista.nome,
    cpfFinal: onlyDigits(lista.cpf || lista.id).slice(-4),
    status,
    observacaoPublica: publicMessage(status),
    pagamento: lista.pagamento || null,
    validacaoCpf: lista.validacaoCpf || null,
  }
}

export const consultarCpfHub = async (lista) => {
  if (!process.env.HUB_DESENVOLVEDOR_TOKEN) {
    throw new Error('Token de validacao de CPF nao configurado.')
  }

  const cpf = onlyDigits(lista.cpf || lista.id)
  const url = new URL(HUB_CPF_URL)
  url.searchParams.set('cpf', cpf)
  url.searchParams.set('data', formatDateToHub(lista.nascimento))
  url.searchParams.set('token', process.env.HUB_DESENVOLVEDOR_TOKEN)

  const response = await fetch(url)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload.return !== 'OK') {
    throw new Error(payload.message || payload.msg || 'Nao foi possivel validar o CPF.')
  }

  const result = payload.result || {}
  const cpfMatches = onlyDigits(result.numero_de_cpf) === cpf
  const birthMatches = String(result.data_nascimento || '') === formatDateToHub(lista.nascimento)
  const nameMatches = namesMatch(lista.nome, result.nome_da_pf)
  const cpfRegular = normalizeName(result.situacao_cadastral) === 'REGULAR'
  const approved = cpfMatches && birthMatches && nameMatches && cpfRegular
  const status = approved ? 'aprovado' : 'recusado'

  const validation = {
    cpfConfere: cpfMatches,
    nascimentoConfere: birthMatches,
    nomeConfere: nameMatches,
    cpfRegular,
    nomeReceita: result.nome_da_pf || '',
    nascimentoReceita: result.data_nascimento || '',
    statusReceita: result.situacao_cadastral || '',
    observacoes: approved ? 'Dados conferem' : 'CPF ou dados incorretos',
    consultasConsumidas: payload.consumed || '',
    conferidoEm: serverTimestamp(),
  }

  await db.collection('Lista').doc(cpf).set({
    status,
    validacaoCpf: validation,
    atualizadoEm: serverTimestamp(),
  }, { merge: true })

  await db.collection('preListaPublica').doc(cpfHash(cpf)).set({
    nome: lista.nome,
    cpfFinal: cpf.slice(-4),
    status,
    observacaoPublica: publicMessage(status),
    atualizadoEm: serverTimestamp(),
  }, { merge: true })

  return { status, validation }
}

export const updateListaPaymentStatus = async (pedidoId, payment) => {
  const pedidoDoc = await db.collection('pedidos').doc(String(pedidoId)).get()
  if (!pedidoDoc.exists) return

  const pedido = pedidoDoc.data()
  const cpf = onlyDigits(pedido.comprador?.cpf)
  if (!cpf) return

  const paymentStatus = payment.status === 'approved' ? 'pago' : payment.status
  const listaStatus = payment.status === 'approved' ? 'pago' : undefined

  const data = {
    pagamento: {
      status: paymentStatus,
      pedidoId: String(pedidoId),
      paymentId: String(payment.id),
      metodo: payment.payment_method_id || null,
      tipo: payment.payment_type_id || null,
      valor: payment.transaction_amount || pedido.total || null,
      atualizadoEm: serverTimestamp(),
    },
    atualizadoEm: serverTimestamp(),
  }

  if (listaStatus) data.status = listaStatus

  await db.collection('Lista').doc(cpf).set(data, { merge: true })

  const lista = await readListaByCpf(cpf)
  const status = publicStatus(lista || data)
  await db.collection('preListaPublica').doc(cpfHash(cpf)).set({
    nome: pedido.comprador?.nome || lista?.nome || '',
    cpfFinal: cpf.slice(-4),
    status,
    observacaoPublica: publicMessage(status),
    atualizadoEm: serverTimestamp(),
  }, { merge: true })
}
