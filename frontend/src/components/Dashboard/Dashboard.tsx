import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { PropertyFilter, ChartSpec, Insight } from '../../types'
import { useAnalysisStore } from '../../store/analysisStore'
import { useSourceStore } from '../../store/sourceStore'
import {
  Button, StatCard, InsightCard, ChartContainer, Tag, Select,
  LineChart, StackedBarChart, HBarChart, FunnelChart, CohortHeatmap,
  ChartLegend, Segmented, Switch, ChartSkeleton, StatCardSkeleton, Toast,
} from '../../ui'
import type { AnnotationMark, HBarChartDataPoint } from '../../ui'

// ── Annotations ──────────────────────────────────────────────────
interface Annotation { id: string; date: string; label: string }

function useAnnotations(sourceId: string) {
  const key = `annotations_${sourceId}`
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
  })
  function add(date: string, label: string) {
    const next = [...annotations, { id: Date.now().toString(), date, label }]
    setAnnotations(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
  }
  function remove(id: string) {
    const next = annotations.filter(a => a.id !== id)
    setAnnotations(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
  }
  return { annotations, add, remove }
}

// ── Bookmarks ─────────────────────────────────────────────────────
interface Bookmark { id: string; name: string; win: WinState; filters: PropertyFilter[] }

function useBookmarks(sourceId: string) {
  const key = `bookmarks_${sourceId}`
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
  })
  function save(name: string, win: WinState, filters: PropertyFilter[]) {
    const next = [...bookmarks, { id: Date.now().toString(), name, win, filters }]
    setBookmarks(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
  }
  function remove(id: string) {
    const next = bookmarks.filter(b => b.id !== id)
    setBookmarks(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
  }
  return { bookmarks, save, remove }
}

function isBookmarkActive(bm: Bookmark, win: WinState, filters: PropertyFilter[]): boolean {
  return JSON.stringify(bm.win) === JSON.stringify(win) &&
    JSON.stringify(bm.filters) === JSON.stringify(filters)
}

// ── Insight prefs (pin / dismiss) ────────────────────────────────
interface InsightPrefs { pinned: string[]; dismissed: string[] }

function useInsightPrefs(sourceId: string) {
  const key = `insight_prefs_${sourceId}`
  const [prefs, setPrefs] = useState<InsightPrefs>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '{"pinned":[],"dismissed":[]}') }
    catch { return { pinned: [], dismissed: [] } }
  })
  function update(next: InsightPrefs) {
    setPrefs(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
  }
  function togglePin(id: string) {
    update({ ...prefs, pinned: prefs.pinned.includes(id) ? prefs.pinned.filter(p => p !== id) : [...prefs.pinned, id] })
  }
  function toggleDismiss(id: string) {
    update({ ...prefs, dismissed: prefs.dismissed.includes(id) ? prefs.dismissed.filter(d => d !== id) : [...prefs.dismissed, id] })
  }
  return { prefs, togglePin, toggleDismiss }
}

// ── Demo data ────────────────────────────────────────────────────
const DATASET_DAYS_DEFAULT = 30
const _now = new Date()
const _from = new Date(_now); _from.setDate(_now.getDate() - 29)
const DATASET_FROM_DEFAULT = _from.toISOString().slice(0, 10)
const DATASET_TO_DEFAULT   = _now.toISOString().slice(0, 10)

type DauPoint  = { date: Date; dau: number }
type NvrPoint  = { date: Date; new: number; returning: number }

const DASH_DAU_RAW: DauPoint[] = (() => {
  const out: DauPoint[] = []; let v = 3200
  for (let i = 29; i >= 0; i--) {
    v += Math.sin(i * 0.55) * 280 + Math.cos(i * 0.31) * 140 + 50
    out.push({ date: new Date(2026, 4, 20 - i), dau: Math.max(2200, Math.round(v)) })
  }
  return out
})()

const DASH_NVR_RAW: NvrPoint[] = Array.from({ length: 14 }, (_, k) => {
  const i = 13 - k
  return {
    date: new Date(2026, 4, 7 + k),
    new:       180 + Math.round(Math.sin(i * 0.7) * 50) + 80,
    returning: 2200 + Math.round(Math.cos(i * 0.5) * 220),
  }
})

const DASH_TOP_EVENTS = [
  { label: 'task_viewed',         value: 28430 },
  { label: 'app_opened',          value: 19200 },
  { label: 'task_created',        value: 11820 },
  { label: 'task_completed',      value:  9810 },
  { label: 'project_opened',      value:  7460 },
  { label: 'comment_added',       value:  4220 },
  { label: 'integration_clicked', value:  3110 },
  { label: 'invite_sent',         value:  2040 },
  { label: 'settings_viewed',     value:  1380 },
  { label: 'export_clicked',      value:   620 },
]

const DASH_RETENTION: { x: string; y: number }[] =
  [100, 64, 48, 39, 33, 28, 24, 22, 21, 20].map((y, i) => ({ x: `D${i}`, y }))

const DASH_FUNNEL = [
  { label: 'Visited landing', users: 12480 },
  { label: 'Signed up',       users:  3210 },
  { label: 'Created task',    users:  2042 },
  { label: 'Day 3 active',    users:   724 },
  { label: 'Day 7 active',    users:   468 },
]

const DASH_COHORTS = (() => {
  const raw = [
    { label: 'Week 13', size: 412, pct: [1, 0.42, 0.31, 0.27, 0.24, 0.21, 0.21, 0.19] },
    { label: 'Week 14', size: 488, pct: [1, 0.45, 0.34, 0.29, 0.26, 0.24, 0.22, null] },
    { label: 'Week 15', size: 521, pct: [1, 0.48, 0.36, 0.31, 0.28, 0.26, null, null] },
    { label: 'Week 16', size: 597, pct: [1, 0.40, 0.30, 0.24, 0.22, null, null, null] },
    { label: 'Week 17', size: 642, pct: [1, 0.52, 0.41, 0.34, null, null, null, null] },
    { label: 'Week 18', size: 705, pct: [1, 0.49, 0.38, null, null, null, null, null] },
    { label: 'Week 19', size: 768, pct: [1, 0.55, null, null, null, null, null, null] },
    { label: 'Week 20', size: 822, pct: [1, null, null, null, null, null, null, null] },
  ]
  return raw.map(r => ({
    label: r.label, size: r.size,
    values: r.pct.map(v => v == null ? null : Math.round(r.size * v)),
  }))
})()

const DASH_COHORT_LABELS = ['W0', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7']

const DASH_INSIGHTS = [
  {
    id: 'mobile-d3',
    severity: 'high' as const,
    category: 'Retention',
    title: 'Mobile users retention drops 40% after Day 3',
    description: 'Across 1,824 mobile signups, D3 retention is 18% vs 31% for web. Affected users overwhelmingly never reached the "first task created" event in their first session.',
    metric: { value: '−40%', label: 'D3 retention vs web' },
    tags: ['Segment: mobile', 'Cohort: weeks 16–20', 'First-session drop'],
  },
  {
    id: 'channel-paid',
    severity: 'medium' as const,
    category: 'Acquisition',
    title: 'Google Ads channel converts at half the rate of organic',
    description: 'Conversion to signup is 4.1% for Google Ads vs 8.7% organic — sample size 6,210 sessions over the last 14 days. Heavily concentrated in a single campaign group.',
    tags: ['Channel: paid', 'Campaign: brand-uk'],
  },
  {
    id: 'feature-tasks-v2',
    severity: 'low' as const,
    category: 'Engagement',
    title: 'Adoption of the Tasks v2 view correlates strongly with weekly events',
    description: '312 users now in the power-user segment, up from 289 last week. Feature adoption (+0.71) is the strongest single correlate with weekly events.',
    tags: ['Power users', 'Feature: tasks-v2'],
  },
]

const DEMO_QUESTIONS = [
  { id: 'q-mobile-d3',     question: 'Why is mobile D3 retention dropping?',               askedAt: '2 minutes ago' },
  { id: 'q-paid-channel',  question: 'Which acquisition channel has the lowest conversion this month?', askedAt: '12 minutes ago' },
  { id: 'q-power-users',   question: 'What feature correlates most with weekly engagement?', askedAt: '38 minutes ago' },
  { id: 'q-task-decline',  question: 'Did task completions drop after the May 12 release?', askedAt: 'yesterday' },
]

// ── Window types ─────────────────────────────────────────────────
type WPreset = 'last7' | 'last14' | 'last30' | 'last90' | 'all' | 'custom'
interface WinState { preset: WPreset; from: string | null; to: string | null; compare: boolean }
interface WinDesc  { days: number; label: string; preset: string; capped: boolean }

const WINDOW_PRESETS = [
  { id: 'last7',  label: 'Last 7 days',  days: 7  },
  { id: 'last14', label: 'Last 14 days', days: 14 },
  { id: 'last30', label: 'Last 30 days', days: 30 },
  { id: 'last90', label: 'Last 90 days', days: 90 },
  { id: 'all',    label: 'All data',     days: null },
]

// ── Date range helpers ───────────────────────────────────────────
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function winToIso(win: WinState, dauRaw: DauPoint[]): { start: string; end: string } | null {
  if (!dauRaw.length) return null
  if (win.preset === 'all') return null
  if (win.preset === 'custom' && win.from && win.to) {
    return { start: win.from, end: win.to }
  }
  const p = WINDOW_PRESETS.find(p => p.id === win.preset)
  if (!p?.days) return null
  const endDate = dauRaw[dauRaw.length - 1].date
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - p.days + 1)
  const datasetStart = dauRaw[0].date
  return {
    start: toIso(startDate < datasetStart ? datasetStart : startDate),
    end: toIso(endDate),
  }
}

