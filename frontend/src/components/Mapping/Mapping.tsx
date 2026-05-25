import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import { useAnalysisStore } from '../../store/analysisStore'
import { useSourceStore } from '../../store/sourceStore'
import type { ColumnMapping } from '../../types'
import { Button, Field, Select, DataTable, InfoTip } from '../../ui'

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 7H3M6.5 3.5L3 7l3.5 3.5" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7.5l3 3 6-7" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="animate-spin">
      <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.5 2.5l1.4 1.4M8.1 8.1l1.4 1.4M2.5 9.5l1.4-1.4M8.1 3.9l1.4-1.4" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 1.5L1 9.5h9L5.5 1.5z" />
      <path d="M5.5 4.5v2.5M5.5 8.5h.01" strokeWidth="1.6" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5.5h6M5.5 2.5L8.5 5.5l-3 3" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 1v7M2.5 5.5l3 3 3-3M1.5 9.5h8" />
    </svg>
  )
}

// ── Profile selection ─────────────────────────────────────────────
interface ProfileDef {
  id: string
  label: string
  description: string
  coming_soon?: boolean
  fields?: string[]
  example?: Record<string, string>[]
  filename?: string
}

const PROFILES: ProfileDef[] = [
  {
    id: 'event_log',
    label: 'Event log',
    description: 'One row per user action. Ideal for funnel, retention, and engagement analysis.',
    fields: ['user_id', 'timestamp', 'event_name', 'device', 'country'],
    example: [
      { user_id: 'u_001', timestamp: '2024-03-01 09:12:00', event_name: 'app_opened',  device: 'mobile', country: 'US' },
      { user_id: 'u_001', timestamp: '2024-03-01 09:12:45', event_name: 'task_created', device: 'mobile', country: 'US' },
      { user_id: 'u_002', timestamp: '2024-03-01 10:04:00', event_name: 'signed_up',   device: 'web',    country: 'GB' },
    ],
    filename: 'event_log_example.csv',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    description: 'Revenue events: purchases, refunds, subscriptions.',
    coming_soon: true,
  },
  {
    id: 'user_snapshot',
    label: 'User snapshot',
    description: 'One row per user with properties at a point in time.',
    coming_soon: true,
  },
  {
    id: 'aggregated_metrics',
    label: 'Aggregated metrics',
    description: 'Pre-aggregated time series from your data warehouse.',
    coming_soon: true,
  },
]

function ProfileSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-3 mx-7 mt-4">
      {PROFILES.map(p => {
        const active = p.id === value
        return (
          <button
            key={p.id}
            type="button"
            disabled={!!p.coming_soon}
            onClick={() => !p.coming_soon && onChange(p.id)}
            className="flex flex-col gap-[6px] text-left rounded-lg border px-4 py-3 transition-[border-color,box-shadow] duration-[120ms]"
            style={{
              background: 'var(--surface)',
              borderColor: active ? 'var(--accent)' : 'var(--border)',
              boxShadow: active ? '0 0 0 3px color-mix(in oklch, var(--accent) 14%, transparent)' : 'none',
              cursor: p.coming_soon ? 'default' : 'pointer',
              opacity: p.coming_soon ? 0.5 : 1,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-fg">{p.label}</span>
              {p.coming_soon ? (
                <span className="text-[10px] font-medium px-[6px] py-[2px] rounded-sm" style={{ background: 'var(--surface-2)', color: 'var(--fg-subtle)' }}>
                  Soon
                </span>
              ) : active ? (
                <span className="text-accent"><CheckIcon /></span>
              ) : null}
            </div>
            <p className="text-[12px] text-fg-muted leading-[1.4] m-0">{p.description}</p>
          </button>
        )
      })}
    </div>
  )
}

