/**
 * Custom family-tree layout — v2
 *
 * Key improvements over v1:
 *   • Generation depths computed via iterative BFS (not recursive placement order)
 *   • Couples and sibling-edge pairs normalised to the same generation
 *   • Y positions derive purely from generation depth — immune to root ordering
 *   • Sibling compaction adjusts X only (Y is already correct)
 *   • Step 4b (stranded parents) adjusts X only
 *   • 10 overlap-resolution passes for large trees
 */

const NODE_W     = 180   // must match PersonNode rendered width
const NODE_H     = 96    // must match PersonNode rendered height
const H_GAP      = 60    // horizontal gap between sibling subtrees
const V_GAP      = 130   // vertical gap between generations
const COUPLE_GAP = 40    // horizontal gap between two spouses
const ROOT_GAP   = 100   // extra breathing room between separate root families

// ─── Edge classifiers ────────────────────────────────────────────────────────

function isSiblingEdge(e) {
  return (
    e.data?.isSibling ||
    (
      e.sourceHandle === 'right-source' &&
      e.targetHandle === 'left-target'  &&
      !!e.style?.strokeDasharray
    )
  )
}

function isSpouseEdge(e) {
  return (
    e.sourceHandle === 'right-source' &&
    e.targetHandle === 'left-target'  &&
    !isSiblingEdge(e)
  )
}

function isParentChildEdge(e) {
  return !isSpouseEdge(e) && !isSiblingEdge(e) && !e.data?.isSpouseChild
}

// ─── Main export ─────────────────────────────────────────────────────────────

