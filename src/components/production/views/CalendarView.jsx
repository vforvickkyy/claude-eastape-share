import React, { useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarView({ shots, statuses, onShotUpdate }) {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Build calendar grid
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // Map shots with due_date to day numbers
  const shotsByDay = {}
  shots.forEach(shot => {
    if (!shot.due_date) return
    const d = new Date(shot.due_date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!shotsByDay[day]) shotsByDay[day] = []
      shotsByDay[day].push(shot)
    }
  })

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

  return (
    <div className="calendar-view">
      <div className="calendar-nav">
        <button className="icon-btn" onClick={prevMonth}><CaretLeft size={15} /></button>
        <span className="calendar-month-label">{MONTH_NAMES[month]} {year}</span>
        <button className="icon-btn" onClick={nextMonth}><CaretRight size={15} /></button>
      </div>

      <div className="calendar-grid">
        {DOW.map(d => (
          <div key={d} className="calendar-dow">{d}</div>
        ))}
        {cells.map((day, i) => {
          const isToday = day && year === today.getFullYear() && month === today.getMonth() && day === today.getDate()
          const dayShotsList = day ? (shotsByDay[day] || []) : []
          return (
            <div key={i} className={`calendar-cell ${day ? '' : 'empty'} ${isToday ? 'today' : ''}`}>
              {day && <span className="calendar-day-num">{day}</span>}
              {dayShotsList.slice(0, 3).map(shot => {
                const st = statuses.find(s => s.id === shot.status_id)
                return (
                  <div
                    key={shot.id}
                    className="calendar-shot-chip"
                    style={{ background: st ? st.color + '33' : 'var(--surface2)', borderLeft: `3px solid ${st?.color || 'var(--border)'}` }}
                    title={shot.title}
                  >
                    {shot.title}
                  </div>
                )
              })}
              {dayShotsList.length > 3 && (
                <div className="calendar-more">+{dayShotsList.length - 3} more</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
