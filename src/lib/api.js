/**
 * Central API utility — all calls go to Supabase Edge Functions.
 * Import typed API objects; avoid calling fetch() directly in components.
 */
import { supabase } from './supabaseClient'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const ANON_HEADERS = { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY }

// ── Token management ────────────────────────────────────────────────────────

// Attempt a forced token refresh via Supabase SDK.
// Returns the new access token, or null if refresh fails.
async function forceRefreshToken() {
  try {
    const stored = JSON.parse(localStorage.getItem('ets_auth') || '{}')
    const refreshToken = stored?.refresh_token

    // Try Supabase SDK refresh first
    const { data, error } = await supabase.auth.refreshSession(
      refreshToken ? { refresh_token: refreshToken } : undefined
    )
    if (!error && data?.session?.access_token) {
      // Persist the refreshed session
      localStorage.setItem('ets_auth', JSON.stringify(data.session))
      return data.session.access_token
    }
  } catch {}
  return null
}

// Returns the current access token.
// Uses supabase.auth.getSession() which auto-refreshes when possible.
// Falls back to ets_auth directly for edge cases.
async function getToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) return session.access_token
  } catch {}
  try { return JSON.parse(localStorage.getItem('ets_auth'))?.access_token ?? null } catch { return null }
}

async function authHeaders(token) {
  return { Authorization: `Bearer ${token ?? await getToken()}` }
}

// On a 401, attempt one token refresh and return new headers.
// If refresh fails, redirect to login and throw.
async function handle401() {
  const newToken = await forceRefreshToken()
  if (newToken) return { Authorization: `Bearer ${newToken}` }
  // Refresh failed — clear session and redirect to login
  localStorage.removeItem('ets_auth')
  window.location.href = '/login'
  throw new Error('Session expired')
}

// ── HTTP helpers (auth=true adds Bearer token; retries once on 401) ─────────

async function fetchWithAuth(fetchFn) {
  const res = await fetchFn()
  if (res.status === 401) {
    // Attempt refresh and retry once
    const retryHeaders = await handle401()
    return fetchFn(retryHeaders)
  }
  return res
}

async function post(url, body, auth = false) {
  const token = auth ? await getToken() : null
  const makeReq = async (overrideHeaders) => {
    const baseHeaders = auth ? (overrideHeaders || await authHeaders(token)) : ANON_HEADERS
    const headers = { 'Content-Type': 'application/json', ...baseHeaders }
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  }
  const res = auth ? await fetchWithAuth(makeReq) : await makeReq()
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed')
    if (data.code) err.code = data.code
    throw err
  }
  return data
}

async function get(url, params = {}, auth = false) {
  const token = auth ? await getToken() : null
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  const fullUrl = qs ? `${url}?${qs}` : url
  const makeReq = async (overrideHeaders) => {
    const headers = auth ? (overrideHeaders || await authHeaders(token)) : ANON_HEADERS
    return fetch(fullUrl, { headers })
  }
  const res = auth ? await fetchWithAuth(makeReq) : await makeReq()
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed')
  return data
}

