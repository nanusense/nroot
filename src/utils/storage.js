// localStorage is no longer used for the shared tree — that lives in Supabase (db.js).
// This file keeps only the JSON export/import helpers for local backup.

export function exportJSON(nodes, edges) {
  const data = JSON.stringify({ nodes, edges }, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'roots_family_map.json'
  a.click()
  URL.revokeObjectURL(url)
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result)
        if (!parsed.nodes || !parsed.edges) throw new Error('Invalid format')
        resolve(parsed)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}
