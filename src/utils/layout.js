/**
 * Custom family-tree layout
 *
 * Replaces dagre with a purpose-built recursive algorithm that understands
 * family semantics:
 *   • Couples sit side-by-side at the same Y level
 *   • Children are centred below their parent couple
 *   • Each generation occupies its own horizontal band
 *   • Multiple disconnected families are spread left-to-right
 *
 * The exported function keeps the same signature as the old applyDagreLayout
 * so no call-sites in the hooks need to change.
 */

const NODE_W     = 180   // must match PersonNode rendered width
const NODE_H     = 96    // must match PersonNode rendered height
const H_GAP      = 60    // horizontal gap between sibling subtrees
const V_GAP      = 130   // vertical gap between generations
const COUPLE_GAP = 40    // horizontal gap between two spouses
const ROOT_GAP   = 100   // extra breathing room between separate root families

// ─── Edge classifiers ────────────────────────────────────────────────────────

/**
 * A sibling edge: explicitly flagged with isSibling, OR a legacy dashed
 * horizontal edge (data saved before the isSibling flag existed).
 */
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

/** A spouse edge: solid right-source → left-target, not a sibling link */
function isSpouseEdge(e) {
  return (
    e.sourceHandle === 'right-source' &&
    e.targetHandle === 'left-target'  &&
    !isSiblingEdge(e)
  )
}

