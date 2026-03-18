import { useState, useCallback, Fragment } from 'react'
import PersonSearch from './PersonSearch'

const isSib = e =>
  e.data?.isSibling ||
  (e.sourceHandle === 'right-source' && e.targetHandle === 'left-target' && !!e.style?.strokeDasharray)
const isSpouse = e =>
  e.sourceHandle === 'right-source' && e.targetHandle === 'left-target' && !isSib(e)

function bfs(startId, endId, edges) {
  if (startId === endId) return []
  const visited = new Set([startId])
  const queue = [{ id: startId, path: [] }]

  while (queue.length) {
    const { id, path } = queue.shift()
    for (const e of edges) {
      if (e.data?.isSpouseChild) continue
      let nextId = null
      let rel = null

      if (e.source === id && !visited.has(e.target)) {
        nextId = e.target
        if      (isSib(e))                             rel = 'sibling of'
        else if (isSpouse(e))                          rel = 'spouse of'
        else if (e.sourceHandle === 'bottom-source')   rel = 'parent of'
        else continue
      } else if (e.target === id && !visited.has(e.source)) {
        nextId = e.source
        if      (isSib(e))                             rel = 'sibling of'
        else if (isSpouse(e))                          rel = 'spouse of'
        else if (e.sourceHandle === 'bottom-source')   rel = 'child of'
        else continue
      }

      if (nextId && rel) {
        const newPath = [...path, { from: id, to: nextId, rel }]
        if (nextId === endId) return newPath
        visited.add(nextId)
        queue.push({ id: nextId, path: newPath })
      }
    }
  }
  return null
}

export default function RelationshipFinder({ isOpen, onClose, nodes, edges }) {
  const [fromId, setFromId] = useState('')
  const [toId,   setToId]   = useState('')
  const [searched, setSearched] = useState(false)
  const [path,     setPath]     = useState(null)

  const handleFind = useCallback(() => {
    setSearched(true)
    setPath(bfs(fromId, toId, edges))
  }, [fromId, toId, edges])

  const handleClear = useCallback(() => {
    setFromId('')
    setToId('')
    setSearched(false)
    setPath(null)
  }, [])

  const handleBackdrop = useCallback(e => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  const getName = id => nodes.find(n => n.id === id)?.data.name ?? '?'

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal rfinder" role="dialog" aria-modal="true" aria-label="Find connection">
        <h2 className="modal__title">How are they connected?</h2>
        <p className="modal__subtitle">Find the relationship path between any two people.</p>

        <div className="rfinder__row">
          <label className="modal__label">
            Person A
            <PersonSearch
              nodes={nodes}
              value={fromId}
              onChange={id => { setFromId(id); setSearched(false) }}
              placeholder="Search name…"
            />
          </label>
          <label className="modal__label">
            Person B
            <PersonSearch
              nodes={nodes}
              value={toId}
              onChange={id => { setToId(id); setSearched(false) }}
              placeholder="Search name…"
            />
          </label>
        </div>

        <div className="modal__actions rfinder__actions">
          <button type="button" className="btn btn--ghost" onClick={handleClear} disabled={!fromId && !toId}>
            Clear
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Close</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleFind}
            disabled={!fromId || !toId || fromId === toId}
          >
            Find
          </button>
        </div>

        {searched && (
          <div className="rfinder__result">
            {path === null ? (
              <p className="rfinder__none">
                No connection found between <strong>{getName(fromId)}</strong> and <strong>{getName(toId)}</strong>.
              </p>
            ) : path.length === 0 ? (
              <p className="rfinder__same">That&apos;s the same person!</p>
            ) : (
              <>
                <div className="rfinder__chain">
                  <span className="rfinder__node rfinder__node--endpoint">{getName(path[0].from)}</span>
                  {path.map((step, i) => (
                    <Fragment key={i}>
                      <div className={`rfinder__connector rfinder__connector--${step.rel.split(' ')[0]}`}>
                        <div className="rfinder__cline" />
                        <span className="rfinder__badge">is {step.rel}</span>
                        <div className="rfinder__cline rfinder__cline--arrow" />
                      </div>
                      <span className={`rfinder__node${i === path.length - 1 ? ' rfinder__node--endpoint' : ''}`}>
                        {getName(step.to)}
                      </span>
                    </Fragment>
                  ))}
                </div>
                <p className="rfinder__hops">
                  {path.length === 1
                    ? 'Direct connection'
                    : `${path.length} step${path.length > 1 ? 's' : ''} apart`}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
