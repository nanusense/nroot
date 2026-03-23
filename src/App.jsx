import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { getVisitorId } from './utils/identity'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useFamilyTree } from './hooks/useFamilyTree'
import PersonNode from './components/PersonNode'
import AddPersonModal from './components/AddPersonModal'
import PersonPanel from './components/PersonPanel'
import RelationshipFinder from './components/RelationshipFinder'
import Toolbar from './components/Toolbar'
import HowToModal from './components/HowToModal'
import './App.css'

const nodeTypes = { person: PersonNode }

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN

function FamilyTreeApp() {
  // Stable visitor identity (persists in localStorage)
  const visitorId = useRef(getVisitorId()).current

  // Theme toggle — persisted in localStorage
  const [theme, setTheme] = useState(() => localStorage.getItem('nroot_theme') ?? 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('nroot_theme', theme)
  }, [theme])
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), [])

  // Admin unlock state — stored in sessionStorage so it survives page refresh
  // within the same tab but resets when the tab is closed.
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('nroot_admin') === '1')
  const [nodeToEdit, setNodeToEdit] = useState(null)

  const unlockAdmin = useCallback((pin) => {
    if (ADMIN_PIN && pin === ADMIN_PIN) {
      sessionStorage.setItem('nroot_admin', '1')
      setIsAdmin(true)
      return true
    }
    return false
  }, [])

  const lockAdmin = useCallback(() => {
    sessionStorage.removeItem('nroot_admin')
    setIsAdmin(false)
  }, [])

  const {
    nodes,
    edges,
    loading,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addPerson,
    linkPersons,
    updatePerson,
    deletePerson,
    deleteEdge,
    updateEdge,
    autoArrange,
    replaceTree,
    exportJSON,
    importJSON,
  } = useFamilyTree({ visitorId })

  const { fitView, setCenter, getNode } = useReactFlow()

  const [modalOpen, setModalOpen] = useState(false)
  const [modalSourceNode, setModalSourceNode] = useState(null)
  const [modalDirection, setModalDirection] = useState('')

  const [howToOpen, setHowToOpen] = useState(false)
  const [finderOpen, setFinderOpen] = useState(false)

  // Panel + branch focus
  const [selectedPersonId, setSelectedPersonId] = useState(null)
  const [focusBranchId, setFocusBranchId] = useState(null)

  // First-visit pinch-to-zoom hint (mobile only)
  const [showPinchHint, setShowPinchHint] = useState(() =>
    window.innerWidth <= 660 && !localStorage.getItem('nroot_pinch_seen')
  )
  useEffect(() => {
    if (!showPinchHint) return
    localStorage.setItem('nroot_pinch_seen', '1')
    const t = setTimeout(() => setShowPinchHint(false), 3500)
    return () => clearTimeout(t)
  }, [showPinchHint])

  // Hover state — drives immediate-kin dimming
  const [hoveredNodeId, setHoveredNodeId] = useState(null)

  const openModal = useCallback((sourceNode = null, direction = '') => {
    setModalSourceNode(sourceNode)
    setModalDirection(direction)
    setModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setModalSourceNode(null)
    setModalDirection('')
  }, [])

  // Detect sibling edges: flagged explicitly, OR legacy dashed horizontal edges
  const isSibEdge = (e) =>
    e.data?.isSibling ||
    (e.sourceHandle === 'right-source' && e.targetHandle === 'left-target' && !!e.style?.strokeDasharray && !e.data?.isDivorced)
  const isSpouseEdgeGlobal = (e) =>
    e.sourceHandle === 'right-source' && e.targetHandle === 'left-target' && !isSibEdge(e)

  // ── Immediate kin (hover) ──────────────────────────────────────────────────
  // Returns the set of node IDs for: hovered node + parents + children + siblings
  // + spouse of hovered node + spouse of each parent (co-parent).
  const immediateKin = useMemo(() => {
    if (!hoveredNodeId) return null
    const set = new Set([hoveredNodeId])

    // Classify edges into kin categories (skip visual-only edges)
    const parentIds  = new Set()  // parents of hovered
    const spouseEdge = isSpouseEdgeGlobal

    // Guard: only follow isSpouseChild edges from a node that actually has a real
    // spouse edge (not a sibling). This filters out bad edges created by a previous
    // bug where spousesOf() didn't exclude sibling edges (same handles).
    const hoveredHasRealSpouse = edges.some(e =>
      e.sourceHandle === 'right-source' && e.targetHandle === 'left-target' &&
      !isSibEdge(e) &&
      (e.source === hoveredNodeId || e.target === hoveredNodeId)
    )

    edges.forEach(e => {
      // SpouseChild edges (e.g. step-parent → child):
      // only follow if the hovered node has a real spouse (guards against bad data
      // where siblings were incorrectly tagged as co-parents).
      if (e.data?.isSpouseChild) {
        if (e.source === hoveredNodeId && hoveredHasRealSpouse) set.add(e.target)
        return
      }

      if (spouseEdge(e)) {
        // Spouse of hovered node
        if (e.source === hoveredNodeId) set.add(e.target)
        if (e.target === hoveredNodeId) set.add(e.source)
        return
      }

      if (isSibEdge(e)) {
        // Direct siblings
        if (e.source === hoveredNodeId) set.add(e.target)
        if (e.target === hoveredNodeId) set.add(e.source)
        return
      }

      // Parent-child edge
      if (e.target === hoveredNodeId) {
        // e.source is a parent of hovered
        set.add(e.source)
        parentIds.add(e.source)
      }
      if (e.source === hoveredNodeId) {
        // e.target is a child of hovered
        set.add(e.target)
      }
    })

    // Add co-parent: spouse of each parent (so both parents light up when hovering a child)
    edges.forEach(e => {
      if (!spouseEdge(e)) return
      if (parentIds.has(e.source)) set.add(e.target)
      if (parentIds.has(e.target)) set.add(e.source)
    })

    return set
  }, [hoveredNodeId, edges])

  // ── Branch focus (highlight ancestors + descendants + spouses) ────────────
  const branchSet = useMemo(() => {
    if (!focusBranchId) return null
    const set = new Set([focusBranchId])
    const queue = [focusBranchId]
    while (queue.length) {
      const id = queue.shift()
      edges.forEach(e => {
        if (isSibEdge(e) || isSpouseEdgeGlobal(e)) return
        if (e.source === id && !set.has(e.target)) { set.add(e.target); queue.push(e.target) }
        if (e.target === id && !set.has(e.source)) { set.add(e.source); queue.push(e.source) }
      })
    }
    // add spouses of every included node
    const members = [...set]
    members.forEach(id => {
      edges.forEach(e => {
        if (!isSpouseEdgeGlobal(e)) return
        if (e.source === id && !set.has(e.target)) set.add(e.target)
        if (e.target === id && !set.has(e.source)) set.add(e.source)
      })
    })
    return set
  }, [focusBranchId, edges]) // eslint-disable-line react-hooks/exhaustive-deps

  // Admin: shift a person's generation by ±1 (stored as 1-based genOverride)
  const ROW_H = 226 // must match layout.js NODE_H + V_GAP
  const handleGenChange = useCallback((nodeId, delta) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    const current = node.data.genOverride ?? Math.round(node.position.y / ROW_H) + 1
    updatePerson(nodeId, { genOverride: current + delta })
  }, [nodes, updatePerson])

  // ── Nodes with callbacks + highlight state ────────────────────────────────
  const nodesWithCallbacks = useMemo(() => nodes.map((node) => {
    // canDelete: own nodes, admin, or legacy nodes with no createdBy tag
    const canDelete = isAdmin || !node.data.createdBy || node.data.createdBy === visitorId
    // canRemovePhoto: photo uploader, admin, or no uploader recorded (legacy)
    const canRemovePhoto = isAdmin || !node.data.photoUploadedBy || node.data.photoUploadedBy === visitorId
    return {
      ...node,
      data: {
        ...node.data,
        onAdd: (id, direction) => {
          const sourceNode = nodes.find((n) => n.id === id)
          openModal(sourceNode || null, direction)
        },
        onUpdate:   updatePerson,
        onDelete:   deletePerson,
        onPhotoChange: (id, photo) => updatePerson(id, {
          photo,
          photoUploadedBy: photo ? visitorId : null,
        }),
        onSelect:   (id) => setSelectedPersonId(id),
        onHover:    setHoveredNodeId,
        onHoverEnd: () => setHoveredNodeId(null),
        dimmed:     immediateKin ? !immediateKin.has(node.id) : (branchSet ? !branchSet.has(node.id) : false),
        isFocus:    node.id === hoveredNodeId,
        kinRole:    null,
        canDelete,
        canRemovePhoto,
        isAdmin,
        genLevel:    node.data.genOverride ?? Math.round(node.position.y / ROW_H) + 1,
        genOverride: node.data.genOverride ?? null,
        onGenChange: (delta) => handleGenChange(node.id, delta),
        triggerEdit: nodeToEdit === node.id,
        onEditDone:  () => setNodeToEdit(null),
      },
    }
  }), [nodes, visitorId, isAdmin, openModal, updatePerson, deletePerson, immediateKin, branchSet, hoveredNodeId, handleGenChange, nodeToEdit])

  // ── Edges with dimming on hover / branch focus ────────────────────────────
  const displayEdges = useMemo(() => {
    const activeSet = immediateKin ?? branchSet
    if (!activeSet) return edges
    return edges.map(e => {
      const isKinEdge = activeSet.has(e.source) && activeSet.has(e.target)
      return {
        ...e,
        label: isKinEdge ? e.label : '',
        style: {
          ...e.style,
          opacity: isKinEdge ? (e.style?.opacity ?? 1) : 0.07,
        },
      }
    })
  }, [edges, immediateKin, branchSet])

  // Search: pan + zoom to the found node
  const handleSearchSelect = useCallback((nodeId) => {
    const node = getNode(nodeId)
    if (node) {
      setCenter(
        node.position.x + 90,   // 90 = NODE_W / 2
        node.position.y + 48,   // 48 = NODE_H / 2
        { zoom: 1.5, duration: 600 }
      )
    }
  }, [getNode, setCenter])

  // Panel: open by clicking a node (toggle)
  const onNodeClick = useCallback((_, node) => {
    setSelectedPersonId(prev => prev === node.id ? null : node.id)
  }, [])

  // Panel: navigate to a relative (pan canvas + switch panel)
  const handlePanelNavigate = useCallback((nodeId) => {
    const node = getNode(nodeId)
    if (node) {
      setCenter(node.position.x + 90, node.position.y + 48, { zoom: 1.5, duration: 600 })
    }
    setSelectedPersonId(nodeId)
  }, [getNode, setCenter])

  // Panel: focus/clear branch
  const handlePanelFocus = useCallback((id) => {
    setFocusBranchId(id)
  }, [])

  const onEdgeClick = useCallback((_, edge) => {
    if (!isAdmin) return
    if (window.confirm(`Remove this "${edge.label || 'connection'}" relationship?`)) {
      deleteEdge(edge.id)
    }
  }, [isAdmin, deleteEdge])

  if (loading) {
    return (
      <div className="app app--loading">
        <div className="loading-screen">
          <span className="loading-icon">🕸️</span>
          <p className="loading-text">Loading your family map…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={displayEdges}
        nodeDragThreshold={4}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => setSelectedPersonId(null)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#c4a882', strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color={theme === 'dark' ? '#1e3322' : '#d0c8b4'}
          gap={28} size={1.5} variant="dots"
        />
        <Controls style={{ bottom: 24, left: 24 }} />
        <MiniMap
          nodeColor={() => '#b8904a'}
          maskColor={theme === 'dark' ? 'rgba(14,27,16,0.75)' : 'rgba(244,240,232,0.75)'}
          style={{ bottom: 24, right: 24 }}
          pannable
          zoomable
        />
      </ReactFlow>

      <Toolbar
        nodes={nodes}
        edges={edges}
        onAddRoot={() => openModal(null, '')}
        onAutoArrange={() => { autoArrange(); setTimeout(() => fitView({ padding: 0.3, duration: 500 }), 50) }}
        onExport={exportJSON}
        onImport={(data) => replaceTree(data)}
        importJSON={importJSON}
        isAdmin={isAdmin}
        onUnlockAdmin={unlockAdmin}
        onLockAdmin={lockAdmin}
        onFindConnection={() => setFinderOpen(true)}
        onHowTo={() => setHowToOpen(true)}
        onSearchSelect={handleSearchSelect}
        theme={theme}
        onThemeToggle={toggleTheme}
      />

      <AddPersonModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSubmit={addPerson}
        onLink={linkPersons}
        sourceNode={modalSourceNode}
        direction={modalDirection}
        allNodes={nodes}
      />

      {howToOpen && <HowToModal onClose={() => setHowToOpen(false)} />}

      {finderOpen && (
        <RelationshipFinder
          isOpen={finderOpen}
          onClose={() => setFinderOpen(false)}
          nodes={nodes}
          edges={edges}
        />
      )}

      {selectedPersonId && (
        <PersonPanel
          personId={selectedPersonId}
          nodes={nodes}
          edges={edges}
          onClose={() => setSelectedPersonId(null)}
          onNavigate={handlePanelNavigate}
          onFocus={handlePanelFocus}
          isFocused={focusBranchId === selectedPersonId}
          onUpdateEdge={updateEdge}
          onEditNode={(id) => setNodeToEdit(id)}
        />
      )}

      {showPinchHint && (
        <div className="pinch-hint">👌 Pinch to zoom · drag to pan</div>
      )}

      <footer className="app-footer">
        Best viewed on a large screen.{' '}
        Created by Sandeep Nanu. For a custom family tree like this, write to{' '}
        <a href="mailto:shiftingradius@gmail.com">shiftingradius@gmail.com</a>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FamilyTreeApp />
    </ReactFlowProvider>
  )
}