/**
 * A true parent → child edge.
 * Excludes spouse edges, sibling chain edges, and the subtle "spouse-child"
 * connectors that exist only for visual routing.
 */
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

  const childrenOf    = {}  // parentId → childId[]
  const parentsOf     = {}  // childId  → parentId[]
  const spouseOf      = {}  // id → id  (bidirectional)
  const isLeftInCouple = new Set()
  // ^ ids whose right-source handle is active → they sit on the LEFT of the couple
  // (right-source means the node's right handle connects outward → it is left of its partner)

  valid.forEach(e => {
    if (isSpouseEdge(e)) {
      spouseOf[e.source] = e.target
      spouseOf[e.target] = e.source
      isLeftInCouple.add(e.source) // source of spouse edge is the left person
    } else if (isParentChildEdge(e)) {
      ;(childrenOf[e.source] ??= []).push(e.target)
      ;(parentsOf[e.target]  ??= []).push(e.source)
    }
  })

  // ── 2. Helpers ──────────────────────────────────────────────────────────────

  /** All children of the family unit (id + their spouse combined, deduped) */
  function unitKids(id) {
    const seen = new Set()
    const out  = []
    for (const pid of [id, spouseOf[id]].filter(Boolean)) {
      for (const k of (childrenOf[pid] ?? [])) {
        if (!seen.has(k)) { seen.add(k); out.push(k) }
      }
    }
    return out
  }

  /**
   * Pixel width needed to render the subtree whose root family unit is `id`.
   * `vis` is a Set of already-counted ids — prevents infinite loops in
   * unusual cyclic graphs.
   */
  const widthCache = {}
  function subtreeWidth(id, vis = new Set()) {
    if (vis.has(id))            return NODE_W
    if (widthCache[id] != null) return widthCache[id]

    const v2 = new Set(vis)
    v2.add(id)
    if (spouseOf[id]) v2.add(spouseOf[id])

    const coupleW = spouseOf[id] ? NODE_W * 2 + COUPLE_GAP : NODE_W
    const kids    = unitKids(id)

    if (!kids.length) return (widthCache[id] = coupleW)

    let kidsW = 0
    kids.forEach((k, i) => { kidsW += subtreeWidth(k, v2) + (i ? H_GAP : 0) })

    return (widthCache[id] = Math.max(coupleW, kidsW))
  }

  // ── 3. Recursive placement ──────────────────────────────────────────────────

  const pos = {}  // id → { x, y }

  /**
   * Place the family unit rooted at `id`, centred horizontally at `cx`,
   * top edge at `y`.  Children are placed recursively below.
   */
  function place(id, cx, y, vis = new Set()) {
    if (vis.has(id)) return

    const v2 = new Set(vis)
    v2.add(id)
    const sp = spouseOf[id]
    if (sp) v2.add(sp)

    // Place this person and their spouse (skip if already positioned by a
    // parent-tree pass — avoids overwriting a child who was placed first).
    if (pos[id] == null) {
      if (sp) {
        // Honour the original left/right order from the spouse edge direction.
        const [L, R] = isLeftInCouple.has(id) ? [id, sp] : [sp, id]
        pos[L] = { x: cx - COUPLE_GAP / 2 - NODE_W, y }
        if (pos[R] == null) {
          pos[R] = { x: cx + COUPLE_GAP / 2, y }
        }
      } else {
        pos[id] = { x: cx - NODE_W / 2, y }
      }
    }

    const kids = unitKids(id)
    if (!kids.length) return

    // Derive couple centre from actual placed positions (handles the case where
    // pos[id] was set by a prior pass).
    const selfCx    = pos[id].x + NODE_W / 2
    const coupleCx  = sp && pos[sp]
      ? (pos[id].x + NODE_W / 2 + pos[sp].x + NODE_W / 2) / 2
      : selfCx
    const childY = pos[id].y + NODE_H + V_GAP

    let totalW = kids.reduce((s, k, i) => s + subtreeWidth(k, v2) + (i ? H_GAP : 0), 0)
    let x = coupleCx - totalW / 2

    for (const k of kids) {
      const kw = subtreeWidth(k, v2)
      place(k, x + kw / 2, childY, v2)
      x += kw + H_GAP
    }
  }

  // ── 3b. Subtree collector (needed for sibling compaction below) ─────────────

  /** Collects all node IDs in the subtree rooted at `id` (including spouse). */
  function collectSubtree(id, out = new Set(), vis = new Set()) {
    if (vis.has(id)) return out
    vis.add(id); out.add(id)
    const sp = spouseOf[id]
    if (sp && !vis.has(sp)) { vis.add(sp); out.add(sp) }
    unitKids(id).forEach(k => collectSubtree(k, out, vis))
    return out
  }

  // ── 4. Find and lay out root families ──────────────────────────────────────

  const hasParents  = new Set(Object.keys(parentsOf))
  const skipSpouse  = new Set()

  // A node whose SPOUSE has parents should not be a primary root — it will be
  // placed alongside its spouse when the parent-child traversal reaches them.
  // Without this, e.g. "Roshi" (Ranji's wife, no parents) gets placed at y=0
  // before the tree traversal can put Ranji at the correct child-generation Y,
  // causing Ranji to be skipped (already placed) at the wrong level.
  const spouseIsChild = new Set(
    nodes
      .filter(n => !hasParents.has(n.id) && hasParents.has(spouseOf[n.id] ?? ''))
      .map(n => n.id)
  )

  // Primary roots: no parents in the tree, spouse not already a child-tree node,
  // and not already claimed as a rootless spouse of a previous root.
  const primaryRoots = nodes.filter(n => {
    if (hasParents.has(n.id) || skipSpouse.has(n.id) || spouseIsChild.has(n.id)) return false
    const sp = spouseOf[n.id]
    if (sp && !hasParents.has(sp) && !spouseIsChild.has(sp)) skipSpouse.add(sp)
    return true
  })

  // Centre the whole forest at x=0 so fitView lands nicely.
  const totalRootsW = primaryRoots.reduce(
    (s, r, i) => s + subtreeWidth(r.id) + (i ? ROOT_GAP : 0), 0
  )

  let rx = -totalRootsW / 2
  for (const r of primaryRoots) {
    const rw = subtreeWidth(r.id)
    place(r.id, rx + rw / 2, 0, new Set())
    rx += rw + ROOT_GAP
  }

  // ── 4b. Fix "stranded parent" roots ─────────────────────────────────────────
  // A root whose children were already placed by another root's traversal (e.g.
  // a father node added after a couple is already in the tree) ends up at y=0
  // far to the right.  Detect these and move them directly above their children.

  for (const r of primaryRoots) {
    const kids = unitKids(r.id)
    if (!kids.length) continue

    const placedKids = kids.filter(k => pos[k] != null)
    if (!placedKids.length) continue

    const kidsMinY    = Math.min(...placedKids.map(k => pos[k].y))
    const selfY       = pos[r.id]?.y ?? 0
    const kidsLeft    = Math.min(...placedKids.map(k => pos[k].x))
    const kidsRight   = Math.max(...placedKids.map(k => pos[k].x + NODE_W))
    const kidsCenterX = (kidsLeft + kidsRight) / 2
    const selfCenterX = (pos[r.id]?.x ?? 0) + NODE_W / 2

    // Reposition if children ended up at the same/above level (wrong Y),
    // OR if this root landed far from its children horizontally (e.g. a
    // parent-of-a-spouse like Chathu whose child Leela was placed by the
    // main tree traversal, leaving Chathu far to the right at the correct
    // Y but wrong X).
    const yMisplaced = kidsMinY <= selfY
    const xMisplaced = Math.abs(kidsCenterX - selfCenterX) > NODE_W * 2

    if (yMisplaced || xMisplaced) {
      const centerX = kidsCenterX
      const newY    = yMisplaced ? kidsMinY - NODE_H - V_GAP : selfY
      const sp      = spouseOf[r.id]

      if (sp && pos[sp] != null) {
        const [L, R] = isLeftInCouple.has(r.id) ? [r.id, sp] : [sp, r.id]
        pos[L] = { x: centerX - COUPLE_GAP / 2 - NODE_W, y: newY }
        pos[R] = { x: centerX + COUPLE_GAP / 2,          y: newY }
      } else {
        pos[r.id] = { x: centerX - NODE_W / 2, y: newY }
      }
    }
  }

  // ── 4c. Sibling chain compaction ────────────────────────────────────────────
  // Nodes linked by isSibling edges but placed as separate root families
  // (because they have no parent-child edge in the tree) need to be pulled
  // adjacent to their chain anchor — the sibling that *does* have parents.

  const sibEdges = valid.filter(e => isSiblingEdge(e))
  if (sibEdges.length) {
    // Build adjacency for sibling chains
    const sibAdj = {}
    sibEdges.forEach(e => {
      ;(sibAdj[e.source] ??= []).push(e.target)
      ;(sibAdj[e.target] ??= []).push(e.source)
    })

    // Find connected components of sibling-linked nodes
    const sibVisited = new Set()
    const sibComponents = []
    Object.keys(sibAdj).forEach(id => {
      if (sibVisited.has(id)) return
      const comp = []
      const queue = [id]
      while (queue.length) {
        const cur = queue.shift()
        if (sibVisited.has(cur)) continue
        sibVisited.add(cur); comp.push(cur)
        sibAdj[cur].forEach(nb => { if (!sibVisited.has(nb)) queue.push(nb) })
      }
      sibComponents.push(comp)
    })

    sibComponents.forEach(comp => {
      // A node is "anchored" if it (or its spouse) has parents — meaning it was
      // placed by the main parent-child layout, not just dropped as a stray root.
      const isAnchored = id =>
        !!(parentsOf[id]?.length) ||
        !!(spouseOf[id] && parentsOf[spouseOf[id]]?.length)

      const anchored = comp.filter(id => isAnchored(id))
      const strays   = comp.filter(id => !isAnchored(id))
      if (!anchored.length || !strays.length) return

      // Reference Y from anchored nodes (all should share the same generation Y)
      const refY = Math.min(...anchored.map(id => pos[id]?.y ?? 0))

      // Full extent of the anchored subtree
      const anchoredSubtreeNodes = anchored.flatMap(id => [...collectSubtree(id)])
        .filter(id => pos[id] != null)
      let rightX = Math.max(...anchoredSubtreeNodes.map(id => pos[id].x + NODE_W).concat([0]))
      let leftX  = Math.min(...anchoredSubtreeNodes.map(id => pos[id].x).concat([0]))

      // Determine which side each stray belongs on using sibling edge direction:
      // source of a sibling edge is the LEFT node, target is the RIGHT node.
      // A stray that is SOURCE of an edge into an anchored node → goes LEFT.
      // A stray that is TARGET of an edge from an anchored node → goes RIGHT.
      const strayGoesLeft = (strayId) =>
        sibEdges.some(e => e.source === strayId && anchored.includes(e.target))

      // Separate into left-strays and right-strays, preserving chain order
      const leftStrays  = strays.filter(id =>  strayGoesLeft(id))
        .sort((a, b) => (pos[b]?.x ?? 0) - (pos[a]?.x ?? 0)) // right-to-left for left side
      const rightStrays = strays.filter(id => !strayGoesLeft(id))
        .sort((a, b) => (pos[a]?.x ?? 0) - (pos[b]?.x ?? 0)) // left-to-right for right side

      // Place left-strays to the left of the anchored group
      leftStrays.forEach(strayId => {
        const strayNodes = [...collectSubtree(strayId)].filter(id => pos[id] != null)
        if (!strayNodes.length) return

        const strayRight = Math.max(...strayNodes.map(id => pos[id].x + NODE_W))
        const strayTop   = Math.min(...strayNodes.map(id => pos[id].y))

        const dx = leftX - H_GAP - strayRight
        const dy = refY - strayTop

        strayNodes.forEach(id => {
          pos[id] = { x: pos[id].x + dx, y: pos[id].y + dy }
        })

        leftX = Math.min(...strayNodes.map(id => pos[id].x))
      })

      // Place right-strays to the right of the anchored group
      rightStrays.forEach(strayId => {
        const strayNodes = [...collectSubtree(strayId)].filter(id => pos[id] != null)
        if (!strayNodes.length) return

        const strayLeft = Math.min(...strayNodes.map(id => pos[id].x))
        const strayTop  = Math.min(...strayNodes.map(id => pos[id].y))

        const dx = rightX + H_GAP - strayLeft
        const dy = refY - strayTop

        strayNodes.forEach(id => {
          pos[id] = { x: pos[id].x + dx, y: pos[id].y + dy }
        })

        rightX = Math.max(...strayNodes.map(id => pos[id].x + NODE_W))
      })
    })
  }

  // ── 4d. Y-snap: guarantee every sibling pair shares the same generation row ──
  // Step 4c handles most cases, but if a stray ended up on a different Y band
  // (e.g. it had its own spouse and was placed as a root at y=0 while the anchor
  // is at y=NODE_H+V_GAP) this final pass moves the entire stray subtree to match.
  {
    const snapDone = new Set()
    sibEdges.forEach(e => {
      const [a, b] = [e.source, e.target]
      if (!pos[a] || !pos[b]) return
      if (pos[a].y === pos[b].y) return

      // The anchor is whichever has more structural weight (parents or children).
      // If tied, prefer the one with parents (it was placed by the main tree).
      const aScore = (parentsOf[a]?.length ?? 0) * 10 + unitKids(a).length
      const bScore = (parentsOf[b]?.length ?? 0) * 10 + unitKids(b).length
      let anchor, stray
      if (aScore > bScore)      { anchor = a; stray = b }
      else if (bScore > aScore) { anchor = b; stray = a }
      else if (parentsOf[a]?.length) { anchor = a; stray = b }
      else if (parentsOf[b]?.length) { anchor = b; stray = a }
      else return // both equal weight — skip

      if (snapDone.has(stray)) return
      snapDone.add(stray)

      const dy = pos[anchor].y - pos[stray].y
      ;[...collectSubtree(stray)].forEach(id => {
        if (pos[id]) pos[id] = { x: pos[id].x, y: pos[id].y + dy }
      })
    })
  }

  // ── 5. Fall-back row for disconnected / orphan nodes ───────────────────────

  const maxY = Object.values(pos).reduce((m, p) => Math.max(m, p.y), 0)
  let sx = 0
  for (const n of nodes) {
    if (pos[n.id] == null) {
      pos[n.id] = { x: sx, y: maxY + NODE_H + 120 }
      sx += NODE_W + H_GAP
    }
  }

  // ── 6. Eliminate per-row overlaps ───────────────────────────────────────────
  // After all placement passes, nodes that share a Y row may overlap (e.g.
  // a repositioned parent landing on top of an existing root couple).
  // Scan each row left-to-right; if two adjacent nodes are too close, shift
  // the right-hand node (and its whole subtree) rightward until there is at
  // least H_GAP between them.  Repeat up to 5 times so cascading shifts settle.

  for (let pass = 0; pass < 5; pass++) {
    const rowMap = new Map()
    for (const [id, p] of Object.entries(pos)) {
      if (!rowMap.has(p.y)) rowMap.set(p.y, [])
      rowMap.get(p.y).push(id)
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

  // ── 7. Return updated nodes ─────────────────────────────────────────────────

  return nodes.map(n => ({ ...n, position: pos[n.id] ?? n.position }))
}
