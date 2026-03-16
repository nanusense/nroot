import { useState, useEffect, useCallback } from 'react'

const DIR_META = {
  above: { label: 'Adding Parent ↑' },
  below: { label: 'Adding Child ↓' },
  right: { label: 'Adding Spouse →' },
  left:  { label: 'Adding Sibling ←' },
  '':    { label: 'Add Person' },
}

const DIRECTION_OPTIONS = [
  { value: 'above', label: '↑  Parent' },
  { value: 'below', label: '↓  Child' },
  { value: 'right', label: '→  Spouse' },
  { value: 'left',  label: '←  Sibling' },
]

const RELATION_OPTIONS = {
  above: ['Father', 'Mother', 'Grandfather', 'Grandmother', 'Stepfather', 'Stepmother', 'Guardian'],
  below: ['Son', 'Daughter', 'Stepson', 'Stepdaughter', 'Adopted Son', 'Adopted Daughter'],
  right: ['Wife', 'Husband', 'Partner'],
  left:  ['Brother', 'Sister', 'Half-Brother', 'Half-Sister', 'Twin Brother', 'Twin Sister', 'Cousin'],
  '':    [],
}

export default function AddPersonModal({ isOpen, onClose, onSubmit, onLink, sourceNode, direction = '', allNodes }) {
  const [linkMode, setLinkMode] = useState(false)   // false = new person, true = link existing
  const [name, setName] = useState('')
  const [yearOfBirth, setYearOfBirth] = useState('')
  const [relation, setRelation] = useState('')
  const [customRelation, setCustomRelation] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [localDir, setLocalDir] = useState(direction)
  const [existingTargetId, setExistingTargetId] = useState('')

  useEffect(() => {
    if (isOpen) {
      setLinkMode(false)
      setName('')
      setYearOfBirth('')
      setRelation('')
      setCustomRelation('')
      setSourceId(sourceNode?.id ?? '')
      setLocalDir(direction)
      setExistingTargetId('')
    }
  }, [isOpen, sourceNode, direction])

  const handleDirChange = useCallback((val) => {
    setLocalDir(val)
    setRelation('')
    setCustomRelation('')
  }, [])

  const handleSourceChange = useCallback((val) => {
    setSourceId(val)
    if (!direction) { setRelation(''); setCustomRelation('') }
  }, [direction])

  const handleLinkModeToggle = useCallback((val) => {
    setLinkMode(val)
    setRelation('')
    setCustomRelation('')
    setExistingTargetId('')
  }, [])

  const meta = DIR_META[direction] ?? DIR_META['']
  const relOptions = RELATION_OPTIONS[localDir] ?? []
  const showDirPicker = !direction && !!sourceId

  // Nodes that can be linked — exclude the current source node
  const linkableNodes = allNodes.filter((n) => n.id !== sourceId)

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault()
      const finalRelation = relation === '__other__' ? customRelation.trim() : relation

      if (linkMode) {
        if (!existingTargetId) return
        onLink?.({
          sourceId: sourceId || null,
          targetId: existingTargetId,
          direction: localDir || 'right',
          relation: finalRelation,
        })
      } else {
        if (!name.trim()) return
        onSubmit({
          name: name.trim(),
          yearOfBirth: yearOfBirth ? parseInt(yearOfBirth, 10) : '',
          relation: finalRelation,
          sourceId: sourceId || null,
          direction: localDir || 'below',
        })
      }
      onClose()
    },
    [linkMode, name, yearOfBirth, relation, customRelation, sourceId, localDir,
     existingTargetId, onSubmit, onLink, onClose]
  )

  const handleBackdropClick = useCallback(
    (e) => { if (e.target === e.currentTarget) onClose() },
    [onClose]
  )

  const canSubmit = linkMode ? !!existingTargetId : !!name.trim()

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add person">
        <h2 className="modal__title">
          {sourceNode ? meta.label : 'Add Person'}
        </h2>
        {sourceNode && (
          <p className="modal__subtitle">connected to <strong>{sourceNode.data.name}</strong></p>
        )}

        {/* Mode toggle — only shown when there's at least one other node to link to */}
        {sourceNode && linkableNodes.length > 0 && (
          <div className="modal__mode-toggle">
            <button
              type="button"
              className={`modal__mode-btn${!linkMode ? ' modal__mode-btn--active' : ''}`}
              onClick={() => handleLinkModeToggle(false)}
            >
              New person
            </button>
            <button
              type="button"
              className={`modal__mode-btn${linkMode ? ' modal__mode-btn--active' : ''}`}
              onClick={() => handleLinkModeToggle(true)}
            >
              Link existing
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal__form">

          {!linkMode ? (
            <>
              <label className="modal__label">
                Name <span className="modal__required">*</span>
                <input
                  className="modal__input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                  required
                />
              </label>

              <label className="modal__label">
                Year of Birth
                <input
                  className="modal__input"
                  type="number"
                  value={yearOfBirth}
                  onChange={(e) => setYearOfBirth(e.target.value)}
                  placeholder="e.g. 1985"
                  min="1"
                  max={new Date().getFullYear()}
                />
              </label>

              {allNodes.length > 0 && (
                <label className="modal__label">
                  Connect to
                  <select
                    className="modal__input modal__select"
                    value={sourceId}
                    onChange={(e) => handleSourceChange(e.target.value)}
                  >
                    <option value="">— No connection (standalone) —</option>
                    {allNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.data.name}{n.data.yearOfBirth ? ` (b. ${n.data.yearOfBirth})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <label className="modal__label">
              Person to link
              <select
                className="modal__input modal__select"
                value={existingTargetId}
                onChange={(e) => setExistingTargetId(e.target.value)}
                autoFocus
              >
                <option value="">— Select person —</option>
                {linkableNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data.name}{n.data.yearOfBirth ? ` (b. ${n.data.yearOfBirth})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Direction picker — only when opened from toolbar after picking a person */}
          {showDirPicker && !linkMode && (
            <label className="modal__label">
              Position
              <select
                className="modal__input modal__select"
                value={localDir}
                onChange={(e) => handleDirChange(e.target.value)}
              >
                <option value="">— Select position —</option>
                {DIRECTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}

          {/* Direction picker for link mode */}
          {linkMode && sourceId && (
            <label className="modal__label">
              Relationship
              <select
                className="modal__input modal__select"
                value={localDir}
                onChange={(e) => handleDirChange(e.target.value)}
              >
                <option value="">— Select type —</option>
                {DIRECTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}

          {/* Relation label dropdown */}
          {(sourceId || linkMode) && localDir && (
            <label className="modal__label">
              Relation
              <select
                className="modal__input modal__select"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
              >
                <option value="">— Select relation —</option>
                {relOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="__other__">Other…</option>
              </select>
            </label>
          )}

          {relation === '__other__' && (
            <label className="modal__label">
              Custom relation
              <input
                className="modal__input"
                type="text"
                value={customRelation}
                onChange={(e) => setCustomRelation(e.target.value)}
                placeholder="e.g. Uncle, Aunt, Godfather…"
                autoFocus
              />
            </label>
          )}

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
              {linkMode ? 'Link' : 'Add to Tree'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