// ── Utility functions ────────────────────────────────────────────
const fmtDate = (d: Date) => d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
const fmtDateShort = (iso: string) => {
  const [, m, dd] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m) - 1]} ${parseInt(dd)}`
}

function describeWindow(win: WinState, datasetDays = DATASET_DAYS_DEFAULT): WinDesc {
  if (win.preset === 'custom' && win.from && win.to) {
    const f = new Date(win.from), t = new Date(win.to)
    const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1)
    return {
      days: Math.min(days, datasetDays),
      label: `${fmtDateShort(win.from)} — ${fmtDateShort(win.to)}`,
      preset: 'custom',
      capped: days > datasetDays,
    }
  }
  const p = WINDOW_PRESETS.find(p => p.id === win.preset) ?? WINDOW_PRESETS[2]
  const requested = p.days ?? datasetDays
  return {
    days: Math.min(requested, datasetDays),
    label: p.label,
    preset: p.id,
    capped: requested > datasetDays,
  }
}

function computeMetrics(N: number, data: DauPoint[] = DASH_DAU_RAW) {
  if (!data.length) return { currentDAU: 0, delta: null as number | null, canCompare: false, currentWindow: [] as DauPoint[] }
  const currentWindow = data.slice(-Math.min(N, data.length))
  if (N >= data.length) {
    return { currentDAU: currentWindow.at(-1)!.dau, delta: null as number | null, canCompare: false, currentWindow }
  }
  const prevSlice = data.slice(Math.max(0, data.length - 2 * N), data.length - N)
  const currentDAU = currentWindow.at(-1)!.dau
  const prevDAU = prevSlice.length ? prevSlice.at(-1)!.dau : null
  const delta = prevDAU != null ? ((currentDAU - prevDAU) / prevDAU * 100) : null
  return { currentDAU, delta, canCompare: prevDAU != null, currentWindow }
}

function defaultGranularity(N: number): string {
  if (N <= 14) return 'day'
  if (N <= 90) return 'week'
  return 'month'
}
function granularityOptions(N: number) {
  return [
    { id: 'day',   label: 'Day',   disabled: false },
    { id: 'week',  label: 'Week',  disabled: N < 14 },
    { id: 'month', label: 'Month', disabled: N < 60 },
  ]
}
function isValidGran(val: string, N: number): boolean {
  if (val === 'week' && N < 14) return false
  if (val === 'month' && N < 60) return false
  return ['day', 'week', 'month'].includes(val)
}
function useGranularityPref(title: string, N: number) {
  const { source_id } = useParams<{ source_id: string }>()
  const key = `chart_gran_${source_id ?? 'default'}_${title}`
  const [override, setOverride] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored && isValidGran(stored, N) ? stored : null
    } catch { return null }
  })
  const prevN = useRef(N)
  useEffect(() => {
    const prev = prevN.current
    prevN.current = N
    if (prev === N) return
    // N changed (date range switch or data loaded) — keep override only if still valid
    setOverride(cur => {
      if (cur === null || isValidGran(cur, N)) return cur
      try { localStorage.removeItem(key) } catch {}
      return null
    })
  }, [N, key])
  const setGran = useCallback((v: string | null) => {
    setOverride(v)
    try {
      if (v) localStorage.setItem(key, v)
      else localStorage.removeItem(key)
    } catch {}
  }, [key])
  return [override, setGran] as const
}

function bucketDau(data: DauPoint[], gran: string): { x: string; dau: number }[] {
  if (gran === 'day') return data.map(d => ({ x: fmtDate(d.date), dau: d.dau }))
  const step = gran === 'week' ? 7 : 30
  const out: { x: string; dau: number }[] = []
  for (let i = 0; i < data.length; i += step) {
    const chunk = data.slice(i, i + step)
    out.push({ x: fmtDate(chunk.at(-1)!.date), dau: Math.round(chunk.reduce((s, d) => s + d.dau, 0) / chunk.length) })
  }
  return out
}

function bucketNvr(data: NvrPoint[], gran: string): { x: string; new: number; returning: number }[] {
  if (gran === 'day') return data.map(d => ({ x: fmtDate(d.date), new: d.new, returning: d.returning }))
  const step = gran === 'week' ? 7 : 30
  const out: { x: string; new: number; returning: number }[] = []
  for (let i = 0; i < data.length; i += step) {
    const chunk = data.slice(i, i + step)
    out.push({
      x: fmtDate(chunk.at(-1)!.date),
      new:       chunk.reduce((s, d) => s + d.new, 0),
      returning: chunk.reduce((s, d) => s + d.returning, 0),
    })
  }
  return out
}

// ── Icons ────────────────────────────────────────────────────────
function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="9" height="8" rx="1" />
      <path d="M4 1.2v2M8 1.2v2M1.5 5h9" />
    </svg>
  )
}
function CheckMarkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5l2.5 2.5L9.5 3.5" />
    </svg>
  )
}
function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--fg-subtle)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
      <path d="M2.5 3.5L5 6l2.5-2.5" />
    </svg>
  )
}
function ChevronCollapseIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform .15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
      <path d="M2 4l3 3 3-3" />
    </svg>
  )
}
function CsvIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.5h10v7H2zM2 6h10M5 3.5v7" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 1.5v7M1.5 5h7" />
    </svg>
  )
}
function ArrowRightSmall() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5h5M4.5 2L7 4.5 4.5 7" />
    </svg>
  )
}
function ExportPageIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="7" height="9" rx="1" />
      <path d="M4.5 10.5h7M9 8.5l2.5 2-2.5 2" />
      <path d="M3.5 4.5h3M3.5 6.5h4" />
    </svg>
  )
}
function SparkleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
      <path d="M5.5 1 L6.3 4.2 L9.5 5.5 L6.3 6.8 L5.5 10 L4.7 6.8 L1.5 5.5 L4.7 4.2 Z" />
    </svg>
  )
}
function FlagIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 1.5v9" />
      <path d="M2.5 2l6 1.5-6 2.5" fill="currentColor" stroke="none" opacity="0.35" />
      <path d="M2.5 2l6 1.5-6 2.5" />
    </svg>
  )
}
function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M2.5 1.5h7v9.5L6 8.5 2.5 11V1.5Z"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.25 : 0}
      />
      <path d="M2.5 1.5h7v9.5L6 8.5 2.5 11V1.5Z" />
    </svg>
  )
}

// ── TimeRangePicker ──────────────────────────────────────────────
function TimeRangePicker({ win, setWin, desc, datasetFrom, datasetTo }: {
  win: WinState; setWin: (w: WinState) => void; desc: WinDesc
  datasetFrom: string; datasetTo: string
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [localFrom, setLocalFrom] = useState(win.from ?? datasetFrom)
  const [localTo,   setLocalTo]   = useState(win.to   ?? datasetTo)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  // Keep custom inputs anchored to the dataset bounds as long as we're not in custom mode
  useEffect(() => {
    if (win.preset === 'custom') return
    setLocalFrom(datasetFrom)
    setLocalTo(datasetTo)
  }, [datasetFrom, datasetTo, win.preset])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="inline-flex items-center gap-2 h-[30px] px-[10px] text-[13px] font-medium text-fg bg-surface border border-border rounded-md transition-[border-color,box-shadow] duration-[120ms] cursor-pointer"
        style={{
          borderColor: open || hover ? 'var(--accent)' : 'var(--border)',
          boxShadow: open || hover ? '0 0 0 3px color-mix(in oklch, var(--accent) 14%, transparent)' : 'none',
        }}
      >
        <CalendarIcon />
        <span>{desc.label}</span>
        <ChevronDownIcon open={open} />
      </button>

      {open && (
        <div
          className="absolute mt-[6px] bg-surface border border-border rounded-lg z-20 overflow-hidden"
          style={{ top: '100%', left: 0, width: 268, boxShadow: 'var(--shadow-md)' }}
        >
          <div className="p-[6px]">
            {WINDOW_PRESETS.map(p => {
              const active = p.id === win.preset
              const dsdays = Math.round((new Date(datasetTo).getTime() - new Date(datasetFrom).getTime()) / 86400000) + 1
              const capped = p.days != null && p.days > dsdays
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setWin({ ...win, preset: p.id as WPreset }); setOpen(false) }}
                  className="w-full flex items-center justify-between px-[10px] py-[7px] rounded-md text-[13px] text-fg cursor-pointer transition-colors duration-[100ms]"
                  style={{ background: active ? 'var(--surface-2)' : 'transparent' }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span>{p.label}</span>
                  <span className="inline-flex items-center gap-2">
                    {capped && <span className="text-[11px] text-fg-subtle">capped</span>}
                    {active && <CheckMarkIcon />}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="border-t border-border mx-1" />

          <div className="p-[10px_10px_10px]">
            <div className="flex items-center justify-between mb-[6px]">
              <span className="text-[11px] text-fg-subtle">Custom range</span>
              <span className="text-[11px] text-fg-subtle">{datasetFrom.slice(5)} → {datasetTo.slice(5)}</span>
            </div>
            <div className="grid grid-cols-2 gap-[6px] mb-2">
              {(['from', 'to'] as const).map(key => (
                <input
                  key={key}
                  type="date"
                  value={key === 'from' ? localFrom : localTo}
                  min={datasetFrom}
                  max={datasetTo}
                  onChange={e => key === 'from' ? setLocalFrom(e.target.value) : setLocalTo(e.target.value)}
                  className="h-[28px] px-2 text-[12px] text-fg bg-surface border border-border rounded-sm outline-none w-full cursor-pointer"
                  style={{ colorScheme: 'inherit', fontFamily: 'inherit' }}
                />
              ))}
            </div>
            <Button
              variant="primary"
              size="sm"
              full
              onClick={() => {
                if (localFrom > localTo) return
                setWin({ ...win, preset: 'custom', from: localFrom, to: localTo })
                setOpen(false)
              }}
            >
              Apply custom range
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Top progress bar (indeterminate) ─────────────────────────────
function TopProgressBar({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      style={{
        height: 2,
        background: visible ? 'color-mix(in oklch, var(--accent) 18%, transparent)' : 'transparent',
        overflow: 'hidden',
        transition: 'background 200ms',
      }}
    >
      {visible && (
        <div
          style={{
            width: '40%',
            height: '100%',
            background: 'var(--accent)',
            animation: 'indeterminate-bar 1.2s ease-in-out infinite',
          }}
        />
      )}
    </div>
  )
}

// ── Spinner ──────────────────────────────────────────────────────
function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 12 12" fill="none"
      style={{ animation: 'spin 0.9s linear infinite' }}
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.25" />
      <path d="M6 1.5 a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// ── Property filter ──────────────────────────────────────────────
type PropertyOption = { property: string; values: string[] }

// ── Property select (custom dropdown) ───────────────────────────
function PropertySelect({
  value, options, onChange,
}: {
  value: string
  options: string[]
  onChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-[3px] text-[12px] font-medium cursor-pointer"
        style={{ color: 'var(--accent)' }}
      >
        <span>{value}</span>
        <ChevronDownIcon open={open} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-[4px] z-50 bg-surface border border-border rounded-lg overflow-hidden"
          style={{ boxShadow: 'var(--shadow-md)', minWidth: 120 }}
        >
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className="w-full text-left px-[10px] py-[6px] text-[12px] cursor-pointer transition-colors hover:bg-surface-2"
              style={{ color: opt === value ? 'var(--accent)' : 'var(--fg)', fontWeight: opt === value ? 500 : 400 }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Value multi-picker ───────────────────────────────────────────
function ValueMultiPicker({
  selected, options, onChange,
}: {
  selected: string[]
  options: string[]
  onChange: (vals: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = selected.length === 0
    ? 'any'
    : selected.length <= 2
    ? selected.join(', ')
    : `${selected[0]}, +${selected.length - 1}`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-[3px] text-[12px] text-fg max-w-[140px] cursor-pointer"
      >
        <span className="truncate" style={{ color: selected.length === 0 ? 'var(--fg-subtle)' : 'var(--fg)' }}>
          {label}
        </span>
        <ChevronDownIcon open={open} />
      </button>
      {open && options.length > 0 && (
        <div
          className="absolute left-0 top-full mt-[4px] z-50 bg-surface border border-border rounded-lg overflow-hidden"
          style={{ boxShadow: 'var(--shadow-md)', minWidth: 140 }}
        >
          {options.map(v => {
            const checked = selected.includes(v)
            return (
              <label
                key={v}
                className="flex items-center gap-[8px] px-[10px] py-[6px] cursor-pointer transition-colors hover:bg-surface-2"
              >
                <span
                  className="inline-flex items-center justify-center w-[13px] h-[13px] rounded-[3px] border flex-shrink-0 transition-colors"
                  style={{
                    borderColor: checked ? 'var(--accent)' : 'var(--border-strong)',
                    background: checked ? 'var(--accent)' : 'transparent',
                  }}
                >
                  {checked && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => {
                    if (checked) onChange(selected.filter(s => s !== v))
                    else onChange([...selected, v])
                  }}
                />
                <span className="text-[12px] text-fg">{v}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Global filter bar (always visible in toolbar) ────────────────
function GlobalFilterBar({
  filters, propertyOptions, onChange,
}: {
  filters: PropertyFilter[]
  propertyOptions: PropertyOption[]
  onChange: (filters: PropertyFilter[]) => void
}) {
  const addFilter = () => {
    const usedCols = new Set(filters.map(f => f.col))
    const col = propertyOptions.find(p => !usedCols.has(p.property))?.property
      ?? propertyOptions[0]?.property
    if (!col) return
    onChange([...filters, { col, vals: [] }])
  }

  const removeFilter = (i: number) => onChange(filters.filter((_, j) => j !== i))

  const updateFilter = (i: number, updated: PropertyFilter) =>
    onChange(filters.map((f, j) => j === i ? updated : f))

  const canAddMore = propertyOptions.length > filters.length

  return (
    <div className="flex items-center gap-[8px] flex-wrap min-h-[26px]">
      <span className="text-[12px] text-fg-subtle shrink-0">Filter by</span>
      {filters.map((f, i) => {
        const valOptions = propertyOptions.find(p => p.property === f.col)?.values ?? []
        return (
          <div
            key={i}
            className="inline-flex items-center gap-[5px] h-[26px] px-[8px] rounded-md border"
            style={{
              background: 'color-mix(in oklch, var(--accent) 7%, transparent)',
              borderColor: 'color-mix(in oklch, var(--accent) 28%, transparent)',
            }}
          >
            <PropertySelect
              value={f.col}
              options={propertyOptions.map(p => p.property)}
              onChange={col => updateFilter(i, { col, vals: [] })}
            />
            <span className="text-[11px] text-fg-muted shrink-0">=</span>
            <ValueMultiPicker
              selected={f.vals}
              options={valOptions}
              onChange={vals => updateFilter(i, { ...f, vals })}
            />
            <button
              type="button"
              onClick={() => removeFilter(i)}
              className="text-fg-muted hover:text-fg text-[14px] leading-none shrink-0 w-4 flex items-center justify-center cursor-pointer"
            >×</button>
          </div>
        )
      })}
      {(canAddMore || filters.length === 0) && (
        <button
          type="button"
          onClick={addFilter}
          className="inline-flex items-center gap-[4px] h-[26px] px-[8px] text-[12px] text-fg-muted hover:text-fg border border-dashed border-border hover:border-border-strong rounded-md cursor-pointer transition-colors"
        >
          <PlusIcon />
          Add filter
        </button>
      )}
    </div>
  )
}

// ── Segment data shape (shared by DonutSvg + SegmentTabView) ─────
interface SegmentPropertyData {
  property: string
  top_values: {
    value: string
    users: number
    events: number
    pct: number
    d7_retention_pct: number | null
  }[]
}

// ── ChartSpec helpers ────────────────────────────────────────────
function groupBySection(results: any[]): [string, ChartSpec[]][] {
  const map = new Map<string, ChartSpec[]>()
  for (const result of results) {
    for (const spec of (result.chart_specs ?? []) as ChartSpec[]) {
      const section = spec.section ?? 'Other'
      if (!map.has(section)) map.set(section, [])
      map.get(section)!.push(spec)
    }
  }
  return Array.from(map.entries())
}

function fmtIso(iso: string): string {
  const [, m, dd] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m) - 1]} ${parseInt(dd)}`
}

function bucketXYIso(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  gran: string,
): { x: string; y: number }[] {
  if (!data.length) return []
  if (gran === 'day') return data.map(d => ({ x: fmtIso(d[xKey] as string), y: d[yKey] as number }))
  const step = gran === 'week' ? 7 : 30
  const out: { x: string; y: number }[] = []
  for (let i = 0; i < data.length; i += step) {
    const chunk = data.slice(i, i + step)
    out.push({
      x: fmtIso(chunk[chunk.length - 1][xKey] as string),
      y: Math.round(chunk.reduce((s, d) => s + (d[yKey] as number), 0) / chunk.length),
    })
  }
  return out
}

function bucketStackedIso(
  data: Record<string, unknown>[],
  xKey: string,
  stackKeys: string[],
  gran: string,
): Record<string, unknown>[] {
  if (!data.length) return []
  if (gran === 'day') {
    return data.map(d => ({
      x: fmtIso(d[xKey] as string),
      ...Object.fromEntries(stackKeys.map(k => [k, d[k]])),
    }))
  }
  const step = gran === 'week' ? 7 : 30
  const out: Record<string, unknown>[] = []
  for (let i = 0; i < data.length; i += step) {
    const chunk = data.slice(i, i + step)
    const row: Record<string, unknown> = { x: fmtIso(chunk[chunk.length - 1][xKey] as string) }
    for (const k of stackKeys) row[k] = chunk.reduce((s, d) => s + (d[k] as number), 0)
    out.push(row)
  }
  return out
}