async function put(url, params = {}, body = {}, auth = false) {
  const token = auth ? await getToken() : null
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  const fullUrl = qs ? `${url}?${qs}` : url
  const makeReq = async (overrideHeaders) => {
    const headers = { 'Content-Type': 'application/json', ...(auth ? (overrideHeaders || await authHeaders(token)) : {}) }
    return fetch(fullUrl, { method: 'PUT', headers, body: JSON.stringify(body) })
  }
  const res = auth ? await fetchWithAuth(makeReq) : await makeReq()
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function patch(url, params = {}, body = {}, auth = false) {
  const token = auth ? await getToken() : null
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  const fullUrl = qs ? `${url}?${qs}` : url
  const makeReq = async (overrideHeaders) => {
    const headers = { 'Content-Type': 'application/json', ...(auth ? (overrideHeaders || await authHeaders(token)) : {}) }
    return fetch(fullUrl, { method: 'PATCH', headers, body: JSON.stringify(body) })
  }
  const res = auth ? await fetchWithAuth(makeReq) : await makeReq()
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function del(url, params = {}, auth = false) {
  const token = auth ? await getToken() : null
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  const fullUrl = qs ? `${url}?${qs}` : url
  const makeReq = async (overrideHeaders) => {
    const headers = { 'Content-Type': 'application/json', ...(auth ? (overrideHeaders || await authHeaders(token)) : {}) }
    return fetch(fullUrl, { method: 'DELETE', headers })
  }
  const res = auth ? await fetchWithAuth(makeReq) : await makeReq()
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// ── Auth ───────────────────────────────────────────────────────────
export const authApi = {
  login:     (body) => post(`${BASE}/auth-login`,   body),
  signup:    (body) => post(`${BASE}/auth-signup`,  body),
  refresh:   (body) => post(`${BASE}/auth-refresh`, body),
  verifyOTP: (email, token) => post(`${BASE}/auth-signup`, { action: 'verify_otp', email, token }),
  resendOTP: (email)        => post(`${BASE}/auth-signup`, { action: 'resend_otp', email }),
}

// ── Dashboard ──────────────────────────────────────────────────────
export const dashboardApi = {
  getStats: () => get(`${BASE}/dashboard-stats`, {}, true),
}

// ── Projects ───────────────────────────────────────────────────────
export const projectsApi = {
  list:   (params = {}) => get(`${BASE}/projects`, params, true),
  get:    (id)          => get(`${BASE}/projects`, { id }, true),
  create: (body)        => post(`${BASE}/projects`, body, true),
  update: (id, body)    => put(`${BASE}/projects`, { id }, body, true),
  delete: (id)          => del(`${BASE}/projects`, { id }, true),
}

// ── Project Members ────────────────────────────────────────────────
export const membersApi = {
  list:   (projectId)       => get(`${BASE}/project-members`, { projectId }, true),
  invite: (body)            => post(`${BASE}/project-members`, body, true),
  update: (id, body)        => put(`${BASE}/project-members`, { id }, body, true),
  remove: (id)              => del(`${BASE}/project-members`, { id }, true),
}

// ── Project Media ──────────────────────────────────────────────────
export const projectMediaApi = {
  list:    (params = {}) => get(`${BASE}/project-media`, params, true),
  get:     (id)          => get(`${BASE}/project-media`, { id }, true),
  update:  (id, body)    => put(`${BASE}/project-media`, { id }, body, true),
  delete:  (id, hard = false) => del(`${BASE}/project-media`, { id, hard: hard ? 'true' : undefined }, true),
  presign: (body)        => post(`${BASE}/presign`, { ...body, upload_type: 'project_media' }, true),
  confirm: (body)        => post(`${BASE}/media-confirm-upload`, body, true),
  getViewUrl:     (id)   => get(`${BASE}/download`, { media_id: id, type: 'view' }, true),
  getDownloadUrl: (id)   => get(`${BASE}/download`, { media_id: id, type: 'download' }, true),
  getPublicUrl:   (id, shareToken, type = 'view') =>
    get(`${BASE}/download`, { media_id: id, share_token: shareToken, type }),
  getVersions: (id) => get(`${BASE}/project-media`, { id, versions: '1' }, true),
  versionBump: (id, body) => put(`${BASE}/project-media`, { id }, { version_bump: true, ...body }, true),
  getVersionViewUrl: (mediaId, wasabiKey, wasabiThumbKey) =>
    get(`${BASE}/download`, {
      media_id: mediaId, type: 'view',
      ...(wasabiKey     ? { wasabi_key:       wasabiKey }     : {}),
      ...(wasabiThumbKey ? { wasabi_thumb_key: wasabiThumbKey } : {}),
    }, true),
  deleteVersion:      (versionId)        => del(`${BASE}/project-media`, { version_id: versionId }, true),
  updateVersionLabel: (versionId, label) => patch(`${BASE}/project-media`, { version_id: versionId }, { label }, true),
}

// ── Project Files ──────────────────────────────────────────────────
export const projectFilesApi = {
  list:    (params = {}) => get(`${BASE}/project-files`, params, true),
  get:     (id)          => get(`${BASE}/project-files`, { id }, true),
  update:  (id, body)    => put(`${BASE}/project-files`, { id }, body, true),
  delete:  (id, hard = false) => del(`${BASE}/project-files`, { id, hard: hard ? 'true' : undefined }, true),
  presign: (body)        => post(`${BASE}/presign`, { ...body, upload_type: 'project_file' }, true),
  getDownloadUrl: (id)   => get(`${BASE}/download`, { file_id: id }, true),
}

// ── Project Folders (inside a project) ────────────────────────────
export const projectFoldersApi = {
  list:   (projectId)    => get(`${BASE}/project-folders`, { projectId }, true),
  create: (body)         => post(`${BASE}/project-folders`, body, true),
  update: (id, body)     => put(`${BASE}/project-folders`, { id }, body, true),
  delete: (id)           => del(`${BASE}/project-folders`, { id }, true),
}

// ── Project Activity ───────────────────────────────────────────────
export const activityApi = {
  list: (projectId, limit = 20) => get(`${BASE}/project-activity`, { projectId, limit }, true),
  log:  (body)                  => post(`${BASE}/project-activity`, body, true),
}

// ── Drive Files ────────────────────────────────────────────────────
export const driveFilesApi = {
  list:           (params = {}) => get(`${BASE}/drive-files`, params, true),
  update:         (id, body)    => put(`${BASE}/drive-files`, { id }, body, true),
  delete:         (id)          => del(`${BASE}/drive-files`, { id }, true),
  presign:        (body)        => post(`${BASE}/presign`, { ...body, upload_type: 'drive' }, true),
  getDownloadUrl: (id)          => get(`${BASE}/download`, { drive_id: id }, true),
  getStorage:     ()            => get(`${BASE}/drive-files`, { resource: 'storage' }, true),
  // View/thumbnail URLs
  getViewUrl:      (fileId)     => get(`${BASE}/drive-files`, { action: 'view', file_id: fileId }, true),
  getThumbnailUrl: (fileId)     => get(`${BASE}/drive-files`, { action: 'thumbnail', file_id: fileId }, true),
  // PATCH-based mutations
  rename:          (id, name)       => patch(`${BASE}/drive-files`, {}, { action: 'rename', id, name }, true),
  renameFolder:    (id, name)       => patch(`${BASE}/drive-files`, {}, { action: 'rename_folder', id, name }, true),
  move:            (id, folderId)   => patch(`${BASE}/drive-files`, {}, { action: 'move', id, folder_id: folderId || null }, true),
  moveFolder:      (id, parentId)   => patch(`${BASE}/drive-files`, {}, { action: 'move_folder', id, parent_id: parentId || null }, true),
  moveMultiple:    (ids, folderId)  => patch(`${BASE}/drive-files`, {}, { action: 'move_multiple', ids, folder_id: folderId || null }, true),
  trashFile:       (id)             => patch(`${BASE}/drive-files`, {}, { action: 'trash', id }, true),
  trashFolder:     (id)             => patch(`${BASE}/drive-files`, {}, { action: 'trash_folder', id }, true),
  restore:         (id)             => patch(`${BASE}/drive-files`, {}, { action: 'restore', id }, true),
  restoreFolder:   (id)             => patch(`${BASE}/drive-files`, {}, { action: 'restore_folder', id }, true),
  permanentDelete: (id)             => patch(`${BASE}/drive-files`, {}, { action: 'permanent_delete', id }, true),
  emptyTrash:      ()               => patch(`${BASE}/drive-files`, {}, { action: 'empty_trash' }, true),
  createFolder:    (name, parentId) => patch(`${BASE}/drive-files`, {}, { action: 'create_folder', name, parent_id: parentId || null }, true),
  getFolderTree:   ()               => get(`${BASE}/drive-files`, { action: 'folder_tree' }, true),
  getRecent:       (limit = 20)     => get(`${BASE}/drive-files`, { action: 'recent', limit }, true),
  getTrash:        ()               => get(`${BASE}/drive-files`, { action: 'trash' }, true),
  getStorageUsage: ()               => get(`${BASE}/drive-files`, { action: 'storage_usage' }, true),
  search:          (query)          => get(`${BASE}/drive-files`, { action: 'search', query }, true),
  // Multipart upload (for files > 100 MB)
  multipartInitiate:   (body)                  => post(`${BASE}/multipart-upload?action=initiate`, body, true),
  multipartPresignPart:(body)                  => post(`${BASE}/multipart-upload?action=presign-part`, body, true),
  multipartComplete:   (body)                  => post(`${BASE}/multipart-upload?action=complete`, body, true),
  multipartAbort:      (body)                  => post(`${BASE}/multipart-upload?action=abort`, body, true),
}

// ── Drive Folders ──────────────────────────────────────────────────
export const driveFoldersApi = {
  list:   (parentId)     => get(`${BASE}/drive-folders`, parentId ? { parentId } : {}, true),
  create: (body)         => post(`${BASE}/drive-folders`, body, true),
  update: (id, body)     => put(`${BASE}/drive-folders`, { id }, body, true),
  delete: (id)           => del(`${BASE}/drive-folders`, { id }, true),
}

// ── Share Links ────────────────────────────────────────────────────
export const shareLinksApi = {
  list:    (params = {})      => get(`${BASE}/share-links`, params, true),
  create:  (body)             => post(`${BASE}/share-links`, body, true),
  update:  (id, body)         => put(`${BASE}/share-links`, { id }, body, true),
  delete:  (id)               => del(`${BASE}/share-links`, { id }, true),
  resolve: (token, password, subFolderId) => {
    const params = { token }
    if (password) params.password = password
    if (subFolderId) params.subfolder_id = subFolderId
    return get(`${BASE}/share-resolve`, params)
  },
  // Drive-specific helpers
  listForDriveFile:     (driveFileId)            => get(`${BASE}/share-links`, { driveFileId }, true),
  listForDriveFolder:   (driveFolderId)          => get(`${BASE}/share-links`, { driveFolderId }, true),
  createForDriveFile:   (driveFileId,   opts={}) => post(`${BASE}/share-links`, { drive_file_id:   driveFileId,   allow_download: true, ...opts }, true),
  createForDriveFolder: (driveFolderId, opts={}) => post(`${BASE}/share-links`, { drive_folder_id: driveFolderId, allow_download: true, ...opts }, true),
  getOrCreateForDriveFile:   async (fileId,   opts={}) => {
    const res = await get(`${BASE}/share-links`, { driveFileId: fileId }, true)
    if (res.links?.length) return { link: res.links[0], shareUrl: `${window.location.origin}/share/${res.links[0].short_token || res.links[0].token}` }
    return post(`${BASE}/share-links`, { drive_file_id: fileId, allow_download: true, ...opts }, true)
  },
  getOrCreateForDriveFolder: async (folderId, opts={}) => {
    const res = await get(`${BASE}/share-links`, { driveFolderId: folderId }, true)
    if (res.links?.length) return { link: res.links[0], shareUrl: `${window.location.origin}/share/${res.links[0].short_token || res.links[0].token}` }
    return post(`${BASE}/share-links`, { drive_folder_id: folderId, allow_download: true, ...opts }, true)
  },
  // Project-folder-specific helpers
  listForProjectFolder:   (folderId)        => get(`${BASE}/share-links`, { projectFolderId: folderId }, true),
  createForProjectFolder: (folderId, opts={}) => post(`${BASE}/share-links`, { project_folder_id: folderId, allow_download: true, ...opts }, true),
}

// ── User ───────────────────────────────────────────────────────────
export const userApi = {
  getProfile:    ()          => get(`${BASE}/user-profile`, {}, true),
  updateProfile: (data)      => patch(`${BASE}/user-profile`, {}, data, true),
  uploadAvatar:  (body)      => post(`${BASE}/user-avatar`, body, true),
  deleteAvatar:  ()          => del(`${BASE}/user-avatar`, {}, true),
  checkUsername: (username)  => get(`${BASE}/user-profile`, { action: 'check_username', username }),
}

// ── Legacy driveApi alias (used in SharePage / public routes) ──────
export const driveApi = {
  presign:      (body)   => post(`${BASE}/presign`, body, true),
  download:     (params) => get(`${BASE}/download`, params),
  shareResolve: (token)  => get(`${BASE}/share-resolve`, { token }),
}

// ── Legacy mediaApi alias (old media-* routes still referenced) ────
export const mediaApi = {
  // Mapped to new project-media endpoints
  getProjects:   ()          => projectsApi.list(),
  createProject: (body)      => projectsApi.create(body),
  updateProject: (id, body)  => projectsApi.update(id, body),
  deleteProject: (id)        => projectsApi.delete(id),

  getAssets:     (params)    => projectMediaApi.list(params),
  getAsset:      (id)        => projectMediaApi.get(id),
  updateAsset:   (id, body)  => projectMediaApi.update(id, body),
  deleteAsset:   (id)        => projectMediaApi.delete(id),

  getComments:    (assetId)  => get(`${BASE}/media-comments`, { assetId }, true),
  createComment:  (body)     => post(`${BASE}/media-comments`, body, true),
  updateComment:  (id, body) => put(`${BASE}/media-comments`, { id }, body, true),
  deleteComment:  (id)       => del(`${BASE}/media-comments`, { id }, true),

  getShareLinks:   (mediaId) => shareLinksApi.list(mediaId ? { mediaId } : {}),
  createShareLink: (body)    => shareLinksApi.create(body),
  deleteShareLink: (id)      => shareLinksApi.delete(id),
  resolveShare:    (token, password) => shareLinksApi.resolve(token, password),

  getTeam:      (projectId)  => membersApi.list(projectId),
  inviteMember: (body)       => membersApi.invite(body),
  updateMember: (id, body)   => membersApi.update(id, body),
  removeMember: (id)         => membersApi.remove(id),

  mediaPresignUpload:  (body) => projectMediaApi.presign(body),
  mediaConfirmUpload:  (body) => projectMediaApi.confirm(body),
  mediaGetViewUrl:     (id)   => projectMediaApi.getViewUrl(id),
  mediaGetDownloadUrl: (id)   => projectMediaApi.getDownloadUrl(id),
  mediaGetPublicUrl:   (id, shareToken, type) => projectMediaApi.getPublicUrl(id, shareToken, type),
}

// ── Cloudflare Stream ──────────────────────────────────────────────
export const cloudflareApi = {
  getUploadUrl: (fileSize, fileName, mediaId) =>
    post(`${BASE}/cloudflare-stream`, { action: 'get_upload_url', file_size: fileSize, file_name: fileName, media_id: mediaId }, true),

  getStatus: (uid, mediaId) =>
    post(`${BASE}/cloudflare-stream`, { action: 'get_status', uid, media_id: mediaId }, true),

  deleteVideo: (uid) =>
    post(`${BASE}/cloudflare-stream`, { action: 'delete', uid }, true),

  ingestFromUrl: (mediaId) =>
    post(`${BASE}/cloudflare-stream`, { action: 'ingest_from_url', media_id: mediaId }, true),
}

// ── Production Management ──────────────────────────────────────────
const PROD = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/production`
export const productionApi = {
  // Seed defaults for new project
  seed:           (projectId, presetType) => post(`${PROD}?resource=seed&project_id=${projectId}`, { preset_type: presetType || 'blank' }, true),

  // Statuses
  listStatuses:   (projectId)      => get(PROD, { resource: 'statuses', project_id: projectId }, true),
  createStatus:   (projectId, body) => post(`${PROD}?resource=statuses&project_id=${projectId}`, body, true),
  updateStatus:   (id, body)       => put(`${PROD}?resource=statuses&id=${id}`, {}, body, true),
  deleteStatus:   (id)             => del(PROD, { resource: 'statuses', id }, true),

  // Scenes
  listScenes:     (projectId)      => get(PROD, { resource: 'scenes', project_id: projectId }, true),
  createScene:    (projectId, body) => post(`${PROD}?resource=scenes&project_id=${projectId}`, body, true),
  updateScene:    (id, body)       => put(`${PROD}?resource=scenes&id=${id}`, {}, body, true),
  deleteScene:    (id)             => del(PROD, { resource: 'scenes', id }, true),

  // Columns
  listColumns:    (projectId)      => get(PROD, { resource: 'columns', project_id: projectId }, true),
  createColumn:   (projectId, body) => post(`${PROD}?resource=columns&project_id=${projectId}`, body, true),
  updateColumn:   (id, body)       => put(`${PROD}?resource=columns&id=${id}`, {}, body, true),
  deleteColumn:   (id)             => del(PROD, { resource: 'columns', id }, true),

  // Shots
  listShots:      (projectId, params = {}) => get(PROD, { resource: 'shots', project_id: projectId, ...params }, true),
  getShot:        (id)             => get(PROD, { resource: 'shots', id }, true),
  createShot:     (projectId, body) => post(`${PROD}?resource=shots&project_id=${projectId}`, body, true),
  updateShot:     (id, body)       => patch(`${PROD}?resource=shots&id=${id}`, {}, body, true),
  deleteShot:     (id)             => del(PROD, { resource: 'shots', id }, true),

  // Shot Comments
  listComments:   (shotId)         => get(PROD, { resource: 'shot_comments', shot_id: shotId }, true),
  createComment:  (shotId, body)   => post(`${PROD}?resource=shot_comments&shot_id=${shotId}`, body, true),
  deleteComment:  (shotId, id)     => del(PROD, { resource: 'shot_comments', shot_id: shotId, id }, true),

  // Team members
  getProjectMembers: (projectId) =>
    get(PROD, { resource: 'project_members_list', project_id: projectId }, true),

  // Shots with media/thumbnails
  listShotsWithMedia: (projectId, filters = {}) =>
    get(PROD, { resource: 'shots_with_media', project_id: projectId, ...filters }, true),

  // Save which built-in columns (shot, status, assigned_to) are hidden
  saveBuiltinColVisibility: (projectId, hiddenCols) =>
    patch(`${PROD}?resource=project_view&project_id=${projectId}`, {}, { hidden_builtin_cols: hiddenCols }, true),

  // Shot assets (legacy)
  linkAsset:   (shotId, body) => post(`${PROD}?resource=shot_assets&shot_id=${shotId}`, body, true),
  unlinkAsset: (id)           => del(PROD, { resource: 'shot_assets', id }, true),

  // Bulk create shots (scene grouping)
  bulkCreateShots: (projectId, sceneId, shots) =>
    post(`${PROD}?resource=bulk_create_shots&project_id=${projectId}`, { scene_id: sceneId, shots }, true),

  // Link / unlink media (one file per shot)
  linkMedia: (shotId, mediaId, projectId) =>
    post(`${PROD}?resource=link_media`, { shot_id: shotId, media_id: mediaId, project_id: projectId }, true),
  unlinkMedia: (shotId) =>
    post(`${PROD}?resource=unlink_media`, { shot_id: shotId }, true),

  // All project media with linking status (for MediaBrowserModal)
  getProjectMedia: (projectId) =>
    get(PROD, { resource: 'project_media_list', project_id: projectId }, true),

  // Assignees (team members + custom names)
  getAssignees: (projectId) =>
    get(PROD, { resource: 'custom_assignees', project_id: projectId }, true),
  addCustomAssignee: (projectId, name) =>
    post(`${PROD}?resource=custom_assignees&project_id=${projectId}`, { name }, true),
  removeCustomAssignee: (id) =>
    del(PROD, { resource: 'custom_assignees', id }, true),

  // Update shot assignee
  updateShotAssignee: (shotId, assignedTo, customAssignee) =>
    patch(`${PROD}?resource=update_shot&shot_id=${shotId}`, {}, { assigned_to: assignedTo || null, custom_assignee: customAssignee || null }, true),
}

// ── Utility ────────────────────────────────────────────────────────
export function formatSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function totalShareSize(items = []) {
  return items.reduce((sum, item) => sum + (item.file_size || 0), 0)
}

/**
 * Legacy fetch helper — prefer typed API objects above for new code.
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

function legacyPathToEdge(path) {
  const [pathname, qs] = path.split('?')
  const query = qs ? `?${qs}` : ''
  const map = {
    '/api/presign':       `${BASE}/presign`,
    '/api/download':      `${BASE}/download`,
    '/api/auth/login':    `${BASE}/auth-login`,
    '/api/auth/signup':   `${BASE}/auth-signup`,
    '/api/auth/refresh':  `${BASE}/auth-refresh`,
    '/api/user/profile':  `${BASE}/user-profile`,
    '/api/user/avatar':   `${BASE}/user-avatar`,
    '/api/user/files':    `${BASE}/drive-files`,
    '/api/user/folders':  `${BASE}/drive-folders`,
    '/api/media/projects':`${BASE}/projects`,
    '/api/media/assets':  `${BASE}/project-media`,
    '/api/media/comments':`${BASE}/media-comments`,
    '/api/media/share':   `${BASE}/share-links`,
    '/api/media/team':    `${BASE}/project-members`,
  }
  if (pathname.startsWith('/api/media/share/')) {
    const token = pathname.split('/api/media/share/')[1]
    return `${BASE}/share-resolve?token=${token}${qs ? '&' + qs : ''}`
  }
  if (pathname.startsWith('/api/share/')) {
    const token = pathname.split('/api/share/')[1]
    return `${BASE}/share-resolve?token=${token}${qs ? '&' + qs : ''}`
  }
  return (map[pathname] || `${BASE}${pathname}`) + query
}
