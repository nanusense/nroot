import { useCallback, useEffect, useRef, useState } from 'react'
import { useNodesState, useEdgesState, addEdge } from '@xyflow/react'
import { exportJSON, importJSON } from '../utils/storage'
import { loadTree, saveTree, subscribeToTree, supabase } from '../utils/db'
import { applyDagreLayout } from '../utils/layout'

// Normalise edge labels for consistent canvas display
function normaliseLabel(label, isSibling = false) {
  if (isSibling && !label) return 'Sibling'
  if (!label) return label
  const l = label.trim()
  if (l === 'Wife' || l === 'Husband') return 'Spouse'
  if (l === 'Brother' || l === 'Sister') return 'Sibling'
  return l
}

function generateId() {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function debounce(fn, delay) {
  let timer
  let lastArgs = null
  const debounced = (...args) => {
    lastArgs = args
    clearTimeout(timer)
    timer = setTimeout(() => {
      lastArgs = null
      fn(...args)
    }, delay)
  }
  debounced.flush = () => {
    if (lastArgs) {
      clearTimeout(timer)
      const args = lastArgs
      lastArgs = null
      fn(...args)
    }
  }
  return debounced
}

// Color scheme per relationship type
const EDGE_COLOR = {
  parentChild: '#c4a882',
  spouse:      '#e0728a',
  sibling:     '#7aadcf',
  spouseChild: '#88c090',
}

const labelProps = {
  labelStyle:          { fontSize: 11, fill: '#6b5344' },
  labelBgStyle:        { fill: '#fdf6ee', fillOpacity: 0.9 },
  labelBgPadding:      [4, 6],
  labelBgBorderRadius: 4,
}

export function useFamilyTree({ visitorId } = {}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)

  // Tracks whether we have local changes in-flight (debounce window + save + echo window).
  // Set to true immediately on any local change so realtime doesn't overwrite pending edits.
  const isSavingRef = useRef(false)

  // Debounced save — avoids hammering Supabase on every drag/position update.
  // 300 ms window is short enough that a Vite HMR reload is unlikely to interrupt it.
  const debouncedSave = useRef(
    debounce((n, e) => {
      // isSavingRef is already true (set when the change was made)
      saveTree(n, e).finally(() => {
        setTimeout(() => { isSavingRef.current = false }, 1500)
      })
    }, 300)
  ).current

  // Call this instead of debouncedSave directly so isSavingRef is set immediately,
  // protecting local state during the debounce window.
  const scheduleSave = useCallback((n, e) => {
    isSavingRef.current = true
    debouncedSave(n, e)
  }, [debouncedSave])

  // Flush any pending debounced save immediately when the page is closed or
  // the component unmounts (e.g. during Vite HMR). Without this, a delete/edit
  // made just before an HMR reload would be lost and the stale Supabase data
  // (with the old node) would be re-loaded on the next mount.
  useEffect(() => {
    const handleUnload = () => debouncedSave.flush()
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      debouncedSave.flush() // flush on HMR unmount too
    }
  }, [debouncedSave])

  // Initial load from Supabase
  useEffect(() => {
    loadTree().then(({ nodes: n, edges: e }) => {
      // Self-healing: remove spouseChild edges that have no valid step-parent relationship.
      // A valid sc edge A→C requires: a parent P where P→C exists AND a real spouse edge A↔P.
      const isSibE = (edge) => edge.data?.isSibling || (!!edge.style?.strokeDasharray && !edge.data?.isDivorced)
      const parentOf = {}   // childId → Set of parentIds
      e.forEach(edge => {
        if (edge.sourceHandle === 'bottom-source' && edge.targetHandle === 'top-target' && !edge.data?.isSpouseChild) {
          if (!parentOf[edge.target]) parentOf[edge.target] = new Set()
          parentOf[edge.target].add(edge.source)
        }
      })
      const isRealSpouse = (a, b) => e.some(edge =>
        edge.sourceHandle === 'right-source' && edge.targetHandle === 'left-target' &&
        !isSibE(edge) &&
        ((edge.source === a && edge.target === b) || (edge.source === b && edge.target === a))
      )
      const cleanedEdges = e.filter(edge => {
        if (!edge.data?.isSpouseChild) return true
        const parents = parentOf[edge.target]
        if (!parents) return false  // child has no known parent → remove orphan sc edge
        return [...parents].some(p => isRealSpouse(edge.source, p))
      })
      // Normalise labels on existing edges:
      // "Wife"/"Husband" → "Spouse", "Brother"/"Sister" → "Sibling",
      // and sibling edges with no label → "Sibling"
      const normalisedEdges = cleanedEdges.map(edge => {
        const isSib = edge.data?.isSibling || (!!edge.style?.strokeDasharray && !edge.data?.isDivorced)
        const newLabel = normaliseLabel(edge.label, isSib)
        return newLabel !== edge.label ? { ...edge, label: newLabel } : edge
      })
      // Self-healing: add any missing parent-child edges for spouses.
      // Happens when a spouse was linked after children already existed.
      // Spouses are treated as co-parents by default.
      const existingParentChildPairs = new Set(
        normalisedEdges
          .filter(e2 => e2.sourceHandle === 'bottom-source' && e2.targetHandle === 'top-target' && !e2.data?.isSpouseChild)
          .map(e2 => `${e2.source}|${e2.target}`)
      )
      const addedCoParentEdges = []
      Object.entries(parentOf).forEach(([childId, parentIds]) => {
        [...parentIds].forEach(parentId => {
          normalisedEdges.forEach(e2 => {
            if (e2.sourceHandle !== 'right-source' || e2.targetHandle !== 'left-target') return
            if (isSibE(e2) || e2.data?.isDivorced) return
            const spouseId = e2.source === parentId ? e2.target
              : e2.target === parentId ? e2.source : null
            if (!spouseId) return
            if ([...parentIds].includes(spouseId)) return // already a real parent
            const key = `${spouseId}|${childId}`
            if (!existingParentChildPairs.has(key)) {
              addedCoParentEdges.push({
                id: `e_${spouseId}_${childId}`,
                source: spouseId, target: childId,
                sourceHandle: 'bottom-source', targetHandle: 'top-target',
                type: 'smoothstep', label: '',
                style: { stroke: '#c4a882', strokeWidth: 2 },
              })
              existingParentChildPairs.add(key)
            }
          })
        })
      })
      const healedEdges = addedCoParentEdges.length > 0 ? [...normalisedEdges, ...addedCoParentEdges] : normalisedEdges
      const hadChanges = cleanedEdges.length < e.length ||
        normalisedEdges.some((edge, i) => edge.label !== cleanedEdges[i].label) ||
        addedCoParentEdges.length > 0
      setNodes(n)
      setEdges(healedEdges)
      setLoading(false)
      if (hadChanges) saveTree(n, healedEdges)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time subscription — picks up changes made by other family members
  useEffect(() => {
    const channel = subscribeToTree((data) => {
      if (isSavingRef.current) return // Our own save echoing back — ignore
      setNodes(data.nodes ?? [])
      setEdges(data.edges ?? [])
    })
    return () => {
      if (supabase && channel?.unsubscribe) channel.unsubscribe()
      else if (supabase) supabase.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, type: 'smoothstep', label: '' }, eds))
  }, [setEdges])

  const addPerson = useCallback(({ name, yearOfBirth, relation, sourceId, direction }) => {
    const id = generateId()

    const newNode = {
      id,
      type: 'person',
      position: { x: 0, y: 0 },
      data: { name, yearOfBirth, createdBy: visitorId || null },
    }

    let newEdge = null
    if (sourceId) {
      // For spouse (direction='right'): if the person already has a right-side
      // neighbour (is the SOURCE of an existing horizontal edge), flip the spouse
      // to the left so the two don't collide.
      let layoutDir = direction
      if (direction === 'right' && sourceId) {
        const rightOccupied = edges.some(
          (e) =>
            e.source === sourceId &&
            e.sourceHandle === 'right-source' &&
            e.targetHandle === 'left-target'
        )
        if (rightOccupied) layoutDir = 'left'
      }

      const swapEdge = layoutDir === 'above' || layoutDir === 'left'
      const edgeSrc = swapEdge ? id : sourceId
      const edgeTgt = swapEdge ? sourceId : id

      const handles = {
        above: { sourceHandle: 'bottom-source', targetHandle: 'top-target' },
        below: { sourceHandle: 'bottom-source', targetHandle: 'top-target' },
        right: { sourceHandle: 'right-source',  targetHandle: 'left-target' },
        left:  { sourceHandle: 'right-source',  targetHandle: 'left-target' },
      }
      const { sourceHandle, targetHandle } = handles[layoutDir] ?? handles.below
      // Edge colour is based on the original relationship type, not the flipped direction
      const edgeColor =
        direction === 'right' ? EDGE_COLOR.spouse :
        direction === 'left'  ? EDGE_COLOR.sibling :
        EDGE_COLOR.parentChild

      newEdge = {
        id: `e_${edgeSrc}_${edgeTgt}`,
        source: edgeSrc,
        target: edgeTgt,
        sourceHandle,
        targetHandle,
        label: normaliseLabel(relation) || '',
        type: 'smoothstep',
        ...labelProps,
        data: direction === 'left' ? { isSibling: true } : undefined,
        style: {
          stroke: edgeColor,
          strokeWidth: 2,
          // Dashes only for siblings, never for a spouse that was flipped left
          ...(direction === 'left' ? { strokeDasharray: '6 4' } : {}),
        },
      }
    }

    // Helper: find spouses of a given person (nodes connected via horizontal edges)
    // Excludes sibling edges — detected by data.isSibling flag OR strokeDasharray style
    const spousesOf = (personId) => {
      const spouseIds = []
      edges.forEach((e) => {
        if (e.sourceHandle !== 'right-source' || e.targetHandle !== 'left-target') return
        const isSib = e.data?.isSibling || (!!e.style?.strokeDasharray && !e.data?.isDivorced)
        if (isSib) return
        if (e.source === personId) spouseIds.push(e.target)
        else if (e.target === personId) spouseIds.push(e.source)
      })
      return spouseIds
    }

    // When adding a spouse: auto-connect them as a real parent to the other person's
    // existing children. A spouse is assumed to be a co-parent by default.
    const autoSpouseChildEdges = []
    if (direction === 'right' && sourceId) {
      edges.filter(
        (e) => e.source === sourceId && e.sourceHandle === 'bottom-source' && !e.data?.isSibling && !e.data?.isSpouseChild
      ).forEach((e) => {
        autoSpouseChildEdges.push({
          id: `e_${id}_${e.target}`,
          source: id, target: e.target,
          sourceHandle: 'bottom-source', targetHandle: 'top-target',
          type: 'smoothstep', label: '',
          ...labelProps,
          style: { stroke: EDGE_COLOR.parentChild, strokeWidth: 2 },
        })
      })
    }

    // When adding a sibling (direction === 'left'), also connect the new person
    // to ALL existing siblings of the source — so the whole sibling group is
    // fully cross-linked and the layout can keep them on the same generation row.
    const autoTransitiveSiblingEdges = []
    if (direction === 'left' && sourceId) {
      edges.forEach(e => {
        if (!e.data?.isSibling) return
        let existingSibId = null
        if (e.source === sourceId) existingSibId = e.target
        else if (e.target === sourceId) existingSibId = e.source
        if (!existingSibId) return
        autoTransitiveSiblingEdges.push({
          id: `sib_t_${id}_${existingSibId}`,
          source: id,
          target: existingSibId,
          sourceHandle: 'right-source',
          targetHandle: 'left-target',
          type: 'straight',
          label: normaliseLabel(relation) || '',
          ...labelProps,
          style: { stroke: EDGE_COLOR.sibling, strokeWidth: 1.5, strokeDasharray: '6 4' },
          data: { isSibling: true },
        })
      })
    }

    const autoSiblingEdges = []
    if (direction === 'below' && sourceId) {
      // Connect new child to ALL existing siblings (full cross-link so every sibling
      // pair has a direct edge and hover highlights work correctly).
      const existingChildren = edges.filter(
        (e) =>
          e.source === sourceId &&
          e.sourceHandle === 'bottom-source' &&
          !e.data?.isSibling &&
          !e.data?.isSpouseChild
      )
      existingChildren.forEach((e) => {
        autoSiblingEdges.push({
          id: `sib_${e.target}_${id}`,
          source: e.target, target: id,
          sourceHandle: 'right-source', targetHandle: 'left-target',
          type: 'straight',
          label: 'Sibling',
          ...labelProps,
          style: { stroke: EDGE_COLOR.sibling, strokeWidth: 1.5, strokeDasharray: '6 4' },
          data: { isSibling: true },
        })
      })

      // Connect new child to existing spouses of the parent as real parent-child edges
      spousesOf(sourceId).forEach((spouseId) => {
        autoSpouseChildEdges.push({
          id: `e_${spouseId}_${id}`,
          source: spouseId, target: id,
          sourceHandle: 'bottom-source', targetHandle: 'top-target',
          type: 'smoothstep', label: '',
          ...labelProps,
          style: { stroke: EDGE_COLOR.parentChild, strokeWidth: 2 },
        })
      })
    }

    const updatedNodes = [...nodes, newNode]
    const updatedEdges = [
      ...(newEdge ? [...edges, newEdge] : edges),
      ...autoSiblingEdges,
      ...autoSpouseChildEdges,
      ...autoTransitiveSiblingEdges,
    ]
    const layoutedNodes = applyDagreLayout(updatedNodes, updatedEdges, 'TB', id)
    setNodes(layoutedNodes)
    setEdges(updatedEdges)
    scheduleSave(layoutedNodes, updatedEdges)

    return id
  }, [nodes, edges, setNodes, setEdges, scheduleSave])

  // Connect two EXISTING nodes with a relationship edge.
  // Uses the same flip-to-left logic as addPerson so spouses never collide with siblings.
  const linkPersons = useCallback(({ sourceId, targetId, direction, relation }) => {
    if (!sourceId || !targetId || sourceId === targetId) return

    // Block sibling link when a parent-child edge already exists between these two nodes
    if (direction === 'left') {
      const alreadyParentChild = edges.some(e =>
        ((e.source === sourceId && e.target === targetId) ||
         (e.source === targetId && e.target === sourceId)) &&
        !e.data?.isSibling &&
        e.sourceHandle !== 'right-source' &&
        e.targetHandle !== 'left-target'
      )
      if (alreadyParentChild) return
    }

    let layoutDir = direction
    if (direction === 'right') {
      const rightOccupied = edges.some(
        (e) =>
          e.source === sourceId &&
          e.sourceHandle === 'right-source' &&
          e.targetHandle === 'left-target'
      )
      if (rightOccupied) layoutDir = 'left'
    }

    const swapEdge = layoutDir === 'above' || layoutDir === 'left'
    const edgeSrc = swapEdge ? targetId : sourceId
    const edgeTgt = swapEdge ? sourceId : targetId

    const handles = {
      above: { sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      below: { sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      right: { sourceHandle: 'right-source',  targetHandle: 'left-target' },
      left:  { sourceHandle: 'right-source',  targetHandle: 'left-target' },
    }
    const { sourceHandle, targetHandle } = handles[layoutDir] ?? handles.below
    const edgeColor =
      direction === 'right' ? EDGE_COLOR.spouse :
      direction === 'left'  ? EDGE_COLOR.sibling :
      EDGE_COLOR.parentChild

    // Prevent duplicate edges (ignore isSpouseChild — a real parent-child edge can replace it)
    const alreadyLinked = edges.some(
      (e) => !e.data?.isSpouseChild && (
        (e.source === edgeSrc && e.target === edgeTgt) ||
        (e.source === edgeTgt && e.target === edgeSrc &&
         e.sourceHandle === 'right-source' && e.targetHandle === 'left-target')
      )
    )
    if (alreadyLinked) return

    const newEdge = {
      id: `e_${edgeSrc}_${edgeTgt}`,
      source: edgeSrc, target: edgeTgt,
      sourceHandle, targetHandle,
      label: relation || '',
      type: 'smoothstep',
      ...labelProps,
      data: direction === 'left' ? { isSibling: true } : undefined,
      style: {
        stroke: edgeColor,
        strokeWidth: 2,
        ...(direction === 'left' ? { strokeDasharray: '6 4' } : {}),
      },
    }

    // Transitive sibling cross-links (same logic as addPerson)
    const transitiveEdges = []
    if (direction === 'left') {
      const sibSourceId = swapEdge ? targetId : sourceId
      edges.forEach(e => {
        if (!e.data?.isSibling) return
        let existingSibId = null
        if (e.source === sibSourceId) existingSibId = e.target
        else if (e.target === sibSourceId) existingSibId = e.source
        if (!existingSibId || existingSibId === (swapEdge ? sourceId : targetId)) return
        const alreadyLinked = edges.some(ex =>
          (ex.source === edgeSrc && ex.target === existingSibId) ||
          (ex.source === existingSibId && ex.target === edgeSrc)
        )
        if (alreadyLinked) return
        transitiveEdges.push({
          id: `sib_t_${edgeSrc}_${existingSibId}`,
          source: edgeSrc,
          target: existingSibId,
          sourceHandle: 'right-source',
          targetHandle: 'left-target',
          type: 'straight',
          label: newEdge.label,
          ...labelProps,
          style: { stroke: edgeColor, strokeWidth: 1.5, strokeDasharray: '6 4' },
          data: { isSibling: true },
        })
      })
    }

    // When linking as spouse, auto-add real parent-child edges to the other person's children
    const autoCoParentEdges = []
    if (direction === 'right') {
      // For each of sourceId's children, link targetId as co-parent (and vice versa)
      const addCoParentEdges = (parentId, newParentId) => {
        edges.forEach(e => {
          if (e.source !== parentId || e.sourceHandle !== 'bottom-source') return
          if (e.data?.isSibling || e.data?.isSpouseChild) return
          const childId = e.target
          const alreadyLinked = edges.some(ex =>
            ex.source === newParentId && ex.target === childId && ex.sourceHandle === 'bottom-source'
          )
          if (!alreadyLinked) {
            autoCoParentEdges.push({
              id: `e_${newParentId}_${childId}`,
              source: newParentId, target: childId,
              sourceHandle: 'bottom-source', targetHandle: 'top-target',
              type: 'smoothstep', label: '',
              ...labelProps,
              style: { stroke: EDGE_COLOR.parentChild, strokeWidth: 2 },
            })
          }
        })
      }
      addCoParentEdges(sourceId, targetId)
      addCoParentEdges(targetId, sourceId)
    }

    // Remove any stale isSpouseChild edge between the same pair now that a real edge exists
    const filteredEdges = edges.filter(e =>
      !(e.data?.isSpouseChild && e.source === edgeSrc && e.target === edgeTgt)
    )
    const updatedEdges = [...filteredEdges, newEdge, ...transitiveEdges, ...autoCoParentEdges]
    const layoutedNodes = applyDagreLayout(nodes, updatedEdges, 'TB', null)
    setNodes(layoutedNodes)
    setEdges(updatedEdges)
    scheduleSave(layoutedNodes, updatedEdges)
  }, [nodes, edges, setNodes, setEdges, scheduleSave])

  const updatePerson = useCallback((nodeId, updates) => {
    setNodes((nds) => {
      const updated = nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
      )
      scheduleSave(updated, edges)
      return updated
    })
  }, [setNodes, edges, scheduleSave])

  const deletePerson = useCallback((nodeId) => {
    setNodes((nds) => {
      const updated = nds.filter((n) => n.id !== nodeId)
      setEdges((eds) => {
        const updatedEdges = eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
        scheduleSave(updated, updatedEdges)
        return updatedEdges
      })
      return updated
    })
  }, [setNodes, setEdges, scheduleSave])

  const deleteEdge = useCallback((edgeId) => {
    setEdges((eds) => {
      const updatedEdges = eds.filter(e => e.id !== edgeId)
      const layoutedNodes = applyDagreLayout(nodes, updatedEdges)
      setNodes(layoutedNodes)
      scheduleSave(layoutedNodes, updatedEdges)
      return updatedEdges
    })
  }, [nodes, setNodes, setEdges, scheduleSave])

  const updateEdge = useCallback((edgeId, updates) => {
    setEdges((eds) => {
      const updated = eds.map(e => {
        if (e.id !== edgeId) return e
        const merged = { ...e, ...updates }
        // Merge data but fully replace style (so strokeDasharray gets cleaned up on restore)
        if (updates.data !== undefined) merged.data = { ...e.data, ...updates.data }
        return merged
      })
      scheduleSave(nodes, updated)
      return updated
    })
  }, [nodes, setEdges, scheduleSave])

  const autoArrange = useCallback(() => {
    setNodes((nds) => {
      const arranged = applyDagreLayout(nds, edges)
      scheduleSave(arranged, edges)
      return arranged
    })
  }, [edges, setNodes, scheduleSave])

  const replaceTree = useCallback(({ nodes: newNodes, edges: newEdges }) => {
    setNodes(newNodes)
    setEdges(newEdges)
    saveTree(newNodes, newEdges) // Immediate save for import
  }, [setNodes, setEdges])

  return {
    nodes, edges, loading,
    onNodesChange, onEdgesChange, onConnect,
    addPerson, linkPersons, updatePerson, deletePerson, deleteEdge, updateEdge, autoArrange, replaceTree,
    exportJSON: () => exportJSON(nodes, edges),
    importJSON,
  }
}