// ── Per-type spec renderers ──────────────────────────────────────
function LineSpecRenderer({ spec, N, annotations = [], allSpec }: { spec: ChartSpec; N: number; annotations?: Annotation[]; allSpec?: ChartSpec }) {
  const data    = spec.data as Record<string, unknown>[]
  const xKey    = (spec.config.x_key as string) ?? 'x'
  const yKey    = (spec.config.y_key as string) ?? 'y'
  const hasGran = !!spec.config.granularity
  const height  = (spec.config.height as number) ?? 240
  const fmtY    = spec.config.format_y === 'pct' ? (v: number) => v + '%' : undefined

  // Optional DAU/MAU metric toggle
  type MetricOpt = { key: string; label: string }
  const metricOpts = spec.config.metric_toggle as MetricOpt[] | undefined
  const mauData    = spec.config.mau_data as Record<string, unknown>[] | undefined
  const [metric, setMetric] = useState<string>(metricOpts?.[0]?.key ?? '')
  const isMau = metric === 'mau'
  const activeData = isMau && mauData ? mauData : data

  const autoGran = isMau ? 'month' : defaultGranularity(N)
  const [override, setOverride] = useGranularityPref(spec.title, N)
  const gran = isMau ? 'month' : (override ?? autoGran)

  const chartData = useMemo(() => {
    if (!activeData.length) return []
    if (isMau) return activeData.map(d => ({ x: fmtIso(d[xKey] as string), y: d[yKey] as number }))
    if (!hasGran) return activeData.map(d => ({ x: d[xKey] as string, y: d[yKey] as number }))
    return bucketXYIso(activeData, xKey, yKey, gran)
  }, [activeData, xKey, yKey, gran, hasGran, isMau])

  // Segment overlay: "All" vs "Filtered" lines — only in DAU mode (not MAU)
  const allChartData = useMemo(() => {
    if (isMau || !allSpec) return null
    const allRaw = allSpec.data as Record<string, unknown>[]
    if (!hasGran) return allRaw.map(d => ({ x: d[xKey] as string, y: d[yKey] as number }))
    return bucketXYIso(allRaw, xKey, yKey, gran)
  }, [isMau, allSpec, xKey, yKey, gran, hasGran])

  const mergedData = useMemo((): Record<string, string | number>[] => {
    if (!allChartData) return chartData
    const filtMap = new Map(chartData.map(d => [d.x, d.y]))
    return allChartData.map(d => ({ x: d.x, y: filtMap.get(d.x) ?? 0, y_all: d.y }))
  }, [chartData, allChartData])

  const hasOverlay = !!allChartData

  const annotationMarks = useMemo((): AnnotationMark[] => {
    if (!annotations.length || !chartData.length) return []

    // MAU: match annotation to its calendar month
    if (isMau && mauData) {
      return annotations.flatMap(a => {
        const month = a.date.slice(0, 7)
        const row = mauData.find(d => (d[xKey] as string).startsWith(month))
        if (!row) return []
        const xValue = fmtIso(row[xKey] as string)
        return chartData.some(d => d.x === xValue) ? [{ xValue, label: a.label }] : []
      })
    }

    if (!hasGran || gran === 'day') {
      const xValues = new Set(chartData.map(d => d.x))
      return annotations
        .map(a => ({ xValue: fmtIso(a.date), label: a.label }))
        .filter(a => xValues.has(a.xValue))
    }

    // week/month: map annotation date to its bucket's x-label (last date of the bucket)
    const step = gran === 'week' ? 7 : 30
    const rawDates = activeData.map(d => d[xKey] as string)
    return annotations.flatMap(a => {
      for (let i = 0; i < rawDates.length; i += step) {
        const bucketEnd = rawDates[Math.min(i + step - 1, rawDates.length - 1)]
        if (a.date >= rawDates[i] && a.date <= bucketEnd) {
          const xValue = fmtIso(bucketEnd)
          return chartData.some(d => d.x === xValue) ? [{ xValue, label: a.label }] : []
        }
      }
      return []
    })
  }, [annotations, chartData, gran, hasGran, activeData, xKey, isMau, mauData])

  const title  = isMau ? 'Monthly active users' : spec.title
  const yLabel = (spec.config.y_label as string) || (spec.config.format_y === 'pct' ? 'Retention %' : 'Users')

  const action = (
    <div className="flex items-center gap-2">
      {hasOverlay && (
        <ChartLegend items={[
          { label: 'All', color: 'var(--border-strong)' },
          { label: 'Filtered', accent: true },
        ]} />
      )}
      {metricOpts && (
        <Segmented
          value={metric}
          onChange={v => v && setMetric(v)}
          options={metricOpts.map(m => ({ id: m.key, label: m.label }))}
        />
      )}
      {hasGran && !isMau && (
        <Segmented value={gran} onChange={setOverride} options={granularityOptions(N)} />
      )}
    </div>
  )

  return (
    <ChartContainer
      title={title}
      subtitle={spec.subtitle}
      height={height}
      action={action}
      tableData={chartData as Record<string, unknown>[]}
    >
      <LineChart
        data={hasOverlay ? mergedData : chartData}
        lines={hasOverlay
          ? [
              { key: 'y_all', label: 'All users', color: 'var(--border-strong)' },
              { key: 'y',     label: 'Filtered',  color: 'var(--accent)' },
            ]
          : [{ key: 'y', label: yLabel }]
        }
        formatY={fmtY}
        annotations={annotationMarks}
      />
    </ChartContainer>
  )
}

function StackedBarSpecRenderer({ spec, N }: { spec: ChartSpec; N: number }) {
  const data    = spec.data as Record<string, unknown>[]
  const xKey    = (spec.config.x_key as string) ?? 'x'
  const stacks  = (spec.config.stacks as Array<{ key: string; label: string; accent?: boolean }>) ?? []
  const height  = (spec.config.height as number) ?? 200
  const hasGran = !!spec.config.granularity

  const autoGran = defaultGranularity(N)
  const [override, setOverride] = useGranularityPref(spec.title, N)
  const gran = override ?? autoGran

  const chartData = useMemo(() => {
    const keys = stacks.map(s => s.key)
    if (!data.length) return []
    if (!hasGran) return data.map(d => ({ x: d[xKey] as string, ...Object.fromEntries(keys.map(k => [k, d[k]])) }))
    return bucketStackedIso(data, xKey, keys, gran)
  }, [data, xKey, stacks, gran, hasGran])

  return (
    <ChartContainer
      title={spec.title}
      subtitle={spec.subtitle}
      height={height}
      action={
        <div className="flex items-center gap-3">
          <ChartLegend items={stacks.map(s => ({ label: s.label, accent: !!s.accent }))} />
          {hasGran && <Segmented value={gran} onChange={setOverride} options={granularityOptions(N)} />}
        </div>
      }
      tableData={chartData as Record<string, unknown>[]}
    >
      <StackedBarChart data={chartData as Record<string, string | number>[]} stacks={stacks} />
    </ChartContainer>
  )
}

function HBarSpecRenderer({ spec, N }: { spec: ChartSpec; N: number }) {
  const data        = spec.data as { label: string; value: number }[]
  const accentIndex = (spec.config.accent_index as number) ?? 0
  const height      = (spec.config.height as number) ?? 300
  const eventSeries = spec.config.event_series as Record<string, Array<{ date: string; count: number }>> | undefined

  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const selectedIndex = selectedEvent ? data.findIndex(d => d.label === selectedEvent) : -1

  const autoGran = defaultGranularity(N)
  const [override, setOverride] = useGranularityPref(spec.title + ':trend', N)
  const gran = override ?? autoGran

  const trendData = useMemo(() => {
    if (!selectedEvent || !eventSeries?.[selectedEvent]) return []
    return bucketXYIso(
      eventSeries[selectedEvent] as unknown as Record<string, unknown>[],
      'date', 'count', gran,
    )
  }, [selectedEvent, eventSeries, gran])

  function handleBarClick(_i: number, d: HBarChartDataPoint) {
    setSelectedEvent(prev => prev === d.label ? null : d.label)
  }

  return (
    <>
      <ChartContainer title={spec.title} subtitle={spec.subtitle} height={height} tableData={data as Record<string, unknown>[]}>
        <HBarChart
          data={data}
          accentIndex={accentIndex}
          onBarClick={eventSeries ? handleBarClick : undefined}
          selectedIndex={selectedIndex}
        />
      </ChartContainer>

      {selectedEvent && trendData.length > 0 && (
        <ChartContainer
          title={selectedEvent}
          subtitle="Daily event count"
          height={200}
          action={
            <div className="flex items-center gap-2">
              <Segmented value={gran} onChange={setOverride} options={granularityOptions(N)} />
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="w-[22px] h-[22px] inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-surface-2 cursor-pointer text-[15px] leading-none"
                title="Close"
              >
                ×
              </button>
            </div>
          }
          tableData={trendData as Record<string, unknown>[]}
        >
          <LineChart data={trendData} lines={[{ key: 'y', label: 'Events' }]} />
        </ChartContainer>
      )}
    </>
  )
}

// ── Funnel builder (interactive) ─────────────────────────────────
type FunnelStepRow = { label: string; users: number; pct_of_first: number; pct_of_prev: number }
type FunnelLiveData = {
  steps: FunnelStepRow[]
  overall_conversion: number
  users_dropped: number
  biggest_drop_pct: number
  biggest_drop_step: string
  window_days: number
  first_step_users: number
}


function XCloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 2.5l6 6M8.5 2.5l-6 6" />
    </svg>
  )
}
function DragHandleIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="3"  r="1.1" />
      <circle cx="7" cy="3"  r="1.1" />
      <circle cx="3" cy="8"  r="1.1" />
      <circle cx="7" cy="8"  r="1.1" />
      <circle cx="3" cy="13" r="1.1" />
      <circle cx="7" cy="13" r="1.1" />
    </svg>
  )
}
function PlusSmallIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5.5 2v7M2 5.5h7" />
    </svg>
  )
}

function FunnelKpiCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-[10px] min-w-0">
      <div className="text-[10px] font-medium text-fg-muted leading-none uppercase tracking-[0.04em]">{label}</div>
      <div className="text-[20px] font-medium tabular-nums tracking-[-0.4px] leading-none mt-[6px] text-fg truncate" title={value}>{value}</div>
      {sub && <div className="text-[11px] text-fg-subtle leading-[1.35] mt-[5px] break-words">{sub}</div>}
    </div>
  )
}