// _dir and _newId kept for call-site compatibility — no longer used.
// eslint-disable-next-line no-unused-vars
export function applyDagreLayout(nodes, edges, _dir, _newId) {
  if (!nodes.length) return nodes

  const nodeIds = new Set(nodes.map(n => n.id))
  const valid   = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

  // ── 1. Build relationship maps ──────────────────────────────────────────────

  const childrenOf     = {}
  const parentsOf      = {}
  const spouseOf       = {}
  const isLeftInCouple = new Set()

  valid.forEach(e => {
    if (isSpouseEdge(e)) {
      spouseOf[e.source] = e.target
      spouseOf[e.target] = e.source
      isLeftInCouple.add(e.source)
    } else if (isParentChildEdge(e)) {
      ;(childrenOf[e.source] ??= []).push(e.target)
      ;(parentsOf[e.target]  ??= []).push(e.source)
    }
  })

  const sibEdges = valid.filter(isSiblingEdge)

  // ── 2. Compute generation depth ─────────────────────────────────────────────
  //
  // gen[id] = 0 for roots (no parents), increasing by 1 per parent-child step.
  //
  // Three normalisation rules applied iteratively until stable:
  //   a) Spouses share the same generation (max of both)
  //   b) Sibling-edge pairs share the same generation (max of both)
  //   c) A child's generation must be at least parent's gen + 1
  //
  // This ensures that:
  //   - In-laws from older/younger branches are placed on their own correct row
  //   - Siblings with no parent-child edges get the right Y from sibling edges
  //   - Y is correct regardless of the order roots are processed

  const gen = {}

  // Seed: nodes with no parents start at generation 0
  nodes.forEach(n => { if (!parentsOf[n.id]?.length) gen[n.id] = 0 })

  // BFS downward through parent-child edges
  let bfsQ = nodes.filter(n => !parentsOf[n.id]?.length).map(n => n.id)
  while (bfsQ.length) {
    const nxt = []
    bfsQ.forEach(id => {
      ;(childrenOf[id] ?? []).forEach(kid => {
        const want = gen[id] + 1
        if ((gen[kid] ?? -1) < want) { gen[kid] = want; nxt.push(kid) }
      })
    })
    bfsQ = nxt
  }

  // Normalise couples + siblings, re-propagate; iterate until no more changes.
  let changed = true, guard = 0
  while (changed && guard++ < 500) {
    changed = false

    // (a) Spouses → same generation
    Object.entries(spouseOf).forEach(([a, b]) => {
      const maxG = Math.max(gen[a] ?? 0, gen[b] ?? 0)
      if ((gen[a] ?? -1) < maxG) { gen[a] = maxG; changed = true }
      if ((gen[b] ?? -1) < maxG) { gen[b] = maxG; changed = true }
    })

    // (b) Sibling-edge pairs → same generation
    sibEdges.forEach(e => {
      const maxG = Math.max(gen[e.source] ?? 0, gen[e.target] ?? 0)
      if ((gen[e.source] ?? -1) < maxG) { gen[e.source] = maxG; changed = true }
      if ((gen[e.target] ?? -1) < maxG) { gen[e.target] = maxG; changed = true }
    })

    // (c) Children must be at least one generation below each parent
    nodes.forEach(n => {
      const g = gen[n.id] ?? 0
      ;(childrenOf[n.id] ?? []).forEach(kid => {
        if ((gen[kid] ?? -1) < g + 1) { gen[kid] = g + 1; changed = true }
      })
    })
  }

  // Fallback: completely isolated nodes
  nodes.forEach(n => { if (gen[n.id] == null) gen[n.id] = 0 })

  const ROW_H = NODE_H + V_GAP  // pixel height of one generation band

  // ── 3. Helpers ──────────────────────────────────────────────────────────────

  /** All children of the family unit (id + spouse combined, deduped). */
  function unitKids(id) {
    const seen = new Set(), out = []
    for (const pid of [id, spouseOf[id]].filter(Boolean)) {
      for (const k of (childrenOf[pid] ?? [])) {
        if (!seen.has(k)) { seen.add(k); out.push(k) }
      }
    }
    return out
  }

  const widthCache = {}
  function subtreeWidth(id, vis = new Set()) {
    if (vis.has(id))            return NODE_W
    if (widthCache[id] != null) return widthCache[id]
    const v2 = new Set(vis); v2.add(id); if (spouseOf[id]) v2.add(spouseOf[id])
    const coupleW = spouseOf[id] ? NODE_W * 2 + COUPLE_GAP : NODE_W
    const kids    = unitKids(id)
    if (!kids.length) return (widthCache[id] = coupleW)
    let kidsW = 0
    kids.forEach((k, i) => { kidsW += subtreeWidth(k, v2) + (i ? H_GAP : 0) })
    return (widthCache[id] = Math.max(coupleW, kidsW))
  }

  function collectSubtree(id, out = new Set(), vis = new Set()) {
    if (vis.has(id)) return out
    vis.add(id); out.add(id)
    const sp = spouseOf[id]
    if (sp && !vis.has(sp)) { vis.add(sp); out.add(sp) }
    unitKids(id).forEach(k => collectSubtree(k, out, vis))
    return out
  }

  // ── 4. Recursive placement ──────────────────────────────────────────────────
  //
  // Y = gen[id] * ROW_H  (generation-based — the key change from v1)
  // X = centred over the children subtree (top-down recursive)
  //
  // The `if (pos[id] == null)` guard prevents overwriting a node already placed
  // by a previous root's traversal (important for shared children).

  const pos = {}

  function place(id, cx, vis = new Set()) {
    if (vis.has(id)) return
    const v2 = new Set(vis); v2.add(id)
    const sp = spouseOf[id]; if (sp) v2.add(sp)

    const y = gen[id] * ROW_H   // ← generation-based Y

    if (pos[id] == null) {
      if (sp) {
        const [L, R] = isLeftInCouple.has(id) ? [id, sp] : [sp, id]
        pos[L] = { x: cx - COUPLE_GAP / 2 - NODE_W, y }
        if (pos[R] == null) pos[R] = { x: cx + COUPLE_GAP / 2, y }
      } else {
        pos[id] = { x: cx - NODE_W / 2, y }
      }
    }

    const kids = unitKids(id)
    if (!kids.length) return

    const selfCx   = pos[id].x + NODE_W / 2
    const coupleCx = sp && pos[sp]
      ? (pos[id].x + NODE_W / 2 + pos[sp].x + NODE_W / 2) / 2
      : selfCx

    let totalW = kids.reduce((s, k, i) => s + subtreeWidth(k, v2) + (i ? H_GAP : 0), 0)
    let x = coupleCx - totalW / 2
    for (const k of kids) {
      const kw = subtreeWidth(k, v2)
      place(k, x + kw / 2, v2)
      x += kw + H_GAP
    }
  }

  // ── 5. Find and lay out root families ──────────────────────────────────────

  const hasParents    = new Set(Object.keys(parentsOf))
  const skipSpouse    = new Set()
  const spouseIsChild = new Set(
    nodes
      .filter(n => !hasParents.has(n.id) && hasParents.has(spouseOf[n.id] ?? ''))
      .map(n => n.id)
  )

  const primaryRoots = nodes.filter(n => {
    if (hasParents.has(n.id) || skipSpouse.has(n.id) || spouseIsChild.has(n.id)) return false
    const sp = spouseOf[n.id]
    if (sp && !hasParents.has(sp) && !spouseIsChild.has(sp)) skipSpouse.add(sp)
    return true
  })

  const totalRootsW = primaryRoots.reduce(
    (s, r, i) => s + subtreeWidth(r.id) + (i ? ROOT_GAP : 0), 0
  )
  let rx = -totalRootsW / 2
  for (const r of primaryRoots) {
    const rw = subtreeWidth(r.id)
    place(r.id, rx + rw / 2, new Set())
    rx += rw + ROOT_GAP
  }

  // ── 6. Bottom-up centering ─────────────────────────────────────────────────
  // The top-down recursive placement skips nodes already placed by another
  // branch's traversal, which can leave parents far from their actual children.
  //
  // Fix: iterate from deepest generation up to the roots.  For each node whose
  // horizontal centre is far from its placed children's centre, slide it (and
  // its spouse) to re-centre.  Running bottom-up means that after a child moves
  // its parent, the parent's parent can also self-correct in the same pass.
  // Three passes let corrections propagate up multi-generation chains.

  const maxGen = Math.max(0, ...Object.values(gen))

  for (let fixPass = 0; fixPass < 3; fixPass++) {
    for (let g = maxGen - 1; g >= 0; g--) {
      nodes.forEach(n => {
        if (gen[n.id] !== g) return
        if (pos[n.id] == null) return

        const kids = unitKids(n.id).filter(k => pos[k] != null)
        if (!kids.length) return

        const kidsLeft    = Math.min(...kids.map(k => pos[k].x))
        const kidsRight   = Math.max(...kids.map(k => pos[k].x + NODE_W))
        const kidsCenterX = (kidsLeft + kidsRight) / 2
        const selfCenterX = pos[n.id].x + NODE_W / 2

        // Only correct if meaningfully misaligned (> 1.5 node widths off-centre)
        if (Math.abs(kidsCenterX - selfCenterX) <= NODE_W * 1.5) return

        const sp = spouseOf[n.id]
        const y  = g * ROW_H
        const dx = kidsCenterX - selfCenterX

        pos[n.id] = { x: pos[n.id].x + dx, y }
        if (sp && pos[sp] != null) pos[sp] = { x: pos[sp].x + dx, y }
      })
    }
  }

  // ── 7. Sibling chain compaction (X-only) ───────────────────────────────────
  // Nodes connected by sibling edges but placed in separate root subtrees
  // may end up far apart horizontally.  Slide them adjacent to their anchored
  // sibling group.  Y is already correct — only X is changed here.

  if (sibEdges.length) {
    const sibAdj = {}
    sibEdges.forEach(e => {
      ;(sibAdj[e.source] ??= []).push(e.target)
      ;(sibAdj[e.target] ??= []).push(e.source)
    })

    const sibVisited    = new Set()
    const sibComponents = []
    Object.keys(sibAdj).forEach(id => {
      if (sibVisited.has(id)) return
      const comp = [], q = [id]
      while (q.length) {
        const cur = q.shift()
        if (sibVisited.has(cur)) continue
        sibVisited.add(cur); comp.push(cur)
        sibAdj[cur].forEach(nb => { if (!sibVisited.has(nb)) q.push(nb) })
      }
      sibComponents.push(comp)
    })

    sibComponents.forEach(comp => {
      const isAnchored = id =>
        !!(parentsOf[id]?.length) ||
        !!(spouseOf[id] && parentsOf[spouseOf[id]]?.length)

      const anchored = comp.filter(isAnchored)
      const strays   = comp.filter(id => !isAnchored(id))
      if (!anchored.length || !strays.length) return

      const anchoredNodes = anchored.flatMap(id => [...collectSubtree(id)]).filter(id => pos[id])
      let rightX = Math.max(...anchoredNodes.map(id => pos[id].x + NODE_W))
      let leftX  = Math.min(...anchoredNodes.map(id => pos[id].x))

      const strayGoesLeft = strayId =>
        sibEdges.some(e => e.source === strayId && anchored.includes(e.target))

      const leftStrays  = strays.filter(id =>  strayGoesLeft(id))
        .sort((a, b) => (pos[b]?.x ?? 0) - (pos[a]?.x ?? 0))
      const rightStrays = strays.filter(id => !strayGoesLeft(id))
        .sort((a, b) => (pos[a]?.x ?? 0) - (pos[b]?.x ?? 0))

      leftStrays.forEach(strayId => {
        const strayNodes = [...collectSubtree(strayId)].filter(id => pos[id])
        if (!strayNodes.length) return
        const strayRight = Math.max(...strayNodes.map(id => pos[id].x + NODE_W))
        const dx = leftX - H_GAP - strayRight
        strayNodes.forEach(id => { pos[id] = { x: pos[id].x + dx, y: pos[id].y } })
        leftX = Math.min(...strayNodes.map(id => pos[id].x))
      })

      rightStrays.forEach(strayId => {
        const strayNodes = [...collectSubtree(strayId)].filter(id => pos[id])
        if (!strayNodes.length) return
        const strayLeft = Math.min(...strayNodes.map(id => pos[id].x))
        const dx = rightX + H_GAP - strayLeft
        strayNodes.forEach(id => { pos[id] = { x: pos[id].x + dx, y: pos[id].y } })
        rightX = Math.max(...strayNodes.map(id => pos[id].x + NODE_W))
      })
    })
  }

  // ── 8. Fallback row for disconnected / orphan nodes ─────────────────────────

  const maxY = Object.values(pos).reduce((m, p) => Math.max(m, p.y), 0)
  let sx = 0
  for (const n of nodes) {
    if (pos[n.id] == null) {
      pos[n.id] = { x: sx, y: maxY + ROW_H }
      sx += NODE_W + H_GAP
    }
  }

  // ── 9. Eliminate per-row overlaps ───────────────────────────────────────────
  // 10 passes so cascading shifts in large trees fully settle.

  for (let pass = 0; pass < 10; pass++) {
    const rowMap = new Map()
    for (const [id, p] of Object.entries(pos)) {
      ;(rowMap.get(p.y) ?? rowMap.set(p.y, []).get(p.y)).push(id)
    }

    let moved = false
    for (const ids of rowMap.values()) {
      ids.sort((a, b) => pos[a].x - pos[b].x)
      for (let i = 1; i < ids.length; i++) {
        const left  = ids[i - 1]
        const right = ids[i]
        const gap   = pos[right].x - (pos[left].x + NODE_W)
        if (gap >= H_GAP) continue

        const shift = H_GAP - gap
        ;[...collectSubtree(right)].forEach(sid => {
          if (pos[sid]) pos[sid] = { x: pos[sid].x + shift, y: pos[sid].y }
        })
        moved = true
        ids.sort((a, b) => pos[a].x - pos[b].x)
      }
    }
    if (!moved) break
  }

  // ── 10. Return updated nodes ─────────────────────────────────────────────────

  return nodes.map(n => ({ ...n, position: pos[n.id] ?? n.position }))
}
