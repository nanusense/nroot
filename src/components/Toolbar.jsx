import { useRef, useCallback, useState, useMemo, useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'

export default function Toolbar({ nodes, edges, onAddRoot, onAutoArrange, onExport, onImport, importJSON, isAdmin, onUnlockAdmin, onLockAdmin, onHowTo, onFindConnection, onSearchSelect, theme, onThemeToggle }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const importRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const mobileSearchInputRef = useRef(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef(null)
  const searchInputRef = useRef(null)

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return nodes
      .filter(n => n.data?.name?.toLowerCase().includes(q))
      .slice(0, 10)
      .sort((a, b) => {
        // Exact match first, then starts-with, then contains
        const an = a.data.name.toLowerCase()
        const bn = b.data.name.toLowerCase()
        if (an === q) return -1
        if (bn === q) return 1
        if (an.startsWith(q) && !bn.startsWith(q)) return -1
        if (bn.startsWith(q) && !an.startsWith(q)) return 1
        return an.localeCompare(bn)
      })
  }, [searchQuery, nodes])

  const handleSearchSelect = useCallback((nodeId) => {
    onSearchSelect?.(nodeId)
    setSearchQuery('')
    setSearchOpen(false)
  }, [onSearchSelect])

  const handleSearchInput = useCallback((e) => {
    setSearchQuery(e.target.value)
    setSearchOpen(true)
  }, [])

  // Close search dropdown when clicking outside
  useEffect(() => {
    if (!searchOpen) return
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [searchOpen])

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

  const SearchBox = (
    <div className="toolbar__search" ref={searchRef}>
      <input
        ref={searchInputRef}
        className="toolbar__search-input"
        type="search"
        placeholder="Search by name…"
        value={searchQuery}
        onChange={handleSearchInput}
        onFocus={() => searchQuery && setSearchOpen(true)}
        autoComplete="off"
      />
      {searchOpen && searchResults.length > 0 && (
        <ul className="toolbar__search-results">
          {searchResults.map(n => (
            <li key={n.id}>
              <button
                className="toolbar__search-result"
                onMouseDown={(e) => { e.preventDefault(); handleSearchSelect(n.id) }}
              >
                <span className="toolbar__search-name">{n.data.name}</span>
                {n.data.yearOfBirth && (
                  <span className="toolbar__search-year">b. {n.data.yearOfBirth}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchOpen && searchQuery.trim() && searchResults.length === 0 && (
        <div className="toolbar__search-empty">No results</div>
      )}
    </div>
  )

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__icon">🕸️</span>
        <span className="toolbar__title">NRoot</span>
        <span className="toolbar__count">{nodes.length} {nodes.length === 1 ? 'person' : 'people'}</span>
      </div>

      {/* Desktop actions */}
      <div className="toolbar__actions">
        {SearchBox}

        <button className="btn btn--primary" onClick={onAddRoot}>
          + Add Person
        </button>

        <button className="btn btn--secondary" onClick={onAutoArrange} title="Auto-arrange nodes">
          Auto-arrange
        </button>

        {isAdmin && (
          <>
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
          </>
        )}

        <div className="toolbar__divider" />

        <div className="toolbar__zoom">
          <button className="btn btn--icon" onClick={() => zoomIn()} title="Zoom in">+</button>
          <button className="btn btn--icon" onClick={() => fitView()} title="Fit view">⊡</button>
          <button className="btn btn--icon" onClick={() => zoomOut()} title="Zoom out">−</button>
        </div>

        <div className="toolbar__divider" />

        <button className="btn btn--ghost" onClick={onFindConnection} title="Trace how two people are connected">
          Trace Connects
        </button>

        <button className="btn btn--ghost" onClick={onHowTo} title="How to use">
          How to
        </button>

        <div className="toolbar__divider" />

        <button
          className="btn btn--icon"
          onClick={onThemeToggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

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

      {/* Mobile search icon */}
      <button
        className="toolbar__mobile-search-btn"
        onClick={() => {
          setMobileSearchOpen(v => !v)
          setMenuOpen(false)
          setTimeout(() => mobileSearchInputRef.current?.focus(), 50)
        }}
        aria-label="Search"
      >
        🔍
      </button>

      {/* Mobile hamburger */}
      <button
        className="toolbar__hamburger"
        onClick={() => { setMenuOpen((v) => !v); setMobileSearchOpen(false) }}
        aria-label="Menu"
        aria-expanded={menuOpen}
      >
        <span /><span /><span />
      </button>

      {/* Mobile search row — expands below the nav bar */}
      {mobileSearchOpen && (
        <div className="toolbar__search-overlay" onClick={() => { setMobileSearchOpen(false); setSearchQuery(''); setSearchOpen(false) }} />
      )}
      {mobileSearchOpen && (
        <div className="toolbar__mobile-search-row">
          <div className="toolbar__search toolbar__search--mobile-row" ref={searchRef}>
            <input
              ref={mobileSearchInputRef}
              className="toolbar__search-input"
              type="search"
              placeholder="Search by name…"
              value={searchQuery}
              onChange={handleSearchInput}
              onFocus={() => searchQuery && setSearchOpen(true)}
              autoComplete="off"
            />
            {searchOpen && searchResults.length > 0 && (
              <ul className="toolbar__search-results">
                {searchResults.map(n => (
                  <li key={n.id}>
                    <button
                      className="toolbar__search-result"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSearchSelect(n.id)
                        setMobileSearchOpen(false)
                      }}
                    >
                      <span className="toolbar__search-name">{n.data.name}</span>
                      {n.data.yearOfBirth && (
                        <span className="toolbar__search-year">b. {n.data.yearOfBirth}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {searchOpen && searchQuery.trim() && searchResults.length === 0 && (
              <div className="toolbar__search-empty">No results</div>
            )}
          </div>
        </div>
      )}

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
            {isAdmin && (
              <>
                <div className="toolbar__divider" />
                <button className="btn btn--ghost" onClick={() => { onExport(); closeMenu() }}>
                  Export
                </button>
                <button className="btn btn--ghost" onClick={() => { importRef.current?.click(); closeMenu() }}>
                  Import
                </button>
              </>
            )}
            <div className="toolbar__divider" />
            <div className="toolbar__zoom">
              <button className="btn btn--icon" onClick={() => { zoomIn(); closeMenu() }}>+</button>
              <button className="btn btn--icon" onClick={() => { fitView(); closeMenu() }}>⊡</button>
              <button className="btn btn--icon" onClick={() => { zoomOut(); closeMenu() }}>−</button>
            </div>
            <div className="toolbar__divider" />
            <button className="btn btn--ghost" onClick={() => { onFindConnection(); closeMenu() }}>
              Trace Connects
            </button>
            <button className="btn btn--ghost" onClick={() => { onHowTo(); closeMenu() }}>
              How to
            </button>
            <div className="toolbar__divider" />
            <button className="btn btn--ghost" onClick={() => { onThemeToggle(); closeMenu() }}>
              {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
            </button>
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
