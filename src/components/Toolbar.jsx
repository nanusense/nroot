import { useRef, useCallback, useState } from 'react'
import { useReactFlow } from '@xyflow/react'

export default function Toolbar({ nodes, edges, onAddRoot, onAutoArrange, onExport, onImport, importJSON, isAdmin, onUnlockAdmin, onLockAdmin }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const importRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState(false)

  const handleImportChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const data = await importJSON(file)
        if (window.confirm('Replace the current tree with the imported data?')) {
          onImport(data)
        }
      } catch {
        alert('Failed to import: invalid file format.')
      } finally {
        e.target.value = ''
      }
    },
    [onImport, importJSON]
  )

  const closeMenu = () => setMenuOpen(false)

  const handlePinSubmit = useCallback((e) => {
    e.preventDefault()
    const ok = onUnlockAdmin(pinValue)
    if (ok) {
      setPinOpen(false)
      setPinValue('')
      setPinError(false)
    } else {
      setPinError(true)
      setPinValue('')
    }
  }, [pinValue, onUnlockAdmin])

  const openPinDialog = () => {
    setPinValue('')
    setPinError(false)
    setPinOpen(true)
  }

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__icon">🔗</span>
        <span className="toolbar__title">NRoot</span>
        <span className="toolbar__count">{nodes.length} {nodes.length === 1 ? 'person' : 'people'}</span>
      </div>

      {/* Desktop actions */}
      <div className="toolbar__actions">
        <button className="btn btn--primary" onClick={onAddRoot}>
          + Add Person
        </button>

        <button className="btn btn--secondary" onClick={onAutoArrange} title="Auto-arrange nodes">
          Auto-arrange
        </button>

        <div className="toolbar__divider" />

        <button className="btn btn--ghost" onClick={onExport} title="Export tree as JSON">
          Export
        </button>

        <button
          className="btn btn--ghost"
          onClick={() => importRef.current?.click()}
          title="Import tree from JSON"
        >
          Import
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportChange}
          style={{ display: 'none' }}
        />

        <div className="toolbar__divider" />

        <div className="toolbar__zoom">
          <button className="btn btn--icon" onClick={() => zoomIn()} title="Zoom in">+</button>
          <button className="btn btn--icon" onClick={() => fitView()} title="Fit view">⊡</button>
          <button className="btn btn--icon" onClick={() => zoomOut()} title="Zoom out">−</button>
        </div>

        <div className="toolbar__divider" />

        {/* Admin lock/unlock */}
        {isAdmin ? (
          <button
            className="btn btn--icon toolbar__admin-btn toolbar__admin-btn--active"
            onClick={onLockAdmin}
            title="Admin mode active — click to lock"
          >
            🔓
          </button>
        ) : (
          <button
            className="btn btn--icon toolbar__admin-btn"
            onClick={openPinDialog}
            title="Admin unlock"
          >
            🔒
          </button>
        )}
      </div>

      {/* Mobile hamburger */}
      <button
        className="toolbar__hamburger"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={menuOpen}
      >
        <span /><span /><span />
      </button>

      {/* Mobile dropdown */}
      {menuOpen && (
        <>
          <div className="toolbar__overlay" onClick={closeMenu} />
          <div className="toolbar__mobile-menu">
            <button className="btn btn--primary" onClick={() => { onAddRoot(); closeMenu() }}>
              + Add Person
            </button>
            <button className="btn btn--secondary" onClick={() => { onAutoArrange(); closeMenu() }}>
              Auto-arrange
            </button>
            <div className="toolbar__divider" />
            <button className="btn btn--ghost" onClick={() => { onExport(); closeMenu() }}>
              Export
            </button>
            <button className="btn btn--ghost" onClick={() => { importRef.current?.click(); closeMenu() }}>
              Import
            </button>
            <div className="toolbar__divider" />
            <div className="toolbar__zoom">
              <button className="btn btn--icon" onClick={() => { zoomIn(); closeMenu() }}>+</button>
              <button className="btn btn--icon" onClick={() => { fitView(); closeMenu() }}>⊡</button>
              <button className="btn btn--icon" onClick={() => { zoomOut(); closeMenu() }}>−</button>
            </div>
            <div className="toolbar__divider" />
            {isAdmin ? (
              <button className="btn btn--ghost" onClick={() => { onLockAdmin(); closeMenu() }}>
                🔓 Lock admin
              </button>
            ) : (
              <button className="btn btn--ghost" onClick={() => { openPinDialog(); closeMenu() }}>
                🔒 Admin login
              </button>
            )}
          </div>
        </>
      )}

      {/* PIN dialog */}
      {pinOpen && (
        <div className="pin-overlay" onClick={() => setPinOpen(false)}>
          <form className="pin-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handlePinSubmit}>
            <h3 className="pin-dialog__title">Admin Access</h3>
            <input
              className={`pin-dialog__input${pinError ? ' pin-dialog__input--error' : ''}`}
              type="password"
              placeholder="Enter PIN"
              value={pinValue}
              onChange={(e) => { setPinValue(e.target.value); setPinError(false) }}
              autoFocus
            />
            {pinError && <p className="pin-dialog__error">Incorrect PIN</p>}
            <div className="pin-dialog__actions">
              <button type="submit" className="btn btn--primary">Unlock</button>
              <button type="button" className="btn btn--ghost" onClick={() => setPinOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </header>
  )
}