function FunnelStepCard({
  index, total, value, options, pctOfPrev, isFirst,
  isDragging, dropPosition,
  onChange, onRemove,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: {
  index: number
  total: number
  value: string
  options: { value: string; label: string }[]
  pctOfPrev: number | null
  isFirst: boolean
  isDragging: boolean
  dropPosition: 'above' | 'below' | null
  onChange: (v: string) => void
  onRemove: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
}) {
  const [dragEnabled, setDragEnabled] = useState(false)
  const badgeText = isFirst ? 'cohort' : `${Math.round((pctOfPrev ?? 0) * 100)}%`
  const badgeColor = isFirst ? 'var(--fg-subtle)' : 'var(--fg-muted)'

  return (
    <div
      draggable={dragEnabled}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={(e) => { setDragEnabled(false); onDragEnd(e) }}
      className="relative flex items-center gap-[6px] rounded-md transition-[opacity,background] duration-100"
      style={{
        opacity: isDragging ? 0.35 : 1,
        background: dropPosition ? 'color-mix(in oklch, var(--accent) 4%, transparent)' : 'transparent',
      }}
    >
      {/* Drop indicator line (above or below this row) */}
      {dropPosition && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0, right: 0,
            top: dropPosition === 'above' ? -3 : 'auto',
            bottom: dropPosition === 'below' ? -3 : 'auto',
            height: 2,
            background: 'var(--accent)',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Drag handle */}
      <button
        type="button"
        aria-label="Drag to reorder"
        onMouseDown={() => setDragEnabled(true)}
        onMouseUp={() => setDragEnabled(false)}
        onMouseLeave={() => { /* keep enabled if drag in progress */ }}
        className="flex-shrink-0 w-[18px] h-[28px] inline-flex items-center justify-center text-fg-subtle hover:text-fg-muted"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        <DragHandleIcon />
      </button>

      <div className="flex-shrink-0 w-[22px] h-[22px] rounded-full bg-surface-2 border border-border flex items-center justify-center text-[11px] font-medium text-fg-muted tabular-nums">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <Select
          value={value}
          onChange={e => onChange(e.target.value)}
          options={options}
          placeholder="Pick event…"
        />
      </div>
      <div
        className="flex-shrink-0 inline-flex items-center justify-center px-[8px] h-[22px] rounded-md text-[11px] font-medium tabular-nums bg-surface-2 border border-border"
        style={{ color: badgeColor, minWidth: 46 }}
      >
        {badgeText}
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={total <= 2}
        className="flex-shrink-0 w-[22px] h-[22px] inline-flex items-center justify-center text-fg-subtle hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        aria-label="Remove step"
      >
        <XCloseIcon />
      </button>
    </div>
  )
}

function FunnelBuilder({
  spec, sourceId, dateRange, filters = [],
}: {
  spec: ChartSpec
  sourceId: string
  dateRange?: { start?: string; end?: string }
  filters?: PropertyFilter[]
}) {
  const { getRun, setRun } = useAnalysisStore()

  const availableEvents = useMemo(
    () => (spec.config.available_events as string[]) ?? [],
    [spec.config.available_events],
  )
  // Capture initial spec values once at mount — FunnelBuilder is remounted on
  // dateRange change via `key`, so these don't need to track spec updates.
  const initialRef = useRef<{ steps: string[]; window: number; data: FunnelLiveData }>()
  if (!initialRef.current) {
    const w = (spec.config.window_days as number) ?? 7
    initialRef.current = {
      steps: (spec.config.steps as string[]) ?? [],
      window: w,
      data: {
        steps: (spec.data as FunnelStepRow[]) ?? [],
        overall_conversion: (spec.config.overall_conversion as number) ?? 0,
        users_dropped:      (spec.config.users_dropped as number) ?? 0,
        biggest_drop_pct:   (spec.config.biggest_drop_pct as number) ?? 0,
        biggest_drop_step:  (spec.config.biggest_drop_step as string) ?? '',
        window_days:        w,
        first_step_users:   (spec.config.first_step_users as number) ?? 0,
      },
    }
  }
  const initialSteps = initialRef.current.steps
  const initialWindow = initialRef.current.window
  const initialData = initialRef.current.data

  const [steps, setSteps] = useState<string[]>(initialSteps)
  const [live, setLive] = useState<FunnelLiveData>(initialData)
  const [recomputing, setRecomputing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isFirstRender = useRef(true)
  const reqIdRef = useRef(0)

  const eventOptions = useMemo(
    () => availableEvents.map(e => ({ value: e, label: e })),
    [availableEvents],
  )

  const validSteps = useMemo(() => steps.filter(s => s && s.length > 0), [steps])

  // Debounced recompute on step or filter changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      if (!filters.length) return  // skip mount only when no active filters
    }
    if (validSteps.length < 2) return

    setRecomputing(true)
    setError(null)
    const reqId = ++reqIdRef.current

    const handle = setTimeout(async () => {
      try {
        const { data } = await api.analysis.recomputeFunnel(
          sourceId, validSteps, initialWindow, dateRange, filters,
        )
        if (reqId !== reqIdRef.current) return
        const cfg     = (data?.chart_specs?.[0]?.config ?? {}) as Record<string, unknown>
        const stepsD  = (data?.chart_specs?.[0]?.data ?? []) as FunnelStepRow[]
        setLive({
          steps: stepsD,
          overall_conversion: (cfg.overall_conversion as number) ?? 0,
          users_dropped:      (cfg.users_dropped as number) ?? 0,
          biggest_drop_pct:   (cfg.biggest_drop_pct as number) ?? 0,
          biggest_drop_step:  (cfg.biggest_drop_step as string) ?? '',
          window_days:        (cfg.window_days as number) ?? initialWindow,
          first_step_users:   (cfg.first_step_users as number) ?? 0,
        })

        // Mirror into the analysis store so the rest of the dashboard (Funnel section
        // helper text) stays in sync. Local UI state is the source of truth for inputs.
        const cacheKey = dateRange?.start || dateRange?.end
          ? `${sourceId}:${dateRange.start ?? ''}:${dateRange.end ?? ''}`
          : sourceId
        const run = getRun(cacheKey) ?? getRun(sourceId)
        if (run) {
          const newResults = run.results.map((r: any) => r.name === 'funnel' ? data : r)
          setRun(cacheKey, { ...run, results: newResults } as any)
        }
      } catch (e: any) {
        if (reqId !== reqIdRef.current) return
        setError(e?.response?.data?.detail ?? 'Failed to recompute funnel')
      } finally {
        if (reqId === reqIdRef.current) setRecomputing(false)
      }
    }, 350)

    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.join('|'), JSON.stringify(filters)])

  // ── Drag-and-drop reordering ─────────────────────────────────
  // Use a ref alongside state: ref gives handlers the latest value synchronously
  // (state reads in closures are one render behind, which breaks fast DnD sequences).
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null)
  const dragSourceRef = useRef<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [dropEdge, setDropEdge] = useState<'above' | 'below' | null>(null)
  const setDragSource = (v: number | null) => { dragSourceRef.current = v; setDragSourceIndex(v) }

  const updateStep = useCallback((i: number, val: string) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? val : s))
  }, [])
  const reorderStep = useCallback((from: number, to: number) => {
    setSteps(prev => {
      if (from === to || from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])
  const removeStep = useCallback((i: number) => {
    setSteps(prev => prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i))
  }, [])
  const addStep = useCallback(() => {
    // Pick the most-frequent available event not already in the funnel
    const used = new Set(steps)
    const next = availableEvents.find(e => !used.has(e)) ?? availableEvents[0] ?? ''
    setSteps(prev => [...prev, next])
  }, [steps, availableEvents])
  const clearAll = useCallback(() => {
    setSteps(availableEvents.slice(0, 2))
  }, [availableEvents])

  const chartSteps = live.steps.map(s => ({ label: s.label, users: s.users }))
  const overallPct = Math.round((live.overall_conversion ?? 0) * 1000) / 10
  const dropPct    = Math.round((live.biggest_drop_pct ?? 0) * 1000) / 10

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(360px,420px)_1fr] gap-3 items-start">
      {/* LEFT: steps panel */}
      <div className="bg-surface border border-border rounded-lg p-[14px] flex flex-col gap-[12px] min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-fg leading-none">Funnel steps</div>
            <div className="text-[11px] text-fg-subtle mt-[4px]">Order matters · drop-off recalculates live</div>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="text-[12px] text-fg-subtle hover:text-fg cursor-pointer leading-none"
          >
            Clear all
          </button>
        </div>



        <div className="flex flex-col gap-[8px]">
          {steps.map((s, i) => {
            const isDragging = dragSourceIndex === i
            const dropPos = (dropTargetIndex === i && dragSourceIndex !== null && dragSourceIndex !== i)
              ? dropEdge
              : null
            return (
              <FunnelStepCard
                key={i}
                index={i}
                total={steps.length}
                value={s}
                options={eventOptions}
                pctOfPrev={live.steps[i]?.pct_of_prev ?? null}
                isFirst={i === 0}
                isDragging={isDragging}
                dropPosition={dropPos}
                onChange={v => updateStep(i, v)}
                onRemove={() => removeStep(i)}
                onDragStart={(e) => {
                  setDragSource(i)
                  e.dataTransfer.effectAllowed = 'move'
                  try { e.dataTransfer.setData('text/plain', String(i)) } catch {}
                }}
                onDragOver={(e) => {
                  const src = dragSourceRef.current
                  if (src === null || src === i) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const edge: 'above' | 'below' =
                    e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
                  setDropTargetIndex(i)
                  setDropEdge(edge)
                }}
                onDragLeave={(e) => {
                  const next = e.relatedTarget as Node | null
                  if (!next || !(e.currentTarget as HTMLElement).contains(next)) {
                    setDropTargetIndex(prev => prev === i ? null : prev)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const src = dragSourceRef.current
                  if (src === null || src === i) return
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const edge: 'above' | 'below' =
                    e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
                  let target = edge === 'above' ? i : i + 1
                  if (src < target) target -= 1
                  reorderStep(src, target)
                  setDragSource(null)
                  setDropTargetIndex(null)
                  setDropEdge(null)
                }}
                onDragEnd={() => {
                  setDragSource(null)
                  setDropTargetIndex(null)
                  setDropEdge(null)
                }}
              />
            )
          })}
        </div>

        <button
          type="button"
          onClick={addStep}
          disabled={availableEvents.length <= steps.length}
          className="w-full inline-flex items-center justify-center gap-[6px] h-[34px] rounded-md border border-dashed border-border text-[12px] text-fg-muted hover:text-fg hover:border-border-strong cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <PlusSmallIcon />
          Add step
        </button>

        {error && <div className="text-[12px] text-danger">{error}</div>}
      </div>

      {/* RIGHT: KPIs + chart */}
      <div className="flex flex-col gap-3 min-w-0">
        <div className="grid grid-cols-3 gap-2">
          <FunnelKpiCell
            label="Overall conversion"
            value={`${overallPct.toFixed(1)}%`}
            sub={live.first_step_users > 0
              ? `${(live.steps[live.steps.length - 1]?.users ?? 0).toLocaleString()} of ${live.first_step_users.toLocaleString()} users`
              : undefined}
          />
          <FunnelKpiCell
            label="Users dropped"
            value={live.users_dropped.toLocaleString()}
            sub={`across ${Math.max(0, live.steps.length - 1)} steps`}
          />
          <FunnelKpiCell
            label="Biggest drop"
            value={dropPct > 0 ? `−${dropPct.toFixed(1)}%` : '—'}
            sub={live.biggest_drop_step ? `at ${live.biggest_drop_step}` : undefined}
          />
        </div>

        <ChartContainer
          title={`${chartSteps.length}-step funnel`}
          subtitle={`${overallPct.toFixed(1)}% overall conversion`}
          height={Math.max(240, chartSteps.length * 50)}
          action={recomputing
            ? <span className="inline-flex items-center gap-[6px] text-[11px] text-fg-subtle"><Spinner size={10} />Recomputing…</span>
            : undefined}
        >
          {chartSteps.length >= 2
            ? <FunnelChart steps={chartSteps} />
            : <div className="w-full h-full flex items-center justify-center text-[12px] text-fg-subtle">Pick at least 2 events to see the funnel</div>}
        </ChartContainer>
      </div>
    </div>
  )
}

function FunnelSkippedRenderer({ spec, sourceId }: { spec: ChartSpec; sourceId: string }) {
  const navigate = useNavigate()
  const reason   = (spec.data as { reason?: string })?.reason ?? ''
  const noEvents = reason.includes('events found')
  if (noEvents) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5">
        <p className="text-[13px] text-fg-muted leading-[1.5]">
          No signup events in this date range. Try a wider window.
        </p>
      </div>
    )
  }
  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex flex-col items-start gap-3">
      <p className="text-[13px] text-fg-muted leading-[1.5]">
        No funnel configured. Set a signup and conversion event in mapping to enable funnel analysis.
      </p>
      <Button variant="secondary" size="sm" onClick={() => navigate(`/mapping/${sourceId}`)}>
        Configure funnel
      </Button>
    </div>
  )
}

function CohortHeatmapSpecRenderer({ spec }: { spec: ChartSpec }) {
  type CRow = { cohort: string; size: number; d1: number; d3: number; d7: number; d14: number; d30: number }
  const raw       = spec.data as CRow[]
  const colLabels = (spec.config.col_labels as string[]) ?? ['D1', 'D3', 'D7', 'D14', 'D30']
  const height    = (spec.config.height as number) ?? 320
  const rows = raw.map(r => ({
    label: r.cohort.replace(/^\d{4}-/, ''),
    size: r.size,
    values: [
      r.size,
      Math.round(r.d1 * r.size),
      Math.round(r.d3 * r.size),
      Math.round(r.d7 * r.size),
      Math.round(r.d14 * r.size),
      Math.round(r.d30 * r.size),
    ] as (number | null)[],
  }))
  // Table data: cohort + size + one col per retention period (absolute counts)
  const tableData = raw.map(r => ({
    cohort: r.cohort,
    users: r.size,
    D1: Math.round(r.d1 * r.size),
    D3: Math.round(r.d3 * r.size),
    D7: Math.round(r.d7 * r.size),
    D14: Math.round(r.d14 * r.size),
    D30: Math.round(r.d30 * r.size),
  }))
  return (
    <ChartContainer title={spec.title} subtitle={spec.subtitle} height={height} tableData={tableData}>
      <div className="w-full pt-1">
        <CohortHeatmap rows={rows} weekLabels={['D0', ...colLabels]} />
      </div>
    </ChartContainer>
  )
}

// ── Segment donut ────────────────────────────────────────────────
const DONUT_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6B7280',
]

function DonutSvg({
  values, totalLabel,
}: {
  values: SegmentPropertyData['top_values']
  totalLabel: string
}) {
  const cx = 60, cy = 60, outerR = 52, innerR = 33
  const total = values.reduce((s, v) => s + v.users, 0)

  if (total === 0) {
    return (
      <svg viewBox="0 0 120 120" width={140} height={140}>
        <circle cx={cx} cy={cy} r={outerR} fill="var(--surface-2)" />
        <circle cx={cx} cy={cy} r={innerR} fill="var(--surface)" />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="12" fill="var(--fg-subtle)">—</text>
      </svg>
    )
  }

  // Single value: SVG arc from point A to A is degenerate and doesn't render — use circles instead
  if (values.length === 1) {
    return (
      <svg viewBox="0 0 120 120" width={140} height={140} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={outerR} fill={DONUT_COLORS[0]} />
        <circle cx={cx} cy={cy} r={innerR} fill="var(--surface)" />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--fg)">{totalLabel}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8.5" fill="var(--fg-subtle)">users</text>
      </svg>
    )
  }

  let angle = -Math.PI / 2
  const arcs = values.map((v, i) => {
    const start = angle
    const end = angle + (v.users / total) * 2 * Math.PI
    angle = end
    return { start, end, color: DONUT_COLORS[i % DONUT_COLORS.length] }
  })

  function pathD(start: number, end: number) {
    const gap = 0.025
    const s = start + gap / 2, e = end - gap / 2
    const large = e - s > Math.PI ? 1 : 0
    const [c1, s1] = [Math.cos(s), Math.sin(s)]
    const [c2, s2] = [Math.cos(e), Math.sin(e)]
    return [
      `M ${cx + outerR * c1} ${cy + outerR * s1}`,
      `A ${outerR} ${outerR} 0 ${large} 1 ${cx + outerR * c2} ${cy + outerR * s2}`,
      `L ${cx + innerR * c2} ${cy + innerR * s2}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${cx + innerR * c1} ${cy + innerR * s1}`,
      'Z',
    ].join(' ')
  }

  return (
    <svg viewBox="0 0 120 120" width={140} height={140} style={{ flexShrink: 0 }}>
      {arcs.map((a, i) => <path key={i} d={pathD(a.start, a.end)} fill={a.color} />)}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--fg)">{totalLabel}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8.5" fill="var(--fg-subtle)">users</text>
    </svg>
  )
}

