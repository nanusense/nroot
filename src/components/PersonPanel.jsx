import { useMemo } from 'react'

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

export default function PersonPanel({ personId, nodes, edges, onClose, onFocus, onNavigate, isFocused }) {
  const person = nodes.find(n => n.id === personId)
  if (!person) return null

  const isSib = e =>
    e.data?.isSibling ||
    (e.sourceHandle === 'right-source' && e.targetHandle === 'left-target' && !!e.style?.strokeDasharray)
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

  const { name, yearOfBirth } = person.data

  return (
    <div className="person-panel">
      <div className="person-panel__header">
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
            {rels.spouses.map(id => (
              <PersonLink key={id} id={id} nodes={nodes} onNavigate={onNavigate} />
            ))}
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
