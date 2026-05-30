import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useSourceStore } from '../../store/sourceStore'
import type { Source } from '../../types'
import { Button, Tag } from '../../ui'

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v9.5" />
      <path d="M5 6l4-4 4 4" />
      <path d="M3 13v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 16l4-5 4 3 5-7 3 4" />
      <path d="M3 19h16" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" />
    </svg>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function parseCSVPreview(text: string, maxRows = 5): { cols: string[]; rows: Record<string, string>[] } {
  const lines = text.split('\n').filter(l => l.trim())
  if (!lines.length) return { cols: [], rows: [] }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
      else cur += ch
    }
    result.push(cur.trim())
    return result
  }

  const cols = parseLine(lines[0])
  const rows = lines.slice(1, maxRows + 1).map(line => {
    const vals = parseLine(line)
    const obj: Record<string, string> = {}
    cols.forEach((col, i) => { obj[col] = vals[i] ?? '' })
    return obj
  })
  return { cols, rows }
}

function formatRows(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M events'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K events'
  return n + ' events'
}

function timeAgo(iso: string): string {
  // Backend stores UTC without 'Z' — force UTC interpretation to avoid timezone offset
  const normalized = /[Z+\-]\d*$/.test(iso.trim()) ? iso : iso + 'Z'
  const diff = Date.now() - new Date(normalized).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(normalized).toLocaleDateString()
}

const FORMATS = ['Amplitude export', 'Mixpanel export', 'Custom CSV', 'Segment export']

