/**
 * Central API utility — all calls go to Supabase Edge Functions.
 * Import this instead of calling fetch('/api/...') directly.
 */

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

function getToken() {
  try { return JSON.parse(localStorage.getItem('ets_auth'))?.access_token } catch { return null }
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` }
}

async function post(url, body, auth = false) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) Object.assign(headers, authHeaders())
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed')
    if (data.code) err.code = data.code
    throw err
  }
  return data
}

async function get(url, params = {}, auth = false) {
  const headers = {}
  if (auth) Object.assign(headers, authHeaders())
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  const res = await fetch(qs ? `${url}?${qs}` : url, { headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function put(url, params = {}, body = {}, auth = false) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) Object.assign(headers, authHeaders())
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  const res = await fetch(qs ? `${url}?${qs}` : url, { method: 'PUT', headers, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function del(url, params = {}, auth = false) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) Object.assign(headers, authHeaders())
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  const res = await fetch(qs ? `${url}?${qs}` : url, { method: 'DELETE', headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// ── Auth ───────────────────────────────────────────────────────────
export const authApi = {
  login:   (body) => post(`${BASE}/auth-login`,   body),
  signup:  (body) => post(`${BASE}/auth-signup`,  body),
  refresh: (body) => post(`${BASE}/auth-refresh`, body),
}

// ── Drive (presign / download / share-resolve) ─────────────────────
export const driveApi = {
  presign:        (body)   => post(`${BASE}/presign`, body, true),
  download:       (params) => get(`${BASE}/download`, params),
  shareResolve:   (token)  => get(`${BASE}/share-resolve`, { token }),
  // user share management (trash / restore / move / rename / delete)
  userShare:      (token, body) => put(`${BASE}/user-share`, { token }, body, true),
  deleteUserShare:(token)  => del(`${BASE}/user-share`, { token }, true),
}

// ── User ───────────────────────────────────────────────────────────
export const userApi = {
  getFiles:   (params = {}) => get(`${BASE}/user-files`,   params, true),
  getFolders: (params = {}) => get(`${BASE}/user-folders`, params, true),
  createFolder:(body)       => post(`${BASE}/user-folders`, body, true),
  getProfile: ()            => get(`${BASE}/user-profile`, {}, true),
  updateProfile:(body)      => put(`${BASE}/user-profile`, {}, body, true),
  uploadAvatar: (body)      => post(`${BASE}/user-avatar`, body, true),
  deleteAvatar: ()          => del(`${BASE}/user-avatar`, {}, true),
}

// ── Media ──────────────────────────────────────────────────────────
export const mediaApi = {
  // Projects
  getProjects:    ()     => get(`${BASE}/media-projects`, {}, true),
  createProject:  (body) => post(`${BASE}/media-projects`, body, true),
  updateProject:  (id, body) => put(`${BASE}/media-projects`, { id }, body, true),
  deleteProject:  (id)   => del(`${BASE}/media-projects`, { id }, true),

  // Folders
  getFolders:     (params) => get(`${BASE}/media-folders`, params, true),
  createFolder:   (body)   => post(`${BASE}/media-folders`, body, true),
  updateFolder:   (id, body) => put(`${BASE}/media-folders`, { id }, body, true),
  deleteFolder:   (id)     => del(`${BASE}/media-folders`, { id }, true),

  // Assets
  getAssets:      (params) => get(`${BASE}/media-assets`, params, true),
  getAsset:       (id)     => get(`${BASE}/media-assets`, { id }, true),
  updateAsset:    (id, body) => put(`${BASE}/media-assets`, { id }, body, true),
  deleteAsset:    (id)     => del(`${BASE}/media-assets`, { id }, true),

  // Upload
  uploadInit:     (body)   => post(`${BASE}/media-upload-init`, body, true),
  uploadStatus:   (assetId) => get(`${BASE}/media-upload-status`, { assetId }, true),

  // Comments
  getComments:    (assetId) => get(`${BASE}/media-comments`, { assetId }, true),
  createComment:  (body)    => post(`${BASE}/media-comments`, body, true),
  updateComment:  (id, body) => put(`${BASE}/media-comments`, { id }, body, true),
  deleteComment:  (id)      => del(`${BASE}/media-comments`, { id }, true),

  // Share links
  getShareLinks:  (assetId) => assetId ? get(`${BASE}/media-share`, { assetId }, true) : get(`${BASE}/media-share`, {}, true),
  createShareLink:(body)    => post(`${BASE}/media-share`, body, true),
  deleteShareLink:(id)      => del(`${BASE}/media-share`, { id }, true),
  resolveShare:   (token, password) => get(`${BASE}/media-share-resolve`, password ? { token, password } : { token }),

  // Team
  getTeam:        (projectId) => get(`${BASE}/media-team`, { projectId }, true),
  inviteMember:   (body)      => post(`${BASE}/media-team`, body, true),
  updateMember:   (id, body)  => put(`${BASE}/media-team`, { id }, body, true),
  removeMember:   (id)        => del(`${BASE}/media-team`, { id }, true),
}

/**
 * Drop-in replacement for the old userApiFetch(path, options) pattern.
 * Routes /api/... paths to the correct edge function.
 * Use this for gradual migration — prefer the typed api objects above for new code.
 */
export async function userApiFetch(path, options = {}) {
  const token = getToken()
  const res = await fetch(legacyPathToEdge(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

/** Maps old /api/... paths to edge function URLs */
function legacyPathToEdge(path) {
  // Strip query string for routing, re-attach below
  const [pathname, qs] = path.split('?')
  const query = qs ? `?${qs}` : ''

  const map = {
    '/api/presign':                `${BASE}/presign`,
    '/api/download':               `${BASE}/download`,
    '/api/auth/login':             `${BASE}/auth-login`,
    '/api/auth/signup':            `${BASE}/auth-signup`,
    '/api/auth/refresh':           `${BASE}/auth-refresh`,
    '/api/user/files':             `${BASE}/user-files`,
    '/api/user/folders':           `${BASE}/user-folders`,
    '/api/user/profile':           `${BASE}/user-profile`,
    '/api/user/avatar':            `${BASE}/user-avatar`,
    '/api/media/projects':         `${BASE}/media-projects`,
    '/api/media/folders':          `${BASE}/media-folders`,
    '/api/media/assets':           `${BASE}/media-assets`,
    '/api/media/comments':         `${BASE}/media-comments`,
    '/api/media/share':            `${BASE}/media-share`,
    '/api/media/upload-init':      `${BASE}/media-upload-init`,
    '/api/media/upload-status':    `${BASE}/media-upload-status`,
    '/api/media/team':             `${BASE}/media-team`,
  }

  // Dynamic paths: /api/share/:token  /api/user/share/:token  /api/media/share/:token
  if (pathname.startsWith('/api/media/share/')) {
    const token = pathname.split('/api/media/share/')[1]
    return `${BASE}/media-share-resolve?token=${token}${qs ? '&' + qs : ''}`
  }
  if (pathname.startsWith('/api/user/share/')) {
    const token = pathname.split('/api/user/share/')[1]
    return `${BASE}/user-share?token=${token}${qs ? '&' + qs : ''}`
  }
  if (pathname.startsWith('/api/share/')) {
    const token = pathname.split('/api/share/')[1]
    return `${BASE}/share-resolve?token=${token}${qs ? '&' + qs : ''}`
  }

  return (map[pathname] || `${BASE}${pathname}`) + query
}
