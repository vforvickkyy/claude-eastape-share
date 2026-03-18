import { useState, useEffect } from 'react'

const CACHE_KEY = 'ets_player_settings'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export const PLAYER_DEFAULTS = {
  player_accent_color:      '#7c3aed',
  player_autoplay:          'false',
  player_loop:              'false',
  player_muted:             'false',
  player_volume:            '80',
  player_preload:           'metadata',
  player_playback_rates:    '0.5,0.75,1,1.25,1.5,2',
  player_show_watermark:    'false',
  player_watermark_text:    'Eastape',
  player_watermark_position:'top-right',
  player_big_play_button:   'true',
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    if (cached.timestamp && Date.now() - cached.timestamp < CACHE_TTL && cached.data) {
      return cached.data
    }
  } catch {}
  return null
}

export function invalidatePlayerSettingsCache() {
  localStorage.removeItem(CACHE_KEY)
}

export default function usePlayerSettings() {
  const [settings, setSettings] = useState(() => readCache() || PLAYER_DEFAULTS)

  useEffect(() => {
    async function fetch_() {
      // Skip if cache is fresh
      if (readCache()) return
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/platform_settings?key=like.player_%25&select=key,value`
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        })
        if (!res.ok) return
        const rows = await res.json()
        if (!Array.isArray(rows)) return
        const merged = { ...PLAYER_DEFAULTS }
        rows.forEach(r => { merged[r.key] = r.value })
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: merged, timestamp: Date.now() }))
        setSettings(merged)
      } catch {}
    }
    fetch_()
  }, [])

  return settings
}
