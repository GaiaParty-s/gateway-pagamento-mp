export const sendJson = (res, status, payload) => {
  res.status(status).json(payload)
}

const normalizeUrl = (url) => String(url || '').replace(/\/$/, '')

const getAllowedOrigins = () =>
  String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => normalizeUrl(origin.trim()))
    .filter(Boolean)

export const isAllowedOrigin = (origin) => {
  const allowedOrigins = getAllowedOrigins()

  if (!allowedOrigins.length) return true

  return allowedOrigins.includes(normalizeUrl(origin))
}

export const allowCors = (req, res) => {
  const origin = normalizeUrl(req.headers.origin)
  const allowedOrigins = getAllowedOrigins()
  const allowAnyOrigin = !allowedOrigins.length

  if (allowAnyOrigin) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    if (!allowAnyOrigin && (!origin || !allowedOrigins.includes(origin))) {
      res.status(403).end()
      return true
    }

    res.status(204).end()
    return true
  }

  return false
}

export const readJsonBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body
  if (req.body && typeof req.body === 'string') return JSON.parse(req.body)

  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  return rawBody ? JSON.parse(rawBody) : {}
}

export const getReturnBaseUrl = (req) => {
  const origin = normalizeUrl(req.headers.origin)

  if (origin && isAllowedOrigin(origin)) return origin

  if (process.env.PUBLIC_SITE_URL) return normalizeUrl(process.env.PUBLIC_SITE_URL)

  throw new Error('Origem do front-end nao autorizada.')
}

export const getGatewayBaseUrl = (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  return `${protocol}://${host}`
}