export default function Upload() {
  const navigate = useNavigate()
  const { setActiveSource, setPreview, demoMode } = useSourceStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentSources, setRecentSources] = useState<Source[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewCols, setPreviewCols] = useState<string[]>([])
  const [previewData, setPreviewData] = useState<Record<string, string>[]>([])

  useEffect(() => {
    api.sources.list()
      .then(({ data }) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        // Keep only the most recent demo entry to avoid duplicates
        let demoSeen = false
        const deduped = sorted.filter(src => {
          if (src.is_demo) {
            if (demoSeen) return false
            demoSeen = true
          }
          return true
        })
        setRecentSources(deduped.slice(0, 5))
      })
      .catch(() => {})
  }, [])

  function showPreview(file: File) {
    setError(null)
    setPendingFile(file)
    const reader = new FileReader()
    reader.onload = e => {
      const { cols, rows } = parseCSVPreview((e.target?.result as string) ?? '')
      setPreviewCols(cols)
      setPreviewData(rows)
    }
    reader.readAsText(file.slice(0, 131072)) // first 128 KB is enough for preview
  }

  function cancelPreview() {
    setPendingFile(null)
    setPreviewCols([])
    setPreviewData([])
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDemo() {
    setError(null)
    setDemoLoading(true)
    try {
      const { data } = await api.sources.fromDemo()
      const { data: src } = await api.sources.get(data.source_id)
      setActiveSource(src)
      setPreview({
        source_id: data.source_id,
        columns: (src.metadata.columns as string[]) ?? [],
        preview_rows: (src.metadata.preview_rows as Record<string, unknown>[]) ?? [],
        detected_format: (src.metadata.detected_format as 'amplitude' | 'mixpanel' | 'custom') ?? 'custom',
        total_rows: (src.metadata.total_rows as number) ?? 0,
      })
      navigate(`/mapping/${data.source_id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to load demo. Please try again.')
    } finally {
      setDemoLoading(false)
    }
  }

  async function handleFile(file: File) {
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.sources.uploadCsv(file)
      setActiveSource({
        id: data.source_id,
        type: 'product_events',
        name: file.name,
        created_at: new Date().toISOString(),
        metadata: {
          columns: data.columns,
          detected_format: data.detected_format,
          total_rows: data.total_rows,
          preview_rows: data.preview_rows,
          mapping: {},
        },
      })
      setPreview({
        source_id: data.source_id,
        columns: data.columns,
        preview_rows: data.preview_rows,
        detected_format: data.detected_format,
        total_rows: data.total_rows,
      })
      navigate(`/mapping/${data.source_id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Upload failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-start px-6 pt-24 pb-16 gap-8">
      {/* Demo mode banner */}
      {demoMode && (
        <div
          className="w-full max-w-[700px] text-[13px] text-center rounded-lg px-4 py-3 leading-[1.5]"
          style={{ background: 'var(--accent-tint)', color: 'var(--accent)', border: '1px solid color-mix(in oklch, var(--accent) 25%, transparent)' }}
        >
          This is a public demo — AI features are disabled for custom uploads. Clone the repo and add your API key to run live analysis on your own data.
        </div>
      )}
      {/* Hero */}
      <div className="text-center max-w-[620px]">
        <h1 className="text-[32px] font-medium tracking-[-0.5px] text-fg leading-tight mb-3">
          Turn raw product data into insights in 60 seconds.
        </h1>
        <p className="text-[15px] text-fg-muted leading-[1.5] max-w-[520px] mx-auto">
          Drop a CSV of events. Get a dashboard, an honest summary of what's happening,
          and an agent that can answer follow-up questions. Numbers computed on pandas — never guessed.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className="w-full max-w-[560px] rounded-lg transition-[background,border-color] duration-150"
        style={{
          border: `1px ${pendingFile ? 'solid' : 'dashed'} ${dragging ? 'var(--accent)' : pendingFile ? 'var(--border)' : hover ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: dragging
            ? 'color-mix(in oklch, var(--accent) 6%, var(--surface))'
            : 'var(--surface)',
          cursor: pendingFile ? 'default' : 'pointer',
        }}
        onMouseEnter={() => { if (!pendingFile) setHover(true) }}
        onMouseLeave={() => setHover(false)}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) showPreview(f)
        }}
        onClick={() => { if (!pendingFile) fileRef.current?.click() }}
      >
        {pendingFile ? (
          /* ── Preview mode ── */
          <div className="px-5 py-5">
            {/* File info */}
            <div className="flex items-center gap-2 mb-4">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted shrink-0">
                <rect x="2" y="1" width="10" height="12" rx="1.5" />
                <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" />
              </svg>
              <span className="text-[13px] font-medium text-fg truncate flex-1">{pendingFile.name}</span>
              <span className="text-[12px] text-fg-subtle shrink-0">{formatBytes(pendingFile.size)}</span>
            </div>

            {/* Preview table */}
            {previewCols.length > 0 && (
              <div className="overflow-x-auto rounded border border-border mb-4">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      {previewCols.slice(0, 6).map(col => (
                        <th key={col} className="px-3 py-[6px] text-left font-medium text-fg-muted border-b border-border whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      {previewCols.length > 6 && (
                        <th className="px-3 py-[6px] text-left font-medium text-fg-subtle border-b border-border">
                          +{previewCols.length - 6} more
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                        {previewCols.slice(0, 6).map(col => (
                          <td key={col} className="px-3 py-[5px] text-fg-muted max-w-[160px] truncate">
                            {row[col]}
                          </td>
                        ))}
                        {previewCols.length > 6 && <td className="px-3 py-[5px] text-fg-subtle">…</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && <div className="mb-3 text-[13px] text-danger">{error}</div>}

            <div className="flex gap-2">
              <Button variant="primary" size="md" disabled={loading} onClick={e => { e.stopPropagation(); handleFile(pendingFile) }}>
                {loading ? 'Uploading…' : 'Upload'}
              </Button>
              <Button variant="ghost" size="md" disabled={loading} onClick={e => { e.stopPropagation(); cancelPreview() }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          /* ── Default mode ── */
          <div className="text-center px-8 py-10">
            <div className="w-10 h-10 rounded-lg bg-surface-2 border border-border text-fg-muted inline-flex items-center justify-center mb-3">
              <UploadIcon />
            </div>
            <div className="text-[14px] font-medium text-fg mb-1">
              {dragging ? 'Drop to upload' : 'Drop a CSV here, or click to pick a file'}
            </div>
            <div className="text-[13px] text-fg-muted">
              Up to 100 MB. Nothing leaves your machine while we process.
            </div>
            <div className="mt-[10px] flex items-center justify-center gap-[6px] flex-wrap">
              <span className="text-[11px] text-fg-subtle">Needs columns:</span>
              {['user_id', 'timestamp', 'event_name'].map(col => (
                <code
                  key={col}
                  className="text-[11px] px-[6px] py-[1px] rounded"
                  style={{ background: 'var(--surface-2)', color: 'var(--fg-muted)', fontFamily: 'monospace' }}
                >
                  {col}
                </code>
              ))}
              <span className="text-[11px] text-fg-subtle">+ any extra properties</span>
            </div>

            {error && <div className="mt-3 text-[13px] text-danger">{error}</div>}

            <div className="mt-[18px] inline-flex gap-2">
              <Button
                variant="primary"
                size="md"
                disabled={loading}
                onClick={e => { e.stopPropagation(); fileRef.current?.click() }}
              >
                Choose file
              </Button>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) showPreview(f)
          }}
        />
      </div>

      {/* Demo card */}
      <div className="w-full max-w-[560px] bg-surface border border-border rounded-lg p-4 flex items-center gap-[14px]">
        <div className="w-11 h-11 rounded-md bg-surface-2 border border-border flex items-center justify-center text-fg-muted flex-shrink-0">
          <ChartIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-fg mb-[2px]">No CSV at hand?</div>
          <div className="text-[13px] text-fg-muted">
            Try the demo: 50,310 events from a SaaS task manager, 60-day window.
          </div>
        </div>
        <Button
          variant="ghost"
          size="md"
          disabled={demoLoading || loading}
          trailing={<ArrowRight />}
          onClick={handleDemo}
        >
          {demoLoading ? 'Loading…' : 'Open'}
        </Button>
      </div>

      {/* Supported formats */}
      <div className="flex flex-col items-center gap-[10px]">
        <div className="text-[11px] text-fg-subtle">Pre-mapped for</div>
        <div className="flex gap-2 flex-wrap justify-center">
          {FORMATS.map(f => (
            <Tag key={f} tone="outline">{f}</Tag>
          ))}
        </div>
      </div>

      {/* Recent datasets */}
      {recentSources.length > 0 && (
        <div className="w-full max-w-[560px]">
          <div className="text-[11px] font-medium text-fg-subtle uppercase tracking-wide mb-3">Recent datasets</div>
          <div className="flex flex-col gap-[6px]">
            {recentSources.map(src => {
              const rows = src.metadata?.total_rows as number | undefined
              const isDemoDataset = src.is_demo === true
              return (
                <div
                  key={src.id}
                  className="w-full flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/${src.id}`)}
                    className="flex-1 flex items-center gap-3 px-4 py-3 rounded-lg text-left cursor-pointer transition-colors duration-[80ms] min-w-0"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-fg truncate">{src.name}</span>
                        {isDemoDataset && <Tag tone="outline">Demo</Tag>}
                      </div>
                      {rows !== undefined && (
                        <div className="text-[12px] text-fg-muted mt-[1px]">{formatRows(rows)}</div>
                      )}
                    </div>
                    <div className="text-[11px] text-fg-subtle shrink-0">{timeAgo(src.created_at)}</div>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-fg-subtle shrink-0">
                      <path d="M2.5 6h7M6.5 3L9.5 6l-3 3" />
                    </svg>
                  </button>
                  {!isDemoDataset && (
                    <button
                      type="button"
                      title="Delete dataset"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${src.name}"?`)) return
                        try {
                          await api.sources.delete(src.id)
                          setRecentSources(prev => prev.filter(s => s.id !== src.id))
                        } catch {}
                      }}
                      className="shrink-0 flex items-center justify-center w-[32px] h-[32px] rounded-md transition-colors duration-[80ms]"
                      style={{ color: 'var(--fg-subtle)', border: '1px solid transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-tint, color-mix(in oklch, var(--danger) 10%, transparent))' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-subtle)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3.5h9M4.5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M10.5 3.5l-.6 7a.5.5 0 0 1-.5.5H3.6a.5.5 0 0 1-.5-.5l-.6-7" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
