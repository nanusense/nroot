import { useState, useEffect, useRef } from 'react'

export default function PersonSearch({ nodes, value, onChange, placeholder = 'Search by name…', autoFocus }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(!!autoFocus)
  const containerRef = useRef(null)

  const selected = nodes.find(n => n.id === value)
  const filtered = query.trim()
    ? nodes.filter(n => n.data.name.toLowerCase().includes(query.toLowerCase()))
    : nodes

  const label = n => `${n.data.name}${n.data.yearOfBirth ? ` · b. ${n.data.yearOfBirth}` : ''}`

  useEffect(() => { if (autoFocus) setOpen(true) }, [autoFocus])

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (id) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    if (e.key === 'Enter' && filtered.length === 1) { e.preventDefault(); handleSelect(filtered[0].id) }
  }

  return (
    <div className="psearch" ref={containerRef}>
      <input
        className="modal__input psearch__input"
        type="text"
        value={open ? query : (selected ? label(selected) : '')}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={selected ? label(selected) : placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {open && (
        <ul className="psearch__list">
          {filtered.length === 0 && (
            <li className="psearch__empty">No match</li>
          )}
          {filtered.map(n => (
            <li
              key={n.id}
              className={`psearch__item${n.id === value ? ' psearch__item--active' : ''}`}
              onMouseDown={() => handleSelect(n.id)}
            >
              <span className="psearch__name">{n.data.name}</span>
              {n.data.yearOfBirth && <span className="psearch__year">b. {n.data.yearOfBirth}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
