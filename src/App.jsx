import { useCallback, useMemo, useState, useRef } from 'react'
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
import Toolbar from './components/Toolbar'
import HowToModal from './components/HowToModal'
import './App.css'

const nodeTypes = { person: PersonNode }

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN

function FamilyTreeApp() {
  // Stable visitor identity (persists in localStorage)
  const visitorId = useRef(getVisitorId()).current

  // Admin unlock state — stored in sessionStorage so it survives page refresh
  // within the same tab but resets when the tab is closed.
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('nroot_admin') === '1')

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
    autoArrange,
    replaceTree,
    exportJSON,
    importJSON,
  } = useFamilyTree({ visitorId })

  const { fitView } = useReactFlow()

  const [modalOpen, setModalOpen] = useState(false)
  const [modalSourceNode, setModalSourceNode] = useState(null)
  const [modalDirection, setModalDirection] = useState('')

  const [howToOpen, setHowToOpen] = useState(false)

  // Hover state — drives immediate-kin dimming
  const [hoveredNodeId, setHoveredNodeId] = useState(null)

  // Selection state — drives cousin/nephew rings
  const [selectedForKin, setSelectedForKin] = useState(null)

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
    (e.sourceHandle === 'right-source' && e.targetHandle === 'left-target' && !!e.style?.strokeDasharray)
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

    edges.forEach(e => {
      // SpouseChild edges (Ranji→Dhruv when Dhruv was added as Roshi's son):
      // skip for sibling/parent classification but still highlight the child.
      if (e.data?.isSpouseChild) {
        if (e.source === hoveredNodeId) set.add(e.target)
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

  // ── Extended kin (selection) ───────────────────────────────────────────────
  // Computes cousins and nephews/nieces relative to the selected node.
  // Returns Map<nodeId, 'cousin' | 'nephew'> or null.
  const extendedKin = useMemo(() => {
    if (!selectedForKin) return null

    const parentOf   = new Map()  // childId → Set<parentId>
    const childrenOf = new Map()  // parentId → Set<childId>
    const siblingsOf = new Map()  // id → Set<siblingId>

    edges.forEach(e => {
      const isSpouseEdge = isSpouseEdgeGlobal(e)
      if (isSibEdge(e)) {
        if (!siblingsOf.has(e.source)) siblingsOf.set(e.source, new Set())
        if (!siblingsOf.has(e.target)) siblingsOf.set(e.target, new Set())
        siblingsOf.get(e.source).add(e.target)
        siblingsOf.get(e.target).add(e.source)
      } else if (!e.data?.isSpouseChild && !isSpouseEdge) {
        // parent-child edge only (bottom-source → top-target)
        if (!childrenOf.has(e.source)) childrenOf.set(e.source, new Set())
        childrenOf.get(e.source).add(e.target)
        if (!parentOf.has(e.target)) parentOf.set(e.target, new Set())
        parentOf.get(e.target).add(e.source)
      }
    })

    // Transitive sibling closure via BFS — A→B→C means C is also A's sibling
    function getAllSiblings(id) {
      const visited = new Set()
      const queue = [id]
      while (queue.length) {
        const cur = queue.shift()
        if (visited.has(cur)) continue
        visited.add(cur)
        ;(siblingsOf.get(cur) ?? new Set()).forEach(s => { if (!visited.has(s)) queue.push(s) })
      }
      visited.delete(id)
      return visited
    }

    const map = new Map()
    const ownParents  = parentOf.get(selectedForKin) ?? new Set()
    const ownSiblings = getAllSiblings(selectedForKin)

    // Nephews/nieces: children of own siblings (transitively)
    ownSiblings.forEach(sibId => {
      ;(childrenOf.get(sibId) ?? new Set()).forEach(nid => {
        if (nid !== selectedForKin && !map.has(nid)) map.set(nid, 'nephew')
      })
    })

    // Cousins: parents' siblings' (transitively) children
    ownParents.forEach(parentId => {
      getAllSiblings(parentId).forEach(psibId => {
        ;(childrenOf.get(psibId) ?? new Set()).forEach(cid => {
          if (cid !== selectedForKin && !ownSiblings.has(cid) && !map.has(cid)) {
            map.set(cid, 'cousin')
          }
        })
      })
    })

    return map.size ? map : null
  }, [selectedForKin, edges])

  // ── Nodes with callbacks + highlight state ────────────────────────────────
  const nodesWithCallbacks = useMemo(() => nodes.map((node) => {
    // canDelete: own nodes, admin, or legacy nodes with no createdBy tag
    const canDelete = isAdmin || !node.data.createdBy || node.data.createdBy === visitorId
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
        onHover:    setHoveredNodeId,
        onHoverEnd: () => setHoveredNodeId(null),
        dimmed:     immediateKin ? !immediateKin.has(node.id) : false,
        isFocus:    node.id === hoveredNodeId,
        kinRole:    extendedKin?.get(node.id) ?? null,
        canDelete,
      },
    }
  }), [nodes, visitorId, isAdmin, openModal, updatePerson, deletePerson, immediateKin, hoveredNodeId, extendedKin])

  // ── Edges with dimming on hover ────────────────────────────────────────────
  const displayEdges = useMemo(() => {
    if (!immediateKin) return edges
    return edges.map(e => ({
      ...e,
      style: {
        ...e.style,
        opacity: (immediateKin.has(e.source) && immediateKin.has(e.target))
          ? (e.style?.opacity ?? 1)
          : 0.07,
      },
    }))
  }, [edges, immediateKin])

  // Click a node → toggle cousin/nephew view for that node
  const onNodeClick = useCallback((_, node) => {
    setSelectedForKin(prev => prev === node.id ? null : node.id)
  }, [])

  // Click canvas → clear selection
  const onPaneClick = useCallback(() => {
    setSelectedForKin(null)
  }, [])

  if (loading) {
    return (
      <div className="app app--loading">
        <div className="loading-screen">
          <span className="loading-icon">🔗</span>
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
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#c4a882', strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: false }}
      >
        <Background color="#1e3322" gap={28} size={1.5} variant="dots" />
        <Controls style={{ bottom: 24, left: 24 }} />
        <MiniMap
          nodeColor={() => '#b8904a'}
          maskColor="rgba(14,27,16,0.75)"
          style={{ bottom: 24, right: 24 }}
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
        onHowTo={() => setHowToOpen(true)}
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

      <footer className="app-footer">
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
