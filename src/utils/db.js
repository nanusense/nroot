import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Detect whether Supabase is actually configured
const isSupabaseConfigured =
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseKey.includes('your-anon-key')

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null

const TREE_ID = 1
const LS_KEY = 'family_tree'

const DEFAULT_NODES = [
  {
    id: 'root',
    type: 'person',
    position: { x: 0, y: 0 },
    data: { name: 'Family Root', yearOfBirth: '' },
  },
]

/** Fetch the shared tree — from Supabase if configured, otherwise localStorage */
export async function loadTree() {
  if (!isSupabaseConfigured) {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.nodes?.length) return parsed
      }
    } catch { /* ignore */ }
    return { nodes: DEFAULT_NODES, edges: [] }
  }

  const { data, error } = await supabase
    .from('family_tree')
    .select('nodes, edges')
    .eq('id', TREE_ID)
    .single()

  if (error || !data) {
    return { nodes: DEFAULT_NODES, edges: [] }
  }

  return {
    nodes: data.nodes?.length ? data.nodes : DEFAULT_NODES,
    edges: data.edges ?? [],
  }
}

/** Persist the shared tree — to Supabase if configured, otherwise localStorage */
export async function saveTree(nodes, edges) {
  if (!isSupabaseConfigured) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ nodes, edges }))
    } catch { /* ignore */ }
    return
  }

  await supabase
    .from('family_tree')
    .upsert({ id: TREE_ID, nodes, edges, updated_at: new Date().toISOString() })
}

/**
 * Subscribe to real-time changes from other family members.
 * Returns a no-op channel object when Supabase is not configured.
 */
export function subscribeToTree(onChange) {
  if (!isSupabaseConfigured) {
    // Return a fake channel with a no-op so callers can safely call removeChannel
    return { unsubscribe: () => {} }
  }

  return supabase
    .channel('tree-sync')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'family_tree' },
      (payload) => onChange(payload.new)
    )
    .subscribe()
}
