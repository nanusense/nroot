import { memo, useCallback, useState, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function hashColor(name) {
  const colors = [
    '#7c9a7e', '#8b7daa', '#c47f5e', '#5e8da8',
    '#a87e5e', '#5ea87e', '#a85e7e', '#7e8da8',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return colors[Math.abs(hash) % colors.length]
}

const HANDLE_DIRS = [
  { position: Position.Top,    handleType: 'target', id: 'top-target',    dir: 'above', icon: '↑', label: 'Add Parent'  },
  { position: Position.Bottom, handleType: 'source', id: 'bottom-source', dir: 'below', icon: '↓', label: 'Add Child'   },
  { position: Position.Right,  handleType: 'source', id: 'right-source',  dir: 'right', icon: '→', label: 'Add Spouse'  },
  { position: Position.Left,   handleType: 'target', id: 'left-target',   dir: 'left',  icon: '←', label: 'Add Sibling' },
]

function PersonNode({ id, data, selected }) {
  const { name, yearOfBirth, photo, onAdd, onDelete, onUpdate, onPhotoChange, onHover, onHoverEnd, dimmed, isFocus,
          kinRole, canDelete, canRemovePhoto, isAdmin, genLevel, genOverride, onGenChange, onSelect,
          triggerEdit, onEditDone } = data

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editYear, setEditYear] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [avatarHovered, setAvatarHovered] = useState(false)
  const nameInputRef = useRef(null)
  const fileInputRef = useRef(null)

  // Reset confirm state if this node instance changes
  useEffect(() => { setShowConfirm(false) }, [id])

  // Trigger edit from PersonPanel
  useEffect(() => {
    if (triggerEdit && !editing) {
      setEditName(name)
      setEditYear(yearOfBirth ?? '')
      setEditing(true)
      onEditDone?.()
    }
  }, [triggerEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  const initials = getInitials(name || '?')
  const avatarColor = hashColor(editing ? editName || name : name)

  const startEdit = useCallback((e) => {
    e.stopPropagation()
    setEditName(name)
    setEditYear(yearOfBirth ?? '')
    setEditing(true)
  }, [name, yearOfBirth])

  useEffect(() => {
    if (editing) nameInputRef.current?.focus()
  }, [editing])

  const commitEdit = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && onUpdate) {
      onUpdate(id, { name: trimmed, yearOfBirth: editYear ? parseInt(editYear, 10) : '' })
    }
    setEditing(false)
  }, [id, editName, editYear, onUpdate])

  const cancelEdit = useCallback(() => setEditing(false), [])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') cancelEdit()
  }, [commitEdit, cancelEdit])

  // Show confirm prompt instead of immediately deleting
  const handleDelete = useCallback((e) => {
    e.stopPropagation()
    setShowConfirm(true)
  }, [])

  const confirmDelete = useCallback((e) => {
    e.stopPropagation()
    onDelete?.(id)
  }, [id, onDelete])

  const cancelDelete = useCallback((e) => {
    e.stopPropagation()
    setShowConfirm(false)
  }, [])

  const resizeToSquare = useCallback((file) => new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const size = 200
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight)
      const sw = size / scale
      const sh = size / scale
      const sx = (img.naturalWidth - sw) / 2
      const sy = (img.naturalHeight - sh) / 2
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = url
  }), [])

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const dataUrl = await resizeToSquare(file)
    onPhotoChange?.(id, dataUrl)
  }, [id, onPhotoChange, resizeToSquare])

  const handleAvatarClick = useCallback((e) => {
    e.stopPropagation()
    if (editing) return
    fileInputRef.current?.click()
  }, [editing])

  const handleRemovePhoto = useCallback((e) => {
    e.stopPropagation()
    onPhotoChange?.(id, null)
  }, [id, onPhotoChange])

  const handleDirectionAdd = useCallback((e, dir) => {
    e.stopPropagation()
    if (onAdd) onAdd(id, dir)
  }, [id, onAdd])

  const classNames = [
    'person-node',
    selected        ? 'person-node--selected' : '',
    editing         ? 'person-node--editing'  : '',
    dimmed          ? 'person-node--dimmed'   : '',
    isFocus         ? 'person-node--focus'    : '',
    kinRole === 'cousin' ? 'person-node--cousin' : '',
    kinRole === 'nephew' ? 'person-node--nephew' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={classNames}
      onDoubleClick={editing ? undefined : startEdit}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHoverEnd?.()}
    >
      {/* React Flow handles */}
      {HANDLE_DIRS.map(({ position, handleType, id: hid }) => (
        <Handle key={hid} type={handleType} position={position} id={hid} className="person-handle" />
      ))}

      {/* Directional add buttons */}
      {!editing && !showConfirm && HANDLE_DIRS.map(({ id: hid, dir, icon, label }) => (
        <button
          key={`add-${hid}`}
          className={`handle-add-btn handle-add-btn--${dir}`}
          onClick={(e) => handleDirectionAdd(e, dir)}
          title={label}
          aria-label={label}
        >
          {icon}
        </button>
      ))}

      {/* Edit / Delete controls */}
      {!editing && !showConfirm && (
        <>
          <button className="person-node__edit-trigger" onClick={startEdit} title="Edit (double-click)" aria-label="Edit person">✎</button>
          {canDelete !== false && (
            <button className="person-node__delete" onClick={handleDelete} title="Remove person" aria-label="Remove person">×</button>
          )}
        </>
      )}

      {/* Delete confirmation overlay */}
      {showConfirm && !editing && (
        <div className="person-node__confirm">
          <span className="person-node__confirm-text">Remove {name}?</span>
          <div className="person-node__confirm-btns">
            <button className="person-node__confirm-yes" onClick={confirmDelete}>Yes</button>
            <button className="person-node__confirm-no" onClick={cancelDelete}>No</button>
          </div>
        </div>
      )}

      {/* Avatar */}
      <div
        className="person-node__avatar-wrap"
        onMouseEnter={() => setAvatarHovered(true)}
        onMouseLeave={() => setAvatarHovered(false)}
      >
        <div
          className="person-node__avatar"
          style={{ backgroundColor: photo ? 'transparent' : avatarColor }}
          onClick={handleAvatarClick}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {photo
            ? <img src={photo} alt={name} className="person-node__avatar-photo" draggable={false} />
            : getInitials(editing ? (editName || '?') : (name || '?'))
          }
          {!photo && avatarHovered && !editing && !showConfirm && (
            <span className="person-node__avatar-overlay" aria-hidden>📷</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="person-node__photo-input"
            onChange={handleFileChange}
            tabIndex={-1}
            aria-hidden
          />
        </div>
        {photo && avatarHovered && !editing && !showConfirm && canRemovePhoto && (
          <button
            className="person-node__avatar-remove"
            onClick={handleRemovePhoto}
            onPointerDown={(e) => e.stopPropagation()}
            title="Remove photo"
            aria-label="Remove photo"
          >×</button>
        )}
      </div>

      {/* View mode */}
      {!editing && (
        <div
          className="person-node__info"
          title="Double-click to edit"
          onClick={(e) => { e.stopPropagation(); onSelect?.(id) }}
        >
          <span className="person-node__name">{name}</span>
          {yearOfBirth
            ? <span className="person-node__year">b. {yearOfBirth}</span>
            : <span className="person-node__year person-node__year--missing" title="Birth year not set">Add birth year</span>
          }
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="person-node__edit-form" onKeyDown={handleKeyDown}>
          <input ref={nameInputRef} className="person-node__edit-input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
          <input className="person-node__edit-input person-node__edit-input--year" type="number" value={editYear} onChange={(e) => setEditYear(e.target.value)} placeholder="Year" min="1" max={new Date().getFullYear()} />
          <div className="person-node__edit-actions">
            <button className="person-node__edit-btn person-node__edit-btn--save" onClick={commitEdit} title="Save (Enter)">✓</button>
            <button className="person-node__edit-btn person-node__edit-btn--cancel" onClick={cancelEdit} title="Cancel (Esc)">✕</button>
          </div>
        </div>
      )}

      {/* Admin: generation level badge with ±1 controls */}
      {isAdmin && (
        <div className="person-node__gen"
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            className="person-node__gen-btn"
            title="Move up one generation"
            onClick={e => { e.stopPropagation(); onGenChange?.(-1) }}
          >−</button>
          <span className={`person-node__gen-label${genOverride != null ? ' person-node__gen-label--pinned' : ''}`}>
            Gen {genLevel}
          </span>
          <button
            className="person-node__gen-btn"
            title="Move down one generation"
            onClick={e => { e.stopPropagation(); onGenChange?.(+1) }}
          >+</button>
        </div>
      )}
    </div>
  )
}

export default memo(PersonNode)
