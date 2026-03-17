import React from 'react'
import { Wrench } from '@phosphor-icons/react'

export default function MaintenancePage({ message, eta }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 24, textAlign: 'center'
    }}>
      <div style={{ fontSize: 48 }}><Wrench size={64} weight="duotone" color="#f97316" /></div>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Under Maintenance</h1>
      <p style={{ color: 'var(--t2)', maxWidth: 400 }}>
        {message || "We're performing scheduled maintenance. We'll be back shortly."}
      </p>
      {eta && <p style={{ color: 'var(--t3)', fontSize: 13 }}>Estimated back: {eta}</p>}
      <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>— Eastape Team</p>
    </div>
  )
}