function FormatExample({ profileId }: { profileId: string }) {
  const profile = PROFILES.find(p => p.id === profileId)
  if (!profile?.fields || !profile.example) return null

  function downloadCsv() {
    const header = profile!.fields!.join(',')
    const dataRows = profile!.example!.map(row => profile!.fields!.map(f => row[f] ?? '').join(','))
    const csv = [header, ...dataRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = profile!.filename ?? 'example.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-7 mt-3 border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-[10px] border-b border-border" style={{ background: 'var(--surface)' }}>
        <span className="text-[12px] font-medium text-fg">Example format</span>
        <button
          type="button"
          onClick={downloadCsv}
          className="inline-flex items-center gap-[6px] text-[12px] text-fg-muted hover:text-fg bg-transparent border-0 cursor-pointer transition-colors px-2 py-1"
        >
          <DownloadIcon />
          Download example CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] font-mono">
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {profile.fields.map(f => (
                <th key={f} className="px-3 py-[7px] text-left font-medium text-fg-muted whitespace-nowrap border-b border-border">
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.example.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                {profile.fields!.map(f => (
                  <td key={f} className="px-3 py-[6px] text-fg-muted whitespace-nowrap">
                    {row[f] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tag-input with built-in dropdown ─────────────────────────────
function PropertyTagSelect({ values, options, onAdd, onRemove, warnings }: {
  values: string[]
  options: string[]
  onAdd: (col: string) => void
  onRemove: (col: string) => void
  warnings?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  useEffect(() => { setActiveIndex(0) }, [options.length])

  function commit(col: string) { onAdd(col); setOpen(false) }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); if (options.length) setOpen(true) }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[activeIndex]) commit(options[activeIndex]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  const noOptions = options.length === 0

  return (
    <div ref={wrapperRef} className="relative">
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={noOptions ? -1 : 0}
        onKeyDown={handleKeyDown}
        onClick={e => {
          if ((e.target as Element).closest('button[data-remove]')) return
          if (!noOptions) setOpen(o => !o)
        }}
        className="flex flex-wrap items-center gap-[6px] min-h-[34px] px-[7px] py-[5px] bg-surface border rounded-md transition-[border-color,box-shadow] duration-[120ms]"
        style={{
          borderColor: open ? 'var(--accent)' : 'var(--border)',
          boxShadow: open ? '0 0 0 3px color-mix(in oklch, var(--accent) 14%, transparent)' : 'none',
          cursor: noOptions ? 'default' : 'pointer',
        }}
      >
        {values.map(v => {
          const warn = warnings?.[v]
          return (
            <span
              key={v}
              className="inline-flex items-center gap-[5px] text-[12px] py-[3px] pl-[8px] pr-[4px] bg-surface-2 border rounded-sm text-fg"
              style={{ borderColor: warn ? 'var(--warning, #d97706)' : 'var(--border)' }}
            >
              {v}
              {warn && (
                <span
                  title={warn}
                  className="flex shrink-0 cursor-help"
                  style={{ color: 'var(--warning, #d97706)' }}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => e.stopPropagation()}
                >
                  <WarnIcon />
                </span>
              )}
              <button
                type="button"
                data-remove="true"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onRemove(v) }}
                className="flex text-fg-subtle hover:text-fg cursor-pointer"
                aria-label={`Remove ${v}`}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
              </button>
            </span>
          )
        })}
        {values.length === 0 && !open && (
          <span className="text-[13px] text-fg-subtle select-none">+ Add column…</span>
        )}
        {values.length > 0 && !noOptions && (
          <span className="text-[13px] text-fg-subtle select-none ml-1">+</span>
        )}
      </div>

      {open && options.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 mt-1 bg-surface border border-border rounded-md overflow-hidden z-20"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {options.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={e => { e.preventDefault(); commit(opt) }}
              className="px-[12px] py-[7px] text-[13px] text-fg cursor-pointer"
              style={{ background: i === activeIndex ? 'var(--surface-2)' : 'transparent' }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Mapping templates ─────────────────────────────────────────────
interface MappingTemplate {
  name: string
  profileId: string
  mapping: Partial<ColumnMapping>
  savedAt: string
}

const TEMPLATES_KEY = 'mapping_templates'

function useTemplates() {
  const [templates, setTemplates] = useState<MappingTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? '[]') } catch { return [] }
  })

  function save(name: string, profileId: string, mapping: Partial<ColumnMapping>) {
    setTemplates(prev => {
      const next = [
        { name, profileId, mapping, savedAt: new Date().toISOString() },
        ...prev.filter(t => t.name !== name),
      ]
      try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function remove(name: string) {
    setTemplates(prev => {
      const next = prev.filter(t => t.name !== name)
      try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return { templates, save, remove }
}

function TemplatesPanel({
  templates, columns, onApply, onSave, onRemove,
}: {
  templates: MappingTemplate[]
  columns: string[]
  onApply: (t: MappingTemplate) => void
  onSave: (name: string) => void
  onRemove: (name: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function commitSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
    setName('')
    setSaving(false)
  }

  return (
    <div className="border-b border-border pb-[14px] flex flex-col gap-[8px]">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-fg-muted">Templates</span>
        <button
          type="button"
          onClick={() => { setSaving(v => !v); setTimeout(() => inputRef.current?.focus(), 50) }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in oklch, var(--accent) 10%, transparent)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = saving ? 'var(--surface-2)' : 'var(--surface)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)' }}
          className="inline-flex items-center gap-[4px] text-[11px] font-medium px-[8px] py-[3px] rounded-md border cursor-pointer transition-[background,border-color]"
          style={{
            background: saving ? 'var(--surface-2)' : 'var(--surface)',
            borderColor: 'var(--border)',
            color: saving ? 'var(--fg-muted)' : 'var(--accent)',
          }}
        >
          {!saving && (
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4.5 1v7M1 4.5h7" />
            </svg>
          )}
          {saving ? 'Cancel' : 'Save current'}
        </button>
      </div>

      {saving && (
        <div className="flex gap-[6px]">
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitSave(); if (e.key === 'Escape') { setSaving(false); setName('') } }}
            placeholder="Template name…"
            className="flex-1 text-[12px] px-[8px] py-[5px] bg-surface border border-border rounded-md text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
            style={{ minWidth: 0 }}
          />
          <button
            type="button"
            onClick={commitSave}
            disabled={!name.trim()}
            className="text-[12px] font-medium px-[10px] py-[5px] rounded-md transition-colors cursor-pointer border-0"
            style={{
              background: name.trim() ? 'var(--accent)' : 'var(--surface-2)',
              color: name.trim() ? '#fff' : 'var(--fg-subtle)',
              cursor: name.trim() ? 'pointer' : 'default',
            }}
          >
            Save
          </button>
        </div>
      )}

      {templates.length === 0 && !saving && (
        <p className="text-[11px] text-fg-subtle">No saved templates yet.</p>
      )}

      {templates.map(t => {
        const colSet = new Set(columns)
        let compatible = 0, total = 0
        if (t.mapping.user_id) { total++; if (colSet.has(t.mapping.user_id)) compatible++ }
        if (t.mapping.timestamp) { total++; if (colSet.has(t.mapping.timestamp)) compatible++ }
        if (t.mapping.event_name) { total++; if (colSet.has(t.mapping.event_name)) compatible++ }
        if (t.mapping.properties) {
          const props = t.mapping.properties.split(',').filter(Boolean)
          total += props.length
          compatible += props.filter(p => colSet.has(p)).length
        }
        return (
          <div key={t.name} className="flex items-center gap-[6px] group">
            <button
              type="button"
              onClick={() => onApply(t)}
              className="flex-1 min-w-0 text-left text-[12px] px-[8px] py-[5px] bg-surface-2 border border-border rounded-md hover:border-accent transition-colors cursor-pointer"
            >
              <div className="truncate text-fg font-medium">{t.name}</div>
              <div className="text-[10px] text-fg-subtle mt-[1px]">
                {compatible}/{total} columns match
              </div>
            </button>
            <button
              type="button"
              onClick={() => onRemove(t.name)}
              aria-label={`Delete ${t.name}`}
              className="opacity-0 group-hover:opacity-100 flex text-fg-subtle hover:text-danger bg-transparent border-0 cursor-pointer p-1 transition-[opacity,color]"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default function Mapping() {
  const { source_id } = useParams<{ source_id: string }>()
  const navigate = useNavigate()
  const { activeSource, preview, setPreview, setActiveSource } = useSourceStore()
  const { clearForSource } = useAnalysisStore()

  const [profileId, setProfileId] = useState<string>(
    (activeSource?.metadata?.profile as string | undefined)
      ?? preview?.profile
      ?? 'event_log'
  )
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({})
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [submitStep, setSubmitStep] = useState<'idle' | 'saving' | 'redirecting'>('idle')
  // Tracks the mapping as saved on the server — used to skip re-analysis when nothing changed
  const savedRef = useRef<{ mapping: Partial<ColumnMapping>; profileId: string } | null>(null)

  const sessionKey = source_id ? `mapping:${source_id}` : null

  // Persist mapping to sessionStorage on every change
  useEffect(() => {
    if (!sessionKey || Object.keys(mapping).length === 0) return
    sessionStorage.setItem(sessionKey, JSON.stringify(mapping))
  }, [mapping, sessionKey])

  useEffect(() => {
    if (!source_id) return
    // Only use cached preview if it belongs to this source — otherwise refetch.
    const previewMatches = preview?.columns?.length && (!preview.source_id || preview.source_id === source_id)
    if (previewMatches) {
      // Prefer activeSource.mapping (always fresh), fall back to preview.mapping for the
      // direct-nav case where activeSource hasn't been rehydrated yet.
      const saved = (activeSource?.metadata?.mapping as Partial<ColumnMapping> | undefined)
        ?? preview!.mapping
      initMapping(preview!.detected_format, preview!.columns, saved, preview!.profile)
      if (preview!.profile) setProfileId(preview!.profile)
      return
    }
    setLoading(true)
    api.sources.getPreview(source_id)
      .then(({ data }) => {
        setPreview({ ...data, source_id })
        if (!activeSource || activeSource.id !== source_id) {
          api.sources.get(source_id).then(({ data: src }) => setActiveSource(src))
        }
        initMapping(data.detected_format, data.columns, data.mapping, data.profile)
        if (data.profile) setProfileId(data.profile)
      })
      .catch(() => setFetchError('Could not load source. Please upload your file again.'))
      .finally(() => setLoading(false))
  }, [source_id])

  function initMapping(format: string, cols: string[], saved?: Partial<ColumnMapping>, loadedProfile?: string) {
    // Record the server-side baseline for change detection at submit time
    if (saved && Object.keys(saved).length > 0) {
      savedRef.current = { mapping: saved, profileId: loadedProfile ?? 'event_log' }
    }
    // Restore in-progress edits from sessionStorage first
    if (sessionKey) {
      const stored = sessionStorage.getItem(sessionKey)
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Partial<ColumnMapping>
          if (Object.keys(parsed).length > 0) { setMapping(parsed); return }
        } catch {}
      }
    }
    if (saved && Object.keys(saved).length > 0) { setMapping(saved); return }
    if (format === 'amplitude') {
      setMapping({ user_id: 'user_id', timestamp: 'event_time', event_name: 'event_type' })
    } else if (format === 'mixpanel') {
      setMapping({ user_id: 'distinct_id', timestamp: 'time', event_name: 'event' })
    }
  }

  async function handleSubmit() {
    if (!source_id) return

    const orig = savedRef.current
    const unchanged = orig &&
      JSON.stringify(mapping) === JSON.stringify(orig.mapping) &&
      profileId === orig.profileId

    flushSync(() => {
      setSubmitError(null)
      setLoading(true)
      setSubmitStep(unchanged ? 'redirecting' : 'saving')
    })

    if (unchanged) {
      await new Promise(r => setTimeout(r, 350))
      navigate(`/dashboard/${source_id}`)
      return
    }

    try {
      const saveStart = Date.now()
      await api.sources.saveMapping(source_id, mapping as ColumnMapping, profileId)
      clearForSource(source_id)
      try {
        const { data: src } = await api.sources.get(source_id)
        setActiveSource(src)
      } catch {}
      if (sessionKey) sessionStorage.removeItem(sessionKey)
      // Keep 'saving' visible for at least 400ms so it's readable
      const elapsed = Date.now() - saveStart
      if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed))
      flushSync(() => setSubmitStep('redirecting'))
      await new Promise(r => setTimeout(r, 250))
      navigate(`/dashboard/${source_id}`)
    } catch (err: any) {
      setSubmitStep('idle')
      setSubmitError(err?.response?.data?.detail ?? 'Failed to save mapping. Check required fields.')
    } finally {
      setLoading(false)
    }
  }

  const columns = preview?.columns ?? []
  const rows = (preview?.preview_rows ?? []) as Record<string, string>[]
  const detectedFormat = preview?.detected_format ?? 'custom'
  const sourceName = activeSource?.name ?? 'dataset.csv'
  const totalRows = preview?.total_rows

  const [eventsExpanded, setEventsExpanded] = useState(() => {
    try { return localStorage.getItem('mapping_events_expanded') !== 'false' } catch { return true }
  })
  const [eventCounts, setEventCounts] = useState<{ name: string; count: number }[]>([])
  const [eventCountsLoading, setEventCountsLoading] = useState(false)

  // Fetch full-dataset event counts whenever the chosen column changes
  useEffect(() => {
    if (!source_id || !mapping.event_name) { setEventCounts([]); return }
    const col = mapping.event_name
    let cancelled = false
    const timer = setTimeout(() => {
      setEventCountsLoading(true)
      api.sources.getEventCounts(source_id, col)
        .then(({ data }) => { if (!cancelled) setEventCounts(data.counts) })
        .catch(() => { if (!cancelled) setEventCounts([]) })
        .finally(() => { if (!cancelled) setEventCountsLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [source_id, mapping.event_name])

  // Parse sample timestamp values from preview rows to show how they'll be interpreted
  const timestampPreviews = useMemo(() => {
    if (!mapping.timestamp || rows.length === 0) return []
    const col = mapping.timestamp
    const samples = rows.map(r => String(r[col] ?? '').trim()).filter(Boolean).slice(0, 3)
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    return samples.map(raw => {
      let date: Date | null = null
      let d = new Date(raw)
      if (!isNaN(d.getTime())) { date = d }
      if (!date) { d = new Date(raw.replace(' ', 'T')); if (!isNaN(d.getTime())) date = d }
      if (!date && !isNaN(Number(raw))) {
        const n = Number(raw)
        if (n > 1e9 && n < 1e10) { d = new Date(n * 1000); if (!isNaN(d.getTime())) date = d }
        else if (n > 1e12) { d = new Date(n); if (!isNaN(d.getTime())) date = d }
      }
      return { raw, formatted: date ? fmt.format(date) + ' UTC' : null }
    })
  }, [mapping.timestamp, rows])

  const timestampWarning = useMemo(() => {
    if (timestampPreviews.length === 0) return null
    const bad = timestampPreviews.filter(p => !p.formatted).length
    return bad > timestampPreviews.length / 2
      ? "Couldn't parse these values as dates — check the column format."
      : null
  }, [timestampPreviews])

  // Warn when the chosen event_name column looks like dates or numbers (from preview rows)
  const eventNameWarning = useMemo(() => {
    if (!mapping.event_name || rows.length === 0) return null
    const col = mapping.event_name
    const vals = rows.map(r => String(r[col] ?? '').trim()).filter(Boolean)
    if (vals.length === 0) return null
    const dateRe = /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}/i
    const numericCount = vals.filter(v => v !== '' && !isNaN(Number(v))).length
    const dateCount = vals.filter(v => dateRe.test(v) || (v !== '' && !isNaN(Number(v)) && Number(v) > 1_000_000_000)).length
    if (numericCount / vals.length > 0.8) return 'Looks numeric — event names should be strings like "signup" or "page_view".'
    if (dateCount / vals.length > 0.8) return 'Looks like a timestamp — pick the event name column instead.'
    return null
  }, [mapping.event_name, rows])

  const { templates, save: saveTemplate, remove: removeTemplate } = useTemplates()

  function applyTemplate(t: MappingTemplate) {
    const cols = new Set(columns)
    const applied: Partial<ColumnMapping> = {}
    if (t.mapping.user_id && cols.has(t.mapping.user_id)) applied.user_id = t.mapping.user_id
    if (t.mapping.timestamp && cols.has(t.mapping.timestamp)) applied.timestamp = t.mapping.timestamp
    if (t.mapping.event_name && cols.has(t.mapping.event_name)) applied.event_name = t.mapping.event_name
    if (t.mapping.properties) {
      const kept = t.mapping.properties.split(',').filter(p => p && cols.has(p))
      if (kept.length) applied.properties = kept.join(',')
    }
    setMapping(prev => ({ ...prev, ...applied }))
    setProfileId(t.profileId)
  }

  const [conflictNotice, setConflictNotice] = useState<string | null>(null)
  const conflictUndoRef = useRef<Partial<ColumnMapping> | null>(null)

  function setRequiredField(field: 'user_id' | 'timestamp' | 'event_name', value: string) {
    setMapping(m => {
      const props = m.properties ? m.properties.split(',').filter(Boolean) : []
      if (props.includes(value)) {
        const labels = { user_id: 'User identifier', timestamp: 'Event timestamp', event_name: 'Event name' }
        setConflictNotice(`"${value}" removed from Properties — now used as ${labels[field]}.`)
        conflictUndoRef.current = m
        return { ...m, [field]: value, properties: props.filter(p => p !== value).join(',') }
      }
      return { ...m, [field]: value }
    })
  }

  function undoConflict() {
    if (conflictUndoRef.current) {
      setMapping(conflictUndoRef.current)
      conflictUndoRef.current = null
    }
    setConflictNotice(null)
  }

  const propertyList = mapping.properties ? mapping.properties.split(',').filter(Boolean) : []
  const addProperty = (col: string) => {
    if (!col || propertyList.includes(col)) return
    setMapping(m => ({ ...m, properties: [...propertyList, col].join(',') }))
  }
  const removeProperty = (col: string) => {
    setMapping(m => ({ ...m, properties: propertyList.filter(p => p !== col).join(',') }))
  }
  const availableForProps = columns.filter(c =>
    c !== mapping.user_id && c !== mapping.timestamp && c !== mapping.event_name && !propertyList.includes(c)
  )

  const propertyWarnings = useMemo(() => {
    if (rows.length === 0) return {}
    const result: Record<string, string> = {}
    for (const col of propertyList) {
      const vals = rows.map(r => String(r[col] ?? '').trim())
      const nonEmpty = vals.filter(Boolean)
      const fillRate = nonEmpty.length / rows.length
      const uniqueCount = new Set(nonEmpty).size
      const uniqueRatio = nonEmpty.length > 0 ? uniqueCount / nonEmpty.length : 0
      if (fillRate < 0.2) {
        result[col] = `Only ${Math.round(fillRate * 100)}% of preview rows have a value — may not be useful for segmentation.`
      } else if (uniqueRatio > 0.8 && uniqueCount >= 5) {
        result[col] = `High cardinality (${uniqueCount}+ unique values) — likely an ID, not useful for segmentation.`
      }
    }
    return result
  }, [propertyList, rows])

  const canSubmit = !!mapping.user_id && !!mapping.timestamp && !!mapping.event_name && !loading
  const tableColumns = columns.map(col => ({ key: col, label: col, mono: true }))

  if (fetchError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-16 text-center">
        <p className="text-[13px] text-danger">{fetchError}</p>
        <Button variant="secondary" onClick={() => navigate('/upload')}>← Back to upload</Button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Dataset strip */}
      <div className="flex items-center px-7 pt-[18px] pb-[6px]">
        <button
          onClick={() => navigate(-1)}
          title="Go back"
          className="inline-flex items-center justify-center p-[6px] rounded-sm text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors bg-transparent border-0 cursor-pointer mr-3"
        >
          <BackIcon />
        </button>
        <div className="min-w-0">
          <h2 className="text-[17px] font-medium tracking-[-0.2px] text-fg">Map columns</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[12px] font-mono text-fg">{sourceName}</span>
            {totalRows != null && (
              <>
                <span className="text-[13px] text-fg-subtle">·</span>
                <span className="text-[13px] text-fg-muted">{totalRows.toLocaleString()} rows</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Auto-detect notice */}
      {detectedFormat !== 'custom' && !dismissed && (
        <div className="mx-7 mt-1 px-3 py-[10px] flex items-center gap-[10px] rounded-md"
          style={{ background: 'var(--accent-tint)', border: '1px solid var(--accent-tint)' }}
        >
          <span className="text-accent flex-shrink-0"><CheckIcon /></span>
          <div className="flex-1 min-w-0 text-[13px] text-fg">
            <span className="font-medium capitalize">{detectedFormat} export detected.</span>
            <span className="text-fg-muted ml-[6px]">
              We've pre-filled the mapping — review and analyze, or override anything below.
            </span>
          </div>
          <button
            className="text-[11px] text-fg-muted hover:text-fg px-2 py-1 bg-transparent border-0 cursor-pointer transition-colors"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Block 1: Profile selection */}
      <ProfileSelector value={profileId} onChange={setProfileId} />

      {/* Block 2: Format example for selected profile */}
      <FormatExample profileId={profileId} />

      {/* Body: form + preview */}
      <div
        className="flex-1 grid gap-7 px-7 py-3 min-h-0 items-start"
        style={{ gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1.55fr)' }}
      >
        {/* Mapping panel — left so dropdowns open rightward and stay in viewport */}
        <aside className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-[18px] sticky top-[60px]">
          <TemplatesPanel
            templates={templates}
            columns={columns}
            onApply={applyTemplate}
            onSave={name => saveTemplate(name, profileId, mapping)}
            onRemove={removeTemplate}
          />

          <div>
            <div className="text-[12px] font-medium text-fg">Required</div>
            <div className="text-[11px] text-fg-subtle mt-[2px]">One column per role. The rest are inferred.</div>
          </div>

          <Field label="User identifier" tooltip="Unique identifier per user — not per event session. All events from the same person share one ID.">
            <Select
              value={mapping.user_id ?? ''}
              onChange={e => setRequiredField('user_id', e.target.value)}
              placeholder="— select column —"
            >
              {columns.map(col => <option key={col} value={col}>{col}</option>)}
            </Select>
          </Field>

          <div className="flex flex-col gap-[6px]">
            <Field
              label="Event timestamp"
              hint={timestampWarning ? undefined : "Parsed as UTC unless an offset is present."}
              error={timestampWarning ?? undefined}
            >
              <Select
                value={mapping.timestamp ?? ''}
                onChange={e => setRequiredField('timestamp', e.target.value)}
                placeholder="— select column —"
              >
                {columns.map(col => <option key={col} value={col}>{col}</option>)}
              </Select>
            </Field>
            {timestampPreviews.length > 0 && (
              <div className="rounded-md overflow-hidden border border-border">
                {timestampPreviews.map(({ raw, formatted }, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-[8px] py-[5px] text-[11px] font-mono"
                    style={{
                      borderBottom: i < timestampPreviews.length - 1 ? '1px solid var(--border)' : 'none',
                      background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                    }}
                  >
                    <span className="text-fg-muted truncate min-w-0 flex-1">{raw}</span>
                    <span className="text-fg-subtle shrink-0">→</span>
                    {formatted
                      ? <span className="text-fg shrink-0">{formatted}</span>
                      : <span className="text-danger shrink-0">parse error</span>
                    }
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-[6px]">
            <Field label="Event name" error={eventNameWarning ?? undefined} tooltip="The action the user performed — e.g. 'signup', 'page_view', 'purchase'. Should have low cardinality (10–50 unique values).">
              <Select
                value={mapping.event_name ?? ''}
                onChange={e => setRequiredField('event_name', e.target.value)}
                placeholder="— select column —"
              >
                {columns.map(col => <option key={col} value={col}>{col}</option>)}
              </Select>
            </Field>
            {(eventCounts.length > 0 || eventCountsLoading) && (
              <div className="rounded-md overflow-hidden border border-border">
                <button
                  type="button"
                  onClick={() => setEventsExpanded(v => {
                    const next = !v
                    try { localStorage.setItem('mapping_events_expanded', String(next)) } catch {}
                    return next
                  })}
                  className="w-full px-[8px] py-[5px] flex items-center justify-between border-b border-border cursor-pointer bg-transparent hover:opacity-80 transition-opacity"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <span className="text-[11px] font-medium text-fg-muted">Event names in dataset</span>
                  <div className="flex items-center gap-2">
                    {eventsExpanded && !eventCountsLoading && <span className="text-[10px] text-fg-subtle">count</span>}
                    <svg
                      width="10" height="10" viewBox="0 0 10 10" fill="none"
                      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: eventsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms' }}
                      className="text-fg-subtle"
                    >
                      <path d="M2 3.5l3 3 3-3" />
                    </svg>
                  </div>
                </button>
                {eventsExpanded && (
                  eventCountsLoading ? (
                    <div className="flex flex-col gap-[3px] p-[6px]">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-[22px] rounded animate-pulse" style={{ background: 'var(--surface-2)', width: `${70 + (i % 3) * 10}%` }} />
                      ))}
                    </div>
                  ) : eventCounts.map(({ name, count }, i) => {
                    const max = eventCounts[0].count
                    return (
                      <div
                        key={name}
                        className="relative flex items-center justify-between px-[8px] py-[4px]"
                        style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}
                      >
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{ width: `${(count / max) * 100}%`, background: 'color-mix(in oklch, var(--accent) 10%, transparent)' }}
                        />
                        <span className="relative text-[11px] font-mono text-fg-muted truncate max-w-[75%]">{name}</span>
                        <span className="relative text-[11px] text-fg-subtle tabular-nums ml-2 shrink-0">{count.toLocaleString()}</span>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Optional */}
          <div className="border-t border-border pt-[14px] flex flex-col gap-[14px]">
            <div>
              <div className="text-[12px] font-medium text-fg mb-[2px]">Optional</div>
              <div className="text-[11px] text-fg-subtle">Add property columns for segmentation.</div>
            </div>

            {/* PropertyTagSelect must NOT be inside <Field> (=<label>) — the browser would
                re-dispatch the click to the first focusable child (✕ button), removing the tag. */}
            <div className="flex flex-col gap-[6px]">
              <span className="flex items-center gap-[5px] text-[12px] font-medium text-fg-muted leading-none">
                Properties to keep
                <InfoTip text="Extra columns used for filtering and segmentation — e.g. 'country', 'plan', 'device'. Avoid ID columns with thousands of unique values." />
              </span>
              {conflictNotice && (
                <div
                  className="flex items-center justify-between gap-2 px-[8px] py-[6px] rounded-md text-[11px]"
                  style={{ background: 'color-mix(in oklch, var(--warning, #d97706) 12%, transparent)', border: '1px solid color-mix(in oklch, var(--warning, #d97706) 30%, transparent)' }}
                >
                  <span style={{ color: 'var(--warning, #d97706)' }}>{conflictNotice}</span>
                  <div className="flex items-center gap-[6px] shrink-0">
                    <button
                      type="button"
                      onClick={undoConflict}
                      className="text-[11px] font-medium bg-transparent border-0 cursor-pointer px-[6px] py-[2px] rounded"
                      style={{ color: 'var(--warning, #d97706)', background: 'color-mix(in oklch, var(--warning, #d97706) 15%, transparent)' }}
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={() => setConflictNotice(null)}
                      className="flex bg-transparent border-0 cursor-pointer p-0"
                      style={{ color: 'var(--warning, #d97706)' }}
                      aria-label="Dismiss"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M2 2l6 6M8 2l-6 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              <PropertyTagSelect
                values={propertyList}
                options={availableForProps}
                onAdd={addProperty}
                onRemove={removeProperty}
                warnings={propertyWarnings}
              />
            </div>
          </div>

          {submitError && (
            <p className="text-[12px] text-danger">{submitError}</p>
          )}
        </aside>

        {/* Preview — right column */}
        <div className="flex flex-col gap-[10px] min-w-0">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-fg">Preview</span>
            {totalRows != null && columns.length > 0 && (
              <span className="text-[11px] text-fg-subtle">
                First {rows.length} of {totalRows.toLocaleString()} rows · {columns.length} columns
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <div style={{ minWidth: 600 }}>
              {columns.length > 0 ? (
                <DataTable columns={tableColumns} rows={rows} compact />
              ) : (
                <div className="h-40 flex items-center justify-center text-[13px] text-fg-subtle">
                  Loading…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer action bar */}
      <div className="border-t border-border bg-bg px-7 py-[14px] flex items-center justify-between">
        <span className="text-[13px] text-fg-muted">
          We'll compute every metric on the rows you keep — no sampling, no LLM-guessing.
        </span>
        {submitStep !== 'idle' ? (
          <div className="flex items-center gap-[10px]">
            {(['saving', 'redirecting'] as const).map((step, i, arr) => {
              const labels = { saving: 'Saving mapping', redirecting: 'Redirecting to dashboard' }
              const isActive = submitStep === step
              const isDone = arr.indexOf(submitStep) > i
              return (
                <div key={step} className="flex items-center gap-[10px]">
                  <div className="flex items-center gap-[6px]">
                    <span style={{ color: isDone ? 'var(--accent)' : isActive ? 'var(--fg)' : 'var(--fg-subtle)' }}>
                      {isDone ? <CheckIcon /> : isActive ? <SpinnerIcon /> : (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      )}
                    </span>
                    <span className="text-[13px]" style={{ color: isDone ? 'var(--accent)' : isActive ? 'var(--fg)' : 'var(--fg-subtle)' }}>
                      {labels[step]}
                    </span>
                  </div>
                  {i < arr.length - 1 && (
                    <svg width="16" height="1" viewBox="0 0 16 1"><line x1="0" y1="0.5" x2="16" y2="0.5" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!canSubmit}
              onClick={handleSubmit}
              trailing={<ArrowRightIcon />}
            >
              Analyze
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
