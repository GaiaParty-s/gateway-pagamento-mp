import { allowCors, readJsonBody, sendJson } from '../_lib/http.js'
import { upsertLista } from '../_lib/lista.js'

export default async function handler(req, res) {
  if (allowCors(req, res)) return
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Metodo nao permitido.' })

  try {
    const body = await readJsonBody(req)
    const cadastro = await upsertLista({ ...body, consentimento: true, status: 'pendente' })
    return sendJson(res, 200, { ok: true, status: cadastro.status })
  } catch (error) {
    console.error(error)
    return sendJson(res, 400, { error: error.message || 'Nao foi possivel cadastrar.' })
  }
}
