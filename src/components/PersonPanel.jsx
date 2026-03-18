import { useMemo, useRef, useCallback, useState, useEffect } from 'react'

function PersonLink({ id, nodes, onNavigate }) {
  const person = nodes.find(n => n.id === id)
  if (!person) return null
  return (
    <button className="person-panel__link" onClick={() => onNavigate(id)}>
      <span className="person-panel__link-name">{person.data.name}</span>
      {person.data.yearOfBirth && (
        <span className="person-panel__link-year">b. {person.data.yearOfBirth}</span>
      )}
    </button>
  )
}

export default function PersonPanel({ personId, nodes, edges, onClose, onFocus, onNavigate, isFocused, onUpdateEdge }) {
  const person = nodes.find(n => n.id === personId)
  const [menuOpenFor, setMenuOpenFor] = useState(null)

  // Close mini-menu on outside click
  useEffect(() => {
    if (!menuOpenFor) return
    const handler = (e) => {
      if (!e.target.closest('.person-panel__spouse-menu-wrap')) setMenuOpenFor(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenFor])

  // Swipe-down-to-close on mobile
  const touchStartY = useRef(null)
  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY
  }, [])
  const handleTouchEnd = useCallback((e) => {
    if (touchStartY.current === null) return
    const delta = e.changedTouches[0].clientY - touchStartY.current
    if (delta > 60) onClose()
    touchStartY.current = null
  }, [onClose])

  if (!person) return null

  const isSib = e =>
    e.data?.isSibling ||
    (e.sourceHandle === 'right-source' && e.targetHandle === 'left-target' && !!e.style?.strokeDasharray && !e.data?.isDivorced)
  const isSpouse = e =>
    e.sourceHandle === 'right-source' && e.targetHandle === 'left-target' && !isSib(e)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const rels = useMemo(() => {
    const parents  = []
    const children = []
    const spouses  = []
    const siblings = new Set()

    edges.forEach(e => {
      if (e.data?.isSpouseChild) return

      if (isSib(e)) {
        if (e.source === personId) siblings.add(e.target)
        if (e.target === personId) siblings.add(e.source)
        return
      }

      if (isSpouse(e)) {
        if (e.source === personId) spouses.push(e.target)
        if (e.target === personId) spouses.push(e.source)
        return
      }

      if (e.sourceHandle === 'bottom-source') {
        if (e.source === personId) children.push(e.target)
        if (e.target === personId) parents.push(e.source)
      }
    })

    return { parents, children, spouses, siblings: [...siblings] }
  }, [personId, edges]) // eslint-disable-line react-hooks/exhaustive-deps

  const getSpouseEdge = (spouseId) =>
    edges.find(e =>
      isSpouse(e) &&
      ((e.source === personId && e.target === spouseId) ||
       (e.source === spouseId && e.target === personId))
    )

  const toggleDivorce = (spouseId) => {
    const edge = getSpouseEdge(spouseId)
    if (!edge || !onUpdateEdge) return
    const isDivorced = edge.data?.isDivorced
    onUpdateEdge(edge.id, isDivorced
      ? { label: 'Spouse',   style: { stroke: '#e0728a', strokeWidth: 2 },                            data: { isDivorced: false } }
      : { label: 'Divorced', style: { stroke: '#9e9e9e', strokeWidth: 1.5, strokeDasharray: '5 4' }, data: { isDivorced: true  } }
    )
    setMenuOpenFor(null)
  }

  const { name, yearOfBirth, photo } = person.data

  return (
    <div className="person-panel">
      {/* Drag handle — visible on mobile, triggers swipe-down-to-close */}
      <div
        className="person-panel__drag-handle"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <span className="person-panel__drag-pill" />
      </div>
      <div className="person-panel__header">
        {photo && (
          <img src={photo} alt={name} className="person-panel__photo" />
        )}
        <div className="person-panel__identity">
          <h2 className="person-panel__name">{name}</h2>
          {yearOfBirth
            ? <p className="person-panel__year">b. {yearOfBirth}</p>
            : <p className="person-panel__year person-panel__year--missing">No birth year</p>
          }
        </div>
        <button className="person-panel__close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="person-panel__body">
        {rels.parents.length > 0 && (
          <section className="person-panel__section">
            <h3 className="person-panel__section-title">Parents</h3>
            {rels.parents.map(id => (
              <PersonLink key={id} id={id} nodes={nodes} onNavigate={onNavigate} />
            ))}
          </section>
        )}

        {rels.spouses.length > 0 && (
          <section className="person-panel__section">
            <h3 className="person-panel__section-title">Spouse</h3>
            {rels.spouses.map(id => {
              const spouseEdge = getSpouseEdge(id)
              const isDivorced = spouseEdge?.data?.isDivorced
              return (
                <div key={id} className="person-panel__spouse-row">
                  <PersonLink id={id} nodes={nodes} onNavigate={onNavigate} />
                  {isDivorced && <span className="person-panel__divorced-tag">divorced</span>}
                  {onUpdateEdge && (
                    <div className="person-panel__spouse-menu-wrap">
                      <button
                        className="person-panel__spouse-menu-btn"
                        onClick={() => setMenuOpenFor(menuOpenFor === id ? null : id)}
                        title="Relationship options"
                      >···</button>
                      {menuOpenFor === id && (
                        <div className="person-panel__spouse-mini-menu">
                          <button onClick={() => toggleDivorce(id)}>
                            {isDivorced ? 'Restore as spouse' : 'Mark as divorced'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}

        {rels.children.length > 0 && (
          <section className="person-panel__section">
            <h3 className="person-panel__section-title">Children ({rels.children.length})</h3>
            {rels.children.map(id => (
              <PersonLink key={id} id={id} nodes={nodes} onNavigate={onNavigate} />
            ))}
          </section>
        )}

        {rels.siblings.length > 0 && (
          <section className="person-panel__section">
            <h3 className="person-panel__section-title">Siblings ({rels.siblings.length})</h3>
            {rels.siblings.map(id => (
              <PersonLink key={id} id={id} nodes={nodes} onNavigate={onNavigate} />
            ))}
          </section>
        )}

        {rels.parents.length === 0 && rels.spouses.length === 0 &&
         rels.children.length === 0 && rels.siblings.length === 0 && (
          <p className="person-panel__empty">No connections recorded yet.</p>
        )}
      </div>

      <div className="person-panel__footer">
        <button
          className={`btn ${isFocused ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => onFocus(isFocused ? null : personId)}
        >
          {isFocused ? 'Clear focus' : 'Focus branch'}
        </button>
      </div>
    </div>
  )
}
