import { allowCors, readJsonBody, sendJson } from '../_lib/http.js'
import { consultarCpfHub, publicListaResult, readListaByCpf } from '../_lib/lista.js'

export default async function handler(req, res) {
  if (allowCors(req, res)) return
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Metodo nao permitido.' })

  try {
    const body = await readJsonBody(req)
    const lista = await readListaByCpf(body.cpf)
    if (!lista) throw new Error('CPF nao encontrado na lista.')

    await consultarCpfHub(lista)
    const updated = await readListaByCpf(body.cpf)

    return sendJson(res, 200, { resultado: publicListaResult(updated) })
  } catch (error) {
    console.error(error)
    return sendJson(res, 400, { error: error.message || 'Nao foi possivel conferir o CPF.' })
  }
}