function SegmentsEmptyState({ sourceId }: { sourceId: string }) {
  const navigate = useNavigate()
  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex flex-col items-start gap-3">
      <p className="text-[13px] text-fg-muted leading-[1.5]">
        Segments break down your users by event properties — such as platform, country, or plan.
        Add properties to your mapping to enable segment analysis.
      </p>
      <Button variant="secondary" size="sm" onClick={() => navigate(`/mapping/${sourceId}`)}>
        Configure properties
      </Button>
    </div>
  )
}

function SegmentTabView({ specs }: { specs: ChartSpec[] }) {
  const segments = specs
    .filter(s => s.chart_type === 'segment_bars')
    .map(s => ({
      property: s.title,
      top_values: s.data as SegmentPropertyData['top_values'],
      users_with_prop: (s.config.users_with_prop as number | undefined),
    }))

  const [activeIdx, setActiveIdx] = useState(0)
  if (!segments.length) return null

  const idx = Math.min(activeIdx, segments.length - 1)
  const { property, top_values, users_with_prop } = segments[idx]
  const segTotal = top_values.reduce((s, v) => s + v.users, 0)
  const centerNum = users_with_prop ?? segTotal
  const totalLabel = centerNum >= 1000 ? `${(centerNum / 1000).toFixed(1)}k` : String(centerNum)

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {segments.length > 1 && (
        <div className="flex items-center border-b border-border px-4">
          {segments.map((seg, i) => (
            <button
              key={seg.property}
              type="button"
              onClick={() => setActiveIdx(i)}
              className="px-3 py-[10px] text-[13px] font-medium transition-colors border-b-2 -mb-px cursor-pointer hover:bg-surface-2 rounded-t-sm"
              style={{
                borderBottomColor: i === idx ? 'var(--accent)' : 'transparent',
                color: i === idx ? 'var(--fg)' : 'var(--fg-muted)',
              }}
            >
              {seg.property}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-8 px-6 py-5">
        <DonutSvg values={top_values} totalLabel={totalLabel} />

        <div className="flex-1 flex flex-col gap-[10px] min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="w-[10px] shrink-0" />
            <span className="flex-1 text-[11px] text-fg-subtle">Value</span>
            <span className="text-[11px] text-fg-subtle w-14 text-right">Users</span>
            <span className="text-[11px] text-fg-subtle w-12 text-right">Share</span>
          </div>
          {top_values.map((v, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className="w-[10px] h-[10px] rounded-full shrink-0"
                style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              <span className="flex-1 text-[13px] text-fg truncate min-w-0">{v.value}</span>
              <span className="text-[13px] text-fg tabular-nums w-14 text-right">{v.users.toLocaleString()}</span>
              <span className="text-[12px] text-fg-muted tabular-nums w-12 text-right">
                {v.pct > 0 ? `${(v.pct * 100).toFixed(1)}%` : '—'}
              </span>
            </div>
          ))}
          {top_values.length === 0 && (
            <p className="text-[12px] text-fg-subtle">No data for this period</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ChartSpecRenderer({
  spec, N, sourceId, dateRange, sectionFilters, annotations, allSpec,
}: {
  spec: ChartSpec
  N: number
  sourceId: string
  dateRange?: { start?: string; end?: string }
  sectionFilters?: PropertyFilter[]
  annotations?: Annotation[]
  allSpec?: ChartSpec
}) {
  switch (spec.chart_type) {
    case 'line':           return <LineSpecRenderer spec={spec} N={N} annotations={annotations} allSpec={allSpec} />
    case 'stacked_bar':    return <StackedBarSpecRenderer spec={spec} N={N} />
    case 'hbar':           return <HBarSpecRenderer spec={spec} N={N} />
    case 'funnel':         return <FunnelBuilder key={`${dateRange?.start ?? ''}|${dateRange?.end ?? ''}`} spec={spec} sourceId={sourceId} dateRange={dateRange} filters={sectionFilters ?? []} />
    case 'funnel_skipped': return <FunnelSkippedRenderer spec={spec} sourceId={sourceId} />
    case 'cohort_heatmap': return <CohortHeatmapSpecRenderer spec={spec} />
    default:               return null
  }
}

// ── Dataset header strip ─────────────────────────────────────────
function DatasetHeaderStrip({ analysisStatus, filteredStatus, onExportPage, exportingPage }: {
  analysisStatus: string
  filteredStatus: string
  onExportPage?: () => void
  exportingPage?: boolean
}) {
  const navigate = useNavigate()
  const { source_id } = useParams<{ source_id: string }>()
  const { activeSource } = useSourceStore()
  const { getRun } = useAnalysisStore()

  const name = activeSource?.name ?? 'events_2026_q1.csv'
  const format = activeSource?.metadata?.detected_format ?? 'amplitude'
  const totalRows = activeSource?.metadata?.total_rows

  const run = source_id ? getRun(source_id) : null
  const engData = run?.results.find(r => r.name === 'engagement')?.data as Record<string, unknown> | undefined
  const mau = engData?.mau as number | undefined

  const isBusy = analysisStatus === 'loading' || filteredStatus === 'loading'
  const isInitialAnalysis = analysisStatus === 'loading'
  const busyLabel = isInitialAnalysis ? 'Running analysis…' : 'Recomputing for window…'

  return (
    <div className="max-w-[1320px] w-full mx-auto px-7 pt-5 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-7 h-7 rounded-md bg-surface-2 border border-border flex items-center justify-center text-fg-muted flex-shrink-0">
          <CsvIcon />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-mono text-fg">{name}</span>
            <Tag tone="neutral">{format.charAt(0).toUpperCase() + format.slice(1)}</Tag>
            {isBusy && (
              <span
                className="inline-flex items-center gap-[6px] text-[12px] font-medium px-[10px] py-[3px] rounded-full"
                style={{
                  background: 'var(--accent-tint)',
                  color: 'var(--accent)',
                  border: '1px solid color-mix(in oklch, var(--accent) 25%, transparent)',
                }}
              >
                <Spinner size={11} />
                {busyLabel}
              </span>
            )}
            {analysisStatus === 'error' && (
              <span
                className="inline-flex items-center gap-[6px] text-[12px] font-medium px-[10px] py-[3px] rounded-full"
                style={{
                  background: 'var(--danger-tint)',
                  color: 'var(--danger)',
                  border: '1px solid color-mix(in oklch, var(--danger) 25%, transparent)',
                }}
              >
                Analysis failed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-[3px] flex-wrap">
            {totalRows != null && (
              <span className="text-[11px] text-fg-subtle">{totalRows.toLocaleString()} events</span>
            )}
            {totalRows != null && mau != null && <Dot />}
            {mau != null && (
              <span className="text-[11px] text-fg-subtle">{mau.toLocaleString()} users</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onExportPage && (
          <Button
            variant="ghost"
            size="sm"
            leading={<ExportPageIcon />}
            onClick={onExportPage}
            disabled={exportingPage}
          >
            {exportingPage ? 'Exporting…' : 'Export page'}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => navigate(`/mapping/${source_id}`)}>
          Edit mapping
        </Button>
        <Button variant="secondary" size="sm" leading={<PlusIcon />} onClick={() => navigate('/upload')}>
          New analysis
        </Button>
      </div>
    </div>
  )
}

function Dot() {
  return <span className="inline-block w-[3px] h-[3px] rounded-full bg-fg-subtle" />
}

// ── Annotation form (inline popover) ────────────────────────────
function AnnotationForm({
  datasetFrom, datasetTo,
  onAdd, onClose,
}: {
  datasetFrom: string; datasetTo: string
  onAdd: (date: string, label: string) => void
  onClose: () => void
}) {
  const [date, setDate] = useState(datasetTo)
  const [label, setLabel] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function submit() {
    if (!date || !label.trim()) return
    onAdd(date, label.trim())
    onClose()
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-[6px] bg-surface border border-border rounded-lg z-20 p-[12px] flex flex-col gap-[8px]"
      style={{ width: 260, boxShadow: 'var(--shadow-md)' }}
    >
      <div className="text-[12px] font-medium text-fg">Add annotation</div>
      <input
        type="date"
        value={date}
        min={datasetFrom}
        max={datasetTo}
        onChange={e => setDate(e.target.value)}
        className="h-[28px] px-2 text-[12px] text-fg bg-surface border border-border rounded-sm outline-none w-full cursor-pointer"
        style={{ colorScheme: 'inherit', fontFamily: 'inherit' }}
      />
      <input
        type="text"
        placeholder="Label (e.g. v2.0 released)"
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        className="h-[28px] px-2 text-[12px] text-fg bg-surface border border-border rounded-sm outline-none w-full placeholder:text-fg-subtle"
        style={{ fontFamily: 'inherit' }}
        autoFocus
      />
      <div className="flex gap-[6px]">
        <Button variant="primary" size="sm" full onClick={submit} disabled={!date || !label.trim()}>
          Add
        </Button>
        <Button variant="secondary" size="sm" full onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ── Save bookmark form ───────────────────────────────────────────
function SaveBookmarkForm({ onSave, onClose }: {
  onSave: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function submit() {
    if (!name.trim()) return
    onSave(name.trim())
    onClose()
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-[6px] bg-surface border border-border rounded-lg z-20 p-[12px] flex flex-col gap-[8px]"
      style={{ width: 240, boxShadow: 'var(--shadow-md)' }}
    >
      <div className="text-[12px] font-medium text-fg">Save view</div>
      <input
        type="text"
        placeholder="e.g. Last 7 days — mobile"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        className="h-[28px] px-2 text-[12px] text-fg bg-surface border border-border rounded-sm outline-none w-full placeholder:text-fg-subtle"
        style={{ fontFamily: 'inherit' }}
        autoFocus
      />
      <div className="flex gap-[6px]">
        <Button variant="primary" size="sm" full onClick={submit} disabled={!name.trim()}>
          Save
        </Button>
        <Button variant="secondary" size="sm" full onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ── Analysis bar ─────────────────────────────────────────────────
function AnalysisBar({
  win, setWin, desc, datasetFrom, datasetTo,
  globalFilters, onFiltersChange, propertyOptions,
  annotations, onAddAnnotation, onRemoveAnnotation,
  bookmarks, onSaveBookmark, onRemoveBookmark, onApplyBookmark,
}: {
  win: WinState; setWin: (w: WinState) => void; desc: WinDesc
  datasetFrom: string; datasetTo: string
  globalFilters: PropertyFilter[]
  onFiltersChange: (f: PropertyFilter[]) => void
  propertyOptions: PropertyOption[]
  annotations: Annotation[]
  onAddAnnotation: (date: string, label: string) => void
  onRemoveAnnotation: (id: string) => void
  bookmarks: Bookmark[]
  onSaveBookmark: (name: string) => void
  onRemoveBookmark: (id: string) => void
  onApplyBookmark: (bm: Bookmark) => void
}) {
  const [showAnnotationForm, setShowAnnotationForm] = useState(false)
  const [showBookmarkForm, setShowBookmarkForm] = useState(false)

  const activeFilters = globalFilters.filter(f => f.vals.length > 0)

  return (
    <div className="max-w-[1320px] w-full mx-auto px-7 pt-[14px] flex flex-col gap-[10px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-[10px]">
          <span className="text-[13px] text-fg-subtle">Analyzing</span>
          <TimeRangePicker win={win} setWin={setWin} desc={desc} datasetFrom={datasetFrom} datasetTo={datasetTo} />
          {desc.capped && (
            <span className="text-[12px] text-fg-subtle">
              (dataset only spans {Math.round((new Date(datasetTo).getTime() - new Date(datasetFrom).getTime()) / 86400000) + 1} days — showing all)
            </span>
          )}
          {/* Mark date button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowAnnotationForm(f => !f); setShowBookmarkForm(false) }}
              className="inline-flex items-center gap-[5px] h-[30px] px-[10px] text-[12px] font-medium text-fg-muted hover:text-fg bg-surface border border-border rounded-md cursor-pointer transition-colors duration-[100ms]"
              style={{ borderColor: showAnnotationForm ? 'var(--accent)' : undefined }}
              title="Add date annotation"
            >
              <FlagIcon />
              Mark date
            </button>
            {showAnnotationForm && (
              <AnnotationForm
                datasetFrom={datasetFrom}
                datasetTo={datasetTo}
                onAdd={onAddAnnotation}
                onClose={() => setShowAnnotationForm(false)}
              />
            )}
          </div>
          {/* Save view button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowBookmarkForm(f => !f); setShowAnnotationForm(false) }}
              className="inline-flex items-center gap-[5px] h-[30px] px-[10px] text-[12px] font-medium text-fg-muted hover:text-fg bg-surface border border-border rounded-md cursor-pointer transition-colors duration-[100ms]"
              style={{ borderColor: showBookmarkForm ? 'var(--accent)' : undefined }}
              title="Save current view"
            >
              <BookmarkIcon />
              Save view
            </button>
            {showBookmarkForm && (
              <SaveBookmarkForm
                onSave={onSaveBookmark}
                onClose={() => setShowBookmarkForm(false)}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[13px] cursor-pointer select-none"
            style={{ color: win.compare ? 'var(--fg)' : 'var(--fg-muted)' }}
            onClick={() => setWin({ ...win, compare: !win.compare })}
          >
            Compare to previous period
          </span>
          <Switch on={win.compare} onChange={v => setWin({ ...win, compare: v })} />
        </div>
      </div>

      {/* Bookmarks row */}
      {bookmarks.length > 0 && (
        <div className="flex items-center gap-[6px] flex-wrap">
          <span className="text-[11px] text-fg-subtle shrink-0">Views</span>
          {bookmarks.map(bm => {
            const active = isBookmarkActive(bm, win, globalFilters)
            return (
              <span
                key={bm.id}
                className="inline-flex items-center gap-[4px] h-[22px] px-[8px] rounded-md text-[11px] font-medium cursor-pointer transition-colors duration-[80ms]"
                style={{
                  background: active
                    ? 'color-mix(in oklch, var(--accent) 12%, transparent)'
                    : 'var(--surface-2)',
                  color: active ? 'var(--accent)' : 'var(--fg-muted)',
                  border: `1px solid ${active ? 'color-mix(in oklch, var(--accent) 35%, transparent)' : 'var(--border)'}`,
                }}
                onClick={() => onApplyBookmark(bm)}
              >
                <BookmarkIcon filled={active} />
                <span>{bm.name}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onRemoveBookmark(bm.id) }}
                  className="ml-[2px] text-[13px] leading-none cursor-pointer opacity-50 hover:opacity-100"
                  style={{ lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Annotation chips */}
      {annotations.length > 0 && (
        <div className="flex items-center gap-[6px] flex-wrap">
          <span className="text-[11px] text-fg-subtle shrink-0">Markers</span>
          {annotations.map(a => (
            <span
              key={a.id}
              className="inline-flex items-center gap-[4px] h-[22px] px-[8px] rounded-md text-[11px] font-medium"
              style={{
                background: 'color-mix(in oklch, var(--warning) 10%, transparent)',
                color: 'var(--warning)',
                border: '1px solid color-mix(in oklch, var(--warning) 30%, transparent)',
              }}
            >
              <span>{a.date.slice(5)}</span>
              <span style={{ opacity: 0.7 }}>·</span>
              <span>{a.label}</span>
              <button
                type="button"
                onClick={() => onRemoveAnnotation(a.id)}
                className="ml-[2px] text-[13px] leading-none cursor-pointer opacity-60 hover:opacity-100"
                style={{ lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {propertyOptions.length > 0 && (
        <GlobalFilterBar
          filters={globalFilters}
          propertyOptions={propertyOptions}
          onChange={onFiltersChange}
        />
      )}
    </div>
  )
}

// ── Section header ───────────────────────────────────────────────
interface SectionHeaderProps {
  label: string
  helper?: string
  action?: React.ReactNode
  count?: number
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
}
function SectionHeader({ label, helper, action, count, collapsible, open = true, onToggle }: SectionHeaderProps) {
  const TitleTag = collapsible ? 'button' : 'div'
  return (
    <div className="flex items-baseline justify-between gap-3 mb-[14px] mt-2">
      <TitleTag
        type={collapsible ? 'button' : undefined}
        onClick={collapsible ? onToggle : undefined}
        className="flex items-center gap-[10px] min-w-0 bg-transparent border-0 p-0"
        style={{ cursor: collapsible ? 'pointer' : 'default' }}
      >
        {collapsible && (
          <span className="inline-flex text-fg-subtle">
            <ChevronCollapseIcon open={open} />
          </span>
        )}
        <h2 className="text-[14px] font-medium text-fg m-0">{label}</h2>
        {count != null && (
          <span className="text-[11px] text-fg-muted bg-surface-2 px-[6px] py-[2px] rounded-sm tabular-nums">
            {count}
          </span>
        )}
        {helper && <span className="text-[13px] text-fg-muted">{helper}</span>}
      </TitleTag>
      {action}
    </div>
  )
}

// ── Ask field ────────────────────────────────────────────────────
function AskField({ value, onChange, onSubmit, disabled = false, textareaRef }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; disabled?: boolean
  textareaRef?: React.RefObject<HTMLTextAreaElement>
}) {
  const [focus, setFocus] = useState(false)
  return (
    <div
      className="flex flex-col rounded-md transition-[border-color,box-shadow] duration-[120ms]"
      style={{
        border: `1px solid ${focus ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: focus ? '0 0 0 3px color-mix(in oklch, var(--accent) 12%, transparent)' : 'none',
        background: 'var(--surface)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        rows={3}
        placeholder="e.g. Why did retention drop on Day 3?"
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit() }
        }}
        className="flex-1 px-3 pt-[10px] pb-1 text-[13px] text-fg border-none bg-transparent outline-none resize-none leading-[1.5]"
        style={{ fontFamily: 'inherit' }}
      />
      <div className="flex items-center justify-between px-2 pb-2 pt-[6px]">
        <span className="text-[11px] text-fg-subtle pl-1">⌘↵ to ask</span>
        <Button
          variant="primary"
          size="sm"
          disabled={!value.trim() || disabled}
          onClick={onSubmit}
          trailing={<ArrowRightSmall />}
        >
          {disabled ? 'Asking…' : 'Ask'}
        </Button>
      </div>
    </div>
  )
}

// ── Q&A side panel ───────────────────────────────────────────────
interface RecentQ { id: string; question: string; askedAt: string }

function QASidePanel() {
  const navigate = useNavigate()
  const { source_id } = useParams<{ source_id: string }>()
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [questions, setQuestions] = useState<RecentQ[]>(DEMO_QUESTIONS)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== '/') return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      textareaRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const suggestions = [
    'Why did D3 retention drop on mobile?',
    'Which segment grew fastest this month?',
    'Where do users drop in the funnel?',
  ]

  async function handleSubmit() {
    const q = draft.trim()
    if (!q || !source_id || submitting) return
    setSubmitting(true)
    try {
      const { data } = await api.questions.ask({ source_id, text: q })
      setQuestions(prev => [{ id: data.id, question: q, askedAt: 'just now' }, ...prev])
      setDraft('')
      navigate(`/question/${data.id}`)
    } catch {
      // fallback: navigate with question in state so Question page can show it
      const id = 'q-' + Date.now()
      setQuestions(prev => [{ id, question: q, askedAt: 'just now' }, ...prev])
      navigate(`/question/${id}`, { state: { question: q } })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <aside
      className="bg-surface border border-border rounded-lg p-[18px] flex flex-col gap-[14px]"
      style={{
        position: 'sticky',
        top: 196,
        alignSelf: 'flex-start',
        maxHeight: 'calc(100vh - 220px)',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <div
            className="w-[22px] h-[22px] rounded-sm flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}
          >
            <SparkleIcon />
          </div>
          <h2 className="text-[14px] font-medium text-fg m-0">Ask anything</h2>
        </div>
        <p className="text-[13px] text-fg-muted mt-[6px] leading-[1.4]">
          The agent will pick the right analytical tools, run them on your data, and explain what it found.
        </p>
      </div>

      <AskField value={draft} onChange={setDraft} onSubmit={handleSubmit} disabled={submitting} textareaRef={textareaRef} />

      {/* Suggestions */}
      <div>
        <div className="text-[11px] text-fg-subtle mb-2">Try</div>
        <div className="flex flex-col gap-[6px]">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setDraft(s)}
              className="flex items-start gap-[6px] text-left px-[10px] py-2 bg-surface-2 border border-border rounded-md text-[13px] text-fg-muted leading-[1.4] cursor-pointer transition-colors duration-[100ms] hover:text-fg"
            >
              <span className="text-fg-subtle leading-5 flex-shrink-0">↗</span>
              <span>{s}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent questions */}
      <div className="border-t border-border pt-[14px]">
        <div className="text-[11px] text-fg-subtle mb-2">Recent questions</div>
        <div className="flex flex-col">
          {questions.map(q => (
            <button
              key={q.id}
              type="button"
              onClick={() => navigate(`/question/${q.id}`)}
              className="flex flex-col gap-[2px] px-2 py-2 rounded-md -mx-2 text-left cursor-pointer transition-colors duration-[100ms] bg-transparent border-0 hover:bg-surface-2"
            >
              <span className="text-[13px] text-fg leading-[1.4]">{q.question}</span>
              <span className="text-[11px] text-fg-subtle">{q.askedAt}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

// ── What changed table ───────────────────────────────────────────
interface PeriodDiffRow {
  label: string
  current: number
  previous: number
  format: 'integer' | 'pct'
}

function computePeriodDiffs(
  dauRaw: DauPoint[],
  nvrSeries: { date: string; new: number; returning: number }[],
  N: number,
): { rows: PeriodDiffRow[]; curLabel: string; prevLabel: string } | null {
  if (dauRaw.length < N + 1) return null
  const curDau  = dauRaw.slice(-N)
  const prevDau = dauRaw.slice(Math.max(0, dauRaw.length - 2 * N), dauRaw.length - N)
  if (!prevDau.length) return null

  const avg  = (arr: DauPoint[]) => Math.round(arr.reduce((s, d) => s + d.dau, 0) / arr.length)
  const peak = (arr: DauPoint[]) => Math.max(...arr.map(d => d.dau))

  const rows: PeriodDiffRow[] = [
    { label: 'Avg DAU',  current: avg(curDau),  previous: avg(prevDau),  format: 'integer' },
    { label: 'Peak DAU', current: peak(curDau), previous: peak(prevDau), format: 'integer' },
  ]

  if (nvrSeries.length >= N) {
    const curNvr  = nvrSeries.slice(-N)
    const prevNvr = nvrSeries.slice(Math.max(0, nvrSeries.length - 2 * N), nvrSeries.length - N)
    if (prevNvr.length) {
      const sumN = (a: typeof curNvr) => a.reduce((s, d) => s + d.new, 0)
      const sumR = (a: typeof curNvr) => a.reduce((s, d) => s + d.returning, 0)
      const cN = sumN(curNvr), pN = sumN(prevNvr)
      const cR = sumR(curNvr), pR = sumR(prevNvr)
      rows.push(
        { label: 'New users',       current: cN, previous: pN, format: 'integer' },
        { label: 'Returning users', current: cR, previous: pR, format: 'integer' },
        {
          label: 'New user rate',
          current:  cN + cR > 0 ? cN / (cN + cR) : 0,
          previous: pN + pR > 0 ? pN / (pN + pR) : 0,
          format: 'pct',
        },
      )
    }
  }

  const curLabel  = `${fmtDate(curDau[0].date)} – ${fmtDate(curDau[curDau.length - 1].date)}`
  const prevLabel = `${fmtDate(prevDau[0].date)} – ${fmtDate(prevDau[prevDau.length - 1].date)}`
  return { rows, curLabel, prevLabel }
}

function fmtDiffVal(v: number, fmt: 'integer' | 'pct') {
  return fmt === 'pct' ? `${Math.round(v * 100)}%` : v.toLocaleString()
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="text-[11px] text-fg-subtle">—</span>
  const ratio = (current - previous) / previous
  const abs = Math.abs(ratio * 100)
  if (abs < 0.05) return <span className="text-[11px] text-fg-subtle">≈ 0%</span>
  const sign = ratio > 0 ? '+' : '−'
  const color = ratio > 0 ? 'var(--success)' : 'var(--danger)'
  const bg    = ratio > 0 ? 'var(--success-tint)' : 'var(--danger-tint)'
  return (
    <span
      className="inline-flex items-center h-[18px] px-[6px] rounded text-[11px] font-medium tabular-nums"
      style={{ background: bg, color }}
    >
      {sign}{abs.toFixed(1)}%
    </span>
  )
}

function WhatChangedTable({ dauRaw, engData, N }: {
  dauRaw: DauPoint[]
  engData: Record<string, any> | undefined
  N: number
}) {
  const nvrSeries: { date: string; new: number; returning: number }[] = engData?.new_returning_series ?? []
  const result = computePeriodDiffs(dauRaw, nvrSeries, N)
  if (!result) return null
  const { rows, curLabel, prevLabel } = result

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className="grid px-4 py-[9px] border-b border-border"
        style={{ gridTemplateColumns: '1fr 100px 100px 68px' }}
      >
        <span className="text-[12px] font-medium text-fg">What changed?</span>
        <span className="text-[11px] text-fg-subtle text-right tabular-nums">{prevLabel}</span>
        <span className="text-[11px] text-fg-subtle text-right tabular-nums">{curLabel}</span>
        <span className="text-[11px] text-fg-subtle text-right">Change</span>
      </div>
      {/* Rows */}
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid px-4 py-[7px] transition-colors duration-[60ms] hover:bg-surface-2"
          style={{
            gridTemplateColumns: '1fr 100px 100px 68px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
          }}
        >
          <span className="text-[13px] text-fg">{row.label}</span>
          <span className="text-[12px] text-fg-muted tabular-nums text-right">
            {fmtDiffVal(row.previous, row.format)}
          </span>
          <span className="text-[12px] text-fg font-medium tabular-nums text-right">
            {fmtDiffVal(row.current, row.format)}
          </span>
          <div className="flex justify-end">
            <DeltaBadge current={row.current} previous={row.previous} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main column ──────────────────────────────────────────────────
function MainColumn({ win, desc, analysisStatus, activeKey, filteredStatus, globalFilters, propertyOptions, annotations, containerRef }: {
  win: WinState; desc: WinDesc; analysisStatus: string
  activeKey: string | null; filteredStatus: string
  globalFilters: PropertyFilter[]
  propertyOptions: PropertyOption[]
  annotations: Annotation[]
  containerRef?: React.RefObject<HTMLDivElement>
}) {
  const navigate = useNavigate()
  const { source_id } = useParams<{ source_id: string }>()
  // Subscribe to the runs map directly so updates from setRun trigger re-renders
  const runsMap = useAnalysisStore(s => s.runs)
  const getRun = useAnalysisStore(s => s.getRun)
  const setRun = useAnalysisStore(s => s.setRun)

  const [insightsBg, setInsightsBg] = useState<'idle' | 'generating' | 'ready'>('idle')
  const [bgDismissed, setBgDismissed] = useState(false)
  const wentThroughLoading = useRef(false)

  // Reset notification when navigating to a different source
  useEffect(() => { setInsightsBg('idle'); setBgDismissed(false); wentThroughLoading.current = false }, [source_id])

  // Show "generating" whenever a fresh analysis ran (went through loading → done)
  useEffect(() => {
    if (analysisStatus === 'loading') { wentThroughLoading.current = true; return }
    if (analysisStatus === 'done' && wentThroughLoading.current) {
      wentThroughLoading.current = false
      setInsightsBg('generating')
      setBgDismissed(false)
    }
  }, [analysisStatus])

  // Auto-dismiss: "ready" after 6 s, "generating" after 180 s (fallback if insights never arrive)
  useEffect(() => {
    if (insightsBg === 'idle') return
    const delay = insightsBg === 'ready' ? 6000 : 180000
    const t = setTimeout(() => setBgDismissed(true), delay)
    return () => clearTimeout(t)
  }, [insightsBg])

  const N = desc.days
  const showSkeleton = analysisStatus === 'idle' || analysisStatus === 'loading'
  const showChartSkeleton = showSkeleton || filteredStatus === 'loading'

  // Active run: filtered if available, else full dataset.
  // Read from runsMap (not getRun) so the component re-renders when the store updates.
  const fullRun = source_id ? (runsMap[source_id] ?? null) : null
  const run = (activeKey ? (runsMap[activeKey] ?? null) : null) ?? fullRun
  type AnyData = Record<string, any>
  const engData    = run?.results.find(r => r.name === 'engagement')?.data as AnyData | undefined
  const retData    = run?.results.find(r => r.name === 'retention')?.data as AnyData | undefined
  // Always use the full (unwindowed) engagement data for period comparison
  const fullEngData = fullRun?.results.find(r => r.name === 'engagement')?.data as AnyData | undefined

  // Build DAU series for Overview KPI sparklines (windowed run)
  const dauRaw: DauPoint[] = engData?.dau_series
    ? (engData.dau_series as { date: string; dau: number }[]).map(d => ({ date: new Date(d.date), dau: d.dau }))
    : DASH_DAU_RAW

  // Full DAU series — used for "What changed" period comparison
  const fullDauRaw: DauPoint[] = fullEngData?.dau_series
    ? (fullEngData.dau_series as { date: string; dau: number }[]).map(d => ({ date: new Date(d.date), dau: d.dau }))
    : dauRaw

  const m = computeMetrics(N, dauRaw)
  const showCompare = win.compare && fullDauRaw.length > N

  const [insightsOpen, setInsightsOpen] = useState(() => {
    try {
      const stored = localStorage.getItem('dashboard_insights_open')
      return stored === null ? true : stored === 'true'
    } catch { return true }
  })

  type SectionOverride = { specs: ChartSpec[]; loading: boolean } | null
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, SectionOverride>>({})

  const [sevFilter, setSevFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [showDismissed, setShowDismissed] = useState(false)
  const { prefs: insightPrefs, togglePin, toggleDismiss } = useInsightPrefs(source_id ?? '')

  const windowedInsights = (run?.insights ?? []) as Insight[]
  const fullInsights = (fullRun?.insights ?? []) as Insight[]
  const rawInsights = windowedInsights.length > 0 ? windowedInsights : fullInsights
  const realInsights = rawInsights.length > 0 ? rawInsights : null
  const isWindowedInsights = windowedInsights.length > 0 && activeKey !== null

  // Poll for windowed insights while background generation runs (max 6 attempts × 25s = 150s)
  useEffect(() => {
    if (!source_id || !activeKey || filteredStatus !== 'done') return
    const currentRun = getRun(activeKey)
    if (!currentRun || (currentRun as any).insights?.length > 0) return

    let attempt = 0
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      if (!activeKey.startsWith(source_id + ':')) return
      const [, start, end] = activeKey.split(':')
      try {
        const { data } = await api.analysis.get(source_id, { start, end })
        if ((data as any).insights?.length > 0) {
          setRun(activeKey, data as any)
          setInsightsBg(prev => prev === 'generating' ? 'ready' : prev)
          setBgDismissed(false)
          return
        }
      } catch { /* backend still computing */ }
      attempt++
      if (attempt < 6) timer = setTimeout(poll, 25000)
    }

    timer = setTimeout(poll, 25000)
    return () => clearTimeout(timer)
  }, [activeKey, filteredStatus, source_id])

  // Poll for full-dataset insights while background generation runs (max 6 attempts × 25s = 150s)
  useEffect(() => {
    if (!source_id || activeKey || filteredStatus !== 'done') return
    const currentFullRun = getRun(source_id)
    if (!currentFullRun || (currentFullRun as any).insights?.length > 0) return

    let attempt = 0
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const { data } = await api.analysis.get(source_id, {})
        if ((data as any).insights?.length > 0) {
          setRun(source_id, data as any)
          setInsightsBg(prev => prev === 'generating' ? 'ready' : prev)
          setBgDismissed(false)
          return
        }
      } catch { /* backend still computing */ }
      attempt++
      if (attempt < 6) timer = setTimeout(poll, 25000)
    }

    timer = setTimeout(poll, 25000)
    return () => clearTimeout(timer)
  }, [activeKey, filteredStatus, source_id])

  const allInsights = realInsights ?? DASH_INSIGHTS
  const insightCategories = Array.from(new Set(allInsights.map(ins => ins.category).filter(Boolean)))

  // Apply severity + category filters, then sort pinned first
  const filteredInsights = useMemo(() => {
    const base = allInsights.filter(ins => {
      if (sevFilter !== 'all' && ins.severity !== sevFilter) return false
      if (catFilter !== 'all' && ins.category !== catFilter) return false
      return true
    })
    return [...base].sort((a, b) => {
      const ap = insightPrefs.pinned.includes(a.id) ? 0 : 1
      const bp = insightPrefs.pinned.includes(b.id) ? 0 : 1
      return ap - bp
    })
  }, [allInsights, sevFilter, catFilter, insightPrefs.pinned])

  const dismissedCount = filteredInsights.filter(ins => insightPrefs.dismissed.includes(ins.id)).length
  const visibleInsights = showDismissed
    ? filteredInsights
    : filteredInsights.filter(ins => !insightPrefs.dismissed.includes(ins.id))

  const sliceSpark = (arr: number[]) => arr.slice(-Math.min(N, arr.length))
  const mauSpark = sliceSpark([33,34,34,35,36,36,37,37,38,38,38,38])
  const retSpark = sliceSpark([44,43,43,42,41,41,40,39,39,38,38,38])
  const aevSpark = sliceSpark([18,18.2,18.5,18.4,18.8,19.0,19.0,19.2,19.1,19.3,19.4,19.4])

  // KPI values (real or mock)
  const dauValue   = engData ? (((engData.dau as number) ?? 0).toLocaleString()) : m.currentDAU.toLocaleString()
  const mauNum     = engData ? (((N <= 7 ? engData.wau : engData.mau) as number) ?? 0)
                             : (N >= DATASET_DAYS_DEFAULT ? 38210 : Math.round(38210 * (N / DATASET_DAYS_DEFAULT) / 50) * 50)
  const mauValue   = mauNum.toLocaleString()
  const d7RetPct   = retData ? `${Math.round(((retData.d7 as number) ?? 0) * 100)}%` : '38%'
  const avgEventsV = engData ? `${(((engData.avg_events_per_user as number) ?? 0)).toFixed(1)}` : '19.4'

  // Data-driven chart sections from chart_specs
  const chartSpecSections = useMemo(
    () => groupBySection(run?.results ?? []),
    [run],
  )

  // Recompute all non-funnel sections when global filters change
  const activeFilters = useMemo(
    () => globalFilters.filter(f => f.vals.length > 0),
    [globalFilters],
  )

  useEffect(() => {
    if (!source_id || analysisStatus !== 'done') return

    if (activeFilters.length === 0) {
      setSectionOverrides({})
      return
    }

    const currentRun = (activeKey ? getRun(activeKey) : null) ?? getRun(source_id)
    if (!currentRun) return

    const sectionsToRecompute = groupBySection(currentRun.results)
      .map(([name]) => name)
      .filter(name => name !== 'Funnel')

    setSectionOverrides(prev => {
      const next: Record<string, SectionOverride> = {}
      for (const name of sectionsToRecompute) {
        next[name] = { specs: prev[name]?.specs ?? [], loading: true }
      }
      return next
    })

    let alive = true
    let dateRange: { start?: string; end?: string } | undefined
    if (activeKey && activeKey.startsWith(source_id + ':')) {
      const [, s, e] = activeKey.split(':')
      dateRange = { start: s || undefined, end: e || undefined }
    }

    for (const sectionName of sectionsToRecompute) {
      api.analysis.computeSection(
        source_id!, sectionName.toLowerCase(), activeFilters, undefined, undefined, dateRange,
      ).then(({ data }) => {
        if (!alive) return
        setSectionOverrides(prev => ({
          ...prev,
          [sectionName]: { specs: (data as any).chart_specs ?? [], loading: false },
        }))
      }).catch(() => {
        if (!alive) return
        setSectionOverrides(prev => ({ ...prev, [sectionName]: null }))
      })
    }

    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activeFilters), source_id, analysisStatus, activeKey])

  return (
    <div ref={containerRef} className="min-w-0 flex flex-col gap-8">
      {/* Insights */}
      <section>
        <SectionHeader
          label="Insights"
          count={showSkeleton ? undefined : filteredInsights.length}
          helper={insightsOpen ? (filteredStatus === 'loading' ? 'Updating…' : isWindowedInsights ? 'For selected period' : 'Ranked by impact') : undefined}
          collapsible
          open={insightsOpen}
          onToggle={() => {
            const next = !insightsOpen
            setInsightsOpen(next)
            try { localStorage.setItem('dashboard_insights_open', String(next)) } catch {}
          }}
        />
        {insightsOpen && (
          <div className="flex flex-col gap-[10px]">
            {!showSkeleton && (
              <div className="flex items-center gap-[6px] flex-wrap -mt-[4px]">
                {/* Severity chips */}
                {(['all', 'high', 'medium', 'low'] as const).map(sev => {
                  const active = sevFilter === sev
                  const dot: Record<string, string> = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' }
                  return (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSevFilter(prev => prev === sev ? 'all' : sev)}
                      className="inline-flex items-center gap-[5px] h-[22px] px-[8px] rounded-md text-[11px] font-medium cursor-pointer transition-colors duration-[80ms]"
                      style={{
                        background: active ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'var(--surface-2)',
                        color: active ? 'var(--accent)' : 'var(--fg-muted)',
                        border: `1px solid ${active ? 'color-mix(in oklch, var(--accent) 35%, transparent)' : 'var(--border)'}`,
                      }}
                    >
                      {sev !== 'all' && (
                        <span className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: dot[sev] }} />
                      )}
                      {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </button>
                  )
                })}
                {/* Category chips — only when >1 category */}
                {insightCategories.length > 1 && (
                  <>
                    <span className="w-px h-[14px] bg-border mx-[2px]" />
                    {insightCategories.map(cat => {
                      const active = catFilter === cat
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCatFilter(active ? 'all' : cat)}
                          className="inline-flex items-center h-[22px] px-[8px] rounded-md text-[11px] font-medium cursor-pointer transition-colors duration-[80ms]"
                          style={{
                            background: active ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'var(--surface-2)',
                            color: active ? 'var(--accent)' : 'var(--fg-muted)',
                            border: `1px solid ${active ? 'color-mix(in oklch, var(--accent) 35%, transparent)' : 'var(--border)'}`,
                          }}
                        >
                          {cat}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
            {showSkeleton ? (
              [0, 1, 2].map(i => <StatCardSkeleton key={i} className="h-[88px]" />)
            ) : visibleInsights.length === 0 && dismissedCount === 0 ? (
              <div className="text-[13px] text-fg-subtle py-3">No insights match the selected filters.</div>
            ) : (
              <>
                {visibleInsights.map(ins => {
                  const isReal = !!realInsights
                  const isPinned = insightPrefs.pinned.includes(ins.id)
                  const isDismissed = insightPrefs.dismissed.includes(ins.id)
                  return (
                    <InsightCard
                      key={ins.id}
                      severity={ins.severity}
                      category={ins.category}
                      title={ins.title}
                      description={ins.description}
                      metric={isReal
                        ? ((ins as any).metrics?.metric_value ? { value: (ins as any).metrics.metric_value, label: (ins as any).metrics.metric_label ?? '' } : undefined)
                        : (ins as any).metric}
                      tags={ins.tags}
                      pinned={isPinned}
                      dismissed={isDismissed}
                      onInvestigate={() => navigate(`/question/q-${ins.id}`)}
                      onPin={() => togglePin(ins.id)}
                      onDismiss={() => toggleDismiss(ins.id)}
                    />
                  )
                })}
                {dismissedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDismissed(d => !d)}
                    className="text-[12px] text-fg-subtle hover:text-fg cursor-pointer text-left transition-colors duration-[80ms]"
                  >
                    {showDismissed ? 'Hide dismissed' : `${dismissedCount} dismissed · Show`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* Overview KPI cards (always hardcoded — computed from window/sparklines) */}
      <section>
        <SectionHeader label="Overview" helper={desc.label} />
        {showChartSkeleton ? (
          <div className="grid grid-cols-4 gap-3">
            {[0,1,2,3].map(i => <StatCardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              label="Daily active users"
              value={dauValue}
              delta={m.delta ?? undefined}
              deltaDir={m.delta != null ? (m.delta >= 0 ? 'up' : 'down') : undefined}
              trail={m.currentWindow.map(d => d.dau)}
              showDelta={showCompare && m.delta != null}
            />
            <StatCard
              label={N <= 7 ? 'Weekly active users' : 'Monthly active users'}
              value={mauValue}
              delta={4.1}
              deltaDir="up"
              trail={mauSpark}
              showDelta={showCompare}
            />
            <StatCard
              label="D7 retention"
              value={d7RetPct}
              delta={-4.1}
              deltaDir="down"
              trail={retSpark}
              showDelta={showCompare}
            />
            <StatCard
              label="Avg events / user"
              value={avgEventsV}
              delta={0.6}
              deltaDir="up"
              trail={aevSpark}
              showDelta={showCompare}
            />
          </div>
        )}
      </section>

      {/* What changed — period comparison table */}
      {showCompare && !showChartSkeleton && (
        <WhatChangedTable dauRaw={fullDauRaw} engData={fullEngData ?? engData} N={N} />
      )}

      {/* Data-driven chart sections */}
      {showChartSkeleton ? (
        <>
          <section>
            <SectionHeader label="Engagement" />
            <div className="flex flex-col gap-3">
              <ChartSkeleton height={240} />
              <ChartSkeleton height={200} />
              <ChartSkeleton height={300} />
            </div>
          </section>
          <section>
            <SectionHeader label="Retention" />
            <div className="flex flex-col gap-3">
              <ChartSkeleton height={220} />
              <ChartSkeleton height={320} />
            </div>
          </section>
          <section>
            <SectionHeader label="Funnel" />
            <ChartSkeleton height={260} />
          </section>
        </>
      ) : (
        chartSpecSections.map(([sectionName, globalSpecs]) => {
          const isSegments = sectionName === 'Segments'
          const isFunnel = sectionName === 'Funnel'
          const override = sectionOverrides[sectionName]
          // Use filtered specs for non-funnel sections when loaded
          const displaySpecs = (!isFunnel && override && !override.loading && activeFilters.length > 0)
            ? override.specs
            : globalSpecs

          const helper = isFunnel
            ? displaySpecs.find(s => s.chart_type === 'funnel')?.title
            : undefined
          // Derive the date range backing the currently-shown run from activeKey
          // (format: `${source_id}:${start}:${end}`) so recompute hits the same slice.
          let dateRange: { start?: string; end?: string } | undefined
          if (activeKey && activeKey.startsWith(source_id + ':')) {
            const [, start, end] = activeKey.split(':')
            dateRange = { start: start || undefined, end: end || undefined }
          }
          return (
            <section key={sectionName}>
              <SectionHeader
                label={sectionName}
                helper={helper}
                action={!isFunnel && override?.loading
                  ? <span className="inline-flex items-center gap-[5px] text-[11px] text-fg-subtle"><Spinner size={9} />Filtering…</span>
                  : undefined
                }
              />
              {isSegments ? (
                displaySpecs.some(s => s.chart_type === 'segment_bars')
                  ? <SegmentTabView specs={displaySpecs} />
                  : <SegmentsEmptyState sourceId={source_id!} />
              ) : (
                <div className="flex flex-col gap-3">
                  {displaySpecs.map((spec, i) => {
                    const canOverlay = !isFunnel && !isSegments && activeFilters.length > 0 && override != null && !override.loading
                    const allSpec = (canOverlay && spec.chart_type === 'line')
                      ? globalSpecs.find(gs => gs.title === spec.title && gs.chart_type === 'line')
                      : undefined
                    return (
                      <ChartSpecRenderer
                        key={i}
                        spec={spec}
                        N={N}
                        sourceId={source_id!}
                        dateRange={dateRange}
                        sectionFilters={isFunnel ? activeFilters : undefined}
                        annotations={annotations}
                        allSpec={allSpec}
                      />
                    )
                  })}
                </div>
              )}
            </section>
          )
        })
      )}

      {/* Segments empty state — when the backend returned no segment specs at all */}
      {!showChartSkeleton && !chartSpecSections.some(([name]) => name === 'Segments') && (
        <section>
          <SectionHeader label="Segments" />
          <SegmentsEmptyState sourceId={source_id!} />
        </section>
      )}

      {/* Background insights notification — fixed bottom-right */}
      {insightsBg !== 'idle' && !bgDismissed && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          {insightsBg === 'generating' ? (
            <Toast
              kind="info"
              title="Generating AI insights"
              description="Computing insights for all time windows in the background…"
            />
          ) : (
            <Toast
              kind="success"
              title="AI insights ready"
              description="Switch time windows to see period-specific insights"
              onClose={() => setBgDismissed(true)}
            />
          )}
        </div>
      )}
    </div>
  )
}

const WIN_STORAGE_KEY = 'dashboard_win'
const DEFAULT_WIN: WinState = { preset: 'last30', from: null, to: null, compare: true }

function readWinFromStorage(): WinState {
  try {
    const saved = sessionStorage.getItem(WIN_STORAGE_KEY)
    return saved ? JSON.parse(saved) : DEFAULT_WIN
  } catch {
    return DEFAULT_WIN
  }
}

// ── Dashboard ────────────────────────────────────────────────────
export default function Dashboard() {
  const { source_id } = useParams<{ source_id: string }>()
  const runsMap = useAnalysisStore(s => s.runs)
  const getRun = useAnalysisStore(s => s.getRun)
  const setRun = useAnalysisStore(s => s.setRun)
  const { activeSource, setActiveSource } = useSourceStore()
  const [win, setWinState] = useState<WinState>(readWinFromStorage)
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [filteredStatus, setFilteredStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [globalFilters, setGlobalFilters] = useState<PropertyFilter[]>(() => {
    if (!source_id) return []
    try { return JSON.parse(localStorage.getItem(`filters_${source_id}`) ?? '[]') } catch { return [] }
  })

  function updateGlobalFilters(filters: PropertyFilter[]) {
    setGlobalFilters(filters)
    if (source_id) {
      try { localStorage.setItem(`filters_${source_id}`, JSON.stringify(filters)) } catch {}
    }
  }
  const { annotations, add: onAddAnnotation, remove: onRemoveAnnotation } = useAnnotations(source_id ?? '')
  const { bookmarks, save: saveBookmark, remove: removeBookmark } = useBookmarks(source_id ?? '')
  const mainColRef = useRef<HTMLDivElement>(null)
  const [exportingPage, setExportingPage] = useState(false)

  async function handleExportPage() {
    const el = mainColRef.current
    if (!el || exportingPage) return
    setExportingPage(true)
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff'
      const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: bg })
      const link = document.createElement('a')
      const name = activeSource?.name ?? 'dashboard'
      link.download = `${name.replace(/\.[^.]+$/, '').replace(/\s+/g, '-').toLowerCase()}-charts.png`
      link.href = dataUrl
      link.click()
    } catch {
      // silently ignore
    } finally {
      setExportingPage(false)
    }
  }

  // Rehydrate activeSource on direct navigation / page refresh
  useEffect(() => {
    if (!source_id) return
    if (activeSource?.id === source_id) return
    api.sources.get(source_id)
      .then(({ data }) => setActiveSource(data))
      .catch(() => {})
  }, [source_id, activeSource?.id])

  // Derive dataset date range from actual dau_series once loaded
  const fullRun = source_id ? (runsMap[source_id] ?? null) : null

  // Property options for filter bar — names from mapping, values from segments analysis
  const propertyOptions = useMemo((): PropertyOption[] => {
    const propertiesStr = activeSource?.metadata?.mapping?.properties as string | undefined
    if (!propertiesStr?.trim()) return []
    const cols = propertiesStr.split(',').map((s: string) => s.trim()).filter(Boolean)
    const segData = fullRun?.results.find((r: any) => r.name === 'segments')?.data as any
    const segProps: Array<{ property: string; top_values: Array<{ value: string }> }> = segData?.properties ?? []
    return cols.map((col: string) => ({
      property: col,
      values: segProps.find(p => p.property === col)?.top_values.map(v => String(v.value)) ?? [],
    }))
  }, [activeSource, fullRun])
  const datasetMeta = (() => {
    const eng = fullRun?.results.find(r => r.name === 'engagement')?.data as Record<string, any> | undefined
    const series: { date: string }[] = eng?.dau_series ?? []
    if (series.length >= 2) {
      return { from: series[0].date, to: series[series.length - 1].date, days: series.length }
    }
    return { from: DATASET_FROM_DEFAULT, to: DATASET_TO_DEFAULT, days: DATASET_DAYS_DEFAULT }
  })()

  const desc = describeWindow(win, datasetMeta.days)

  function setWin(w: WinState) {
    setWinState(w)
    try { sessionStorage.setItem(WIN_STORAGE_KEY, JSON.stringify(w)) } catch {}
  }

  // Initial full-dataset load (runs once per source_id)
  useEffect(() => {
    if (!source_id) return
    if (getRun(source_id)) { setAnalysisStatus('done'); return }
    setAnalysisStatus('loading')

    function runFresh() {
      return api.analysis.run(source_id!)
        .then(({ data }) => { setRun(source_id!, data as any); setAnalysisStatus('done') })
        .catch(() => setAnalysisStatus('error'))
    }

    api.analysis.get(source_id)
      .then(({ data }) => {
        // If cached result predates chart_specs support, force a fresh run
        const hasChartSpecs = (data as any).results?.some((r: any) => r.chart_specs?.length > 0)
        if (!hasChartSpecs) return runFresh()
        setRun(source_id, data as any)
        setAnalysisStatus('done')
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          runFresh()
        } else {
          setAnalysisStatus('error')
        }
      })
  }, [source_id])

  // Filtered analysis: runs when window or base analysis status changes.
  // Reads store inside the effect to avoid stale closure issues.
  useEffect(() => {
    if (!source_id || analysisStatus !== 'done') return

    const fullRunData = getRun(source_id)
    if (!fullRunData) return

    type AnyData = Record<string, any>
    const engData = fullRunData.results.find(r => r.name === 'engagement')?.data as AnyData | undefined
    const dauSeries: { date: string; dau: number }[] = engData?.dau_series ?? []
    const dauRaw: DauPoint[] = dauSeries.map(d => ({ date: new Date(d.date), dau: d.dau }))

    const dateRange = dauRaw.length > 0 ? winToIso(win, dauRaw) : null
    if (!dateRange) {
      // 'all' preset or no data — use full run directly
      setActiveKey(null)
      setFilteredStatus('idle')
      return
    }

    const key = `${source_id}:${dateRange.start}:${dateRange.end}`

    if (getRun(key)) {
      setActiveKey(key)
      setFilteredStatus('done')
      return
    }

    setActiveKey(null)
    setFilteredStatus('loading')

    api.analysis.get(source_id, dateRange)
      .then(({ data }) => { setRun(key, data as any); setActiveKey(key); setFilteredStatus('done') })
      .catch((err) => {
        if (err?.response?.status === 404) {
          api.analysis.run(source_id, dateRange)
            .then(({ data }) => { setRun(key, data as any); setActiveKey(key); setFilteredStatus('done') })
            .catch(() => setFilteredStatus('error'))
        } else {
          setFilteredStatus('error')
        }
      })
  }, [source_id, win, analysisStatus])

  const isBusy = analysisStatus === 'loading' || filteredStatus === 'loading'

  return (
    <div className="flex-1 flex flex-col">
      {/* Sticky toolbar */}
      <div
        className="sticky z-[5] border-b border-border pb-[14px]"
        style={{ top: 52, background: 'var(--bg)' }}
      >
        <TopProgressBar visible={isBusy} />
        <DatasetHeaderStrip
          analysisStatus={analysisStatus}
          filteredStatus={filteredStatus}
          onExportPage={handleExportPage}
          exportingPage={exportingPage}
        />
        <AnalysisBar
          win={win}
          setWin={setWin}
          desc={desc}
          datasetFrom={datasetMeta.from}
          datasetTo={datasetMeta.to}
          globalFilters={globalFilters}
          onFiltersChange={updateGlobalFilters}
          propertyOptions={propertyOptions}
          annotations={annotations}
          onAddAnnotation={onAddAnnotation}
          onRemoveAnnotation={onRemoveAnnotation}
          bookmarks={bookmarks}
          onSaveBookmark={name => saveBookmark(name, win, globalFilters)}
          onRemoveBookmark={removeBookmark}
          onApplyBookmark={bm => { setWin(bm.win); updateGlobalFilters(bm.filters) }}
        />
      </div>

      {/* Two-column layout */}
      <div
        className="flex-1 w-full mx-auto px-7 py-4 pb-14 min-h-0"
        style={{
          maxWidth: 1320,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 340px',
          gap: 28,
          alignItems: 'flex-start',
        }}
      >
        <MainColumn
          win={win}
          desc={desc}
          analysisStatus={analysisStatus}
          activeKey={activeKey}
          filteredStatus={filteredStatus}
          globalFilters={globalFilters}
          propertyOptions={propertyOptions}
          annotations={annotations}
          containerRef={mainColRef}
        />
        <QASidePanel />
      </div>
    </div>
  )
}
