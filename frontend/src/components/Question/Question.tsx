import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSourceStore } from '../../store/sourceStore'
import { api } from '../../api'
import type { Question as QuestionType } from '../../types'
import { Button, ChartContainer, HBarChart, LineChart } from '../../ui'

// ── Payload types ────────────────────────────────────────────────
interface ToolCall {
  name: string
  inputs: Record<string, string>
  output: string
  duration: string
}

type InlineNode = string | { kind: 'k'; text: string } | { kind: 'mono'; text: string }
interface ParagraphBlock { kind: 'p'; children: InlineNode[] }
interface MarkdownBlock { kind: 'md'; text: string }
type AnswerBlock = ParagraphBlock | MarkdownBlock

interface ChartCfg {
  kind: 'hbar' | 'line'
  title: string
  subtitle: string
  data: { label: string; value: number }[]
  accentIndex: number
  format: (v: number) => string
}

interface QuestionPayload {
  title: string
  askedAt: string
  relatedInsight?: { id: string; title: string; severity: string }
  tools: ToolCall[]
  charts: ChartCfg[]
  answer: AnswerBlock[]
  relatedQuestions?: string[]
}

// ── Static payloads (demo) ───────────────────────────────────────
const PAYLOADS: Record<string, QuestionPayload> = {
  'q-mobile-d3': {
    title: 'Why is mobile D3 retention dropping?',
    askedAt: '2 minutes ago',
    relatedInsight: { id: 'mobile-d3', title: 'Mobile users retention drops 40% after Day 3', severity: 'high' },
    tools: [
      {
        name: 'compare_segments',
        inputs: { by: '"platform"', metric: '"retention_d3"', window: '"last_30d"' },
        output: 'web: 31.2%, ios: 18.4%, android: 17.9% (n = 5,182)',
        duration: '180 ms',
      },
      {
        name: 'find_first_session_drops',
        inputs: { segment: '"platform in [ios, android]"', step: '"first_task_created"', within: '"1h"' },
        output: 'Reached: 38% (ios), 36% (android), 82% (web) — n = 3,210 signups',
        duration: '320 ms',
      },
      {
        name: 'compute_retention_curves',
        inputs: { split_by: '"reached_first_task_in_session_1"', metric: '"daily_retention"', window: '"D0..D9"' },
        output: 'Reached: D3 41%, D7 27%. Did not reach: D3 11%, D7 4%.',
        duration: '210 ms',
      },
    ],
    charts: [
      {
        kind: 'hbar',
        title: 'D3 retention by platform',
        subtitle: 'Mobile retains roughly half as well as web',
        data: [
          { label: 'web',     value: 31.2 },
          { label: 'ios',     value: 18.4 },
          { label: 'android', value: 17.9 },
        ],
        accentIndex: 0,
        format: v => v.toFixed(1) + '%',
      },
      {
        kind: 'hbar',
        title: '% reaching "first task created" in session 1',
        subtitle: 'The gap upstream is bigger than the gap in retention itself',
        data: [
          { label: 'web',     value: 82 },
          { label: 'ios',     value: 38 },
          { label: 'android', value: 36 },
        ],
        accentIndex: 2,
        format: v => v + '%',
      },
    ],
    answer: [
      { kind: 'p', children: [
        'Mobile retention drops early because most mobile signups never reach ',
        { kind: 'mono', text: 'first_task_created' },
        ' in their first session. ',
        { kind: 'k', text: '62%' },
        ' of iOS and Android signups skip that step within the first hour, vs only ',
        { kind: 'k', text: '18%' },
        ' on web.',
      ]},
      { kind: 'p', children: [
        'Mobile users who do reach it retain at ',
        { kind: 'k', text: '41%' },
        ' on D3 — close to the web average. Those who don\'t retain at ',
        { kind: 'k', text: '11%' },
        '. The retention problem is really a first-session activation problem.',
      ]},
      { kind: 'p', children: [
        'Worth a closer look: onboarding friction in the iOS/Android task-creation flow, and whether the empty-state CTA is doing the work it does on web.',
      ]},
    ],
    relatedQuestions: [
      'Which onboarding step takes the longest on mobile?',
      'Did the May 12 release change the mobile first-session funnel?',
      'Which campaigns send the highest-quality mobile signups?',
    ],
  },
  'q-paid-channel': {
    title: 'Which acquisition channel has the lowest conversion this month?',
    askedAt: '12 minutes ago',
    tools: [
      {
        name: 'compute_channel_conversion',
        inputs: { metric: '"signup_rate"', window: '"last_14d"' },
        output: 'organic: 8.7%, referral: 7.1%, direct: 6.0%, google_ads: 4.1% (n = 21,400 sessions)',
        duration: '140 ms',
      },
      {
        name: 'breakdown_by_campaign',
        inputs: { channel: '"google_ads"', metric: '"signup_rate"' },
        output: 'brand-uk: 2.6%, brand-us: 4.7%, retargeting: 5.8% (n = 6,210 sessions)',
        duration: '210 ms',
      },
    ],
    charts: [
      {
        kind: 'hbar',
        title: 'Signup conversion by channel',
        subtitle: 'Google Ads converts at roughly half the rate of organic',
        data: [
          { label: 'organic',    value: 8.7 },
          { label: 'referral',   value: 7.1 },
          { label: 'direct',     value: 6.0 },
          { label: 'google_ads', value: 4.1 },
        ],
        accentIndex: 3,
        format: v => v.toFixed(1) + '%',
      },
    ],
    answer: [
      { kind: 'p', children: [
        { kind: 'k', text: 'Google Ads' },
        ' is the weakest channel right now — ',
        { kind: 'k', text: '4.1%' },
        ' signup rate vs ',
        { kind: 'k', text: '8.7%' },
        ' organic over the last 14 days (n = 6,210 sessions).',
      ]},
      { kind: 'p', children: [
        'The damage is concentrated in one campaign group: ',
        { kind: 'mono', text: 'brand-uk' },
        ' converts at ',
        { kind: 'k', text: '2.6%' },
        ' while ',
        { kind: 'mono', text: 'retargeting' },
        ' is healthier at ',
        { kind: 'k', text: '5.8%' },
        '. Worth pausing brand-uk and re-checking landing-page match.',
      ]},
    ],
    relatedQuestions: [
      'What pages do google_ads sessions land on?',
      'Has brand-uk performance changed week over week?',
    ],
  },
}

function defaultPayload(question: string): QuestionPayload {
  return {
    title: question,
    askedAt: 'just now',
    tools: [
      {
        name: 'plan_investigation',
        inputs: { question: JSON.stringify(question) },
        output: 'Planning… (this is a mockup — the agent would now pick the right tools).',
        duration: '—',
      },
    ],
    charts: [],
    answer: [
      { kind: 'p', children: ['Demo prototype — answers are stubbed for the saved questions. Try one of the recent or related questions to see a full response.'] },
    ],
    relatedQuestions: [],
  }
}

// ── Map API question to payload ──────────────────────────────────
function _fmtValue(v: number, config: Record<string, unknown>): string {
  const fmt = config?.format as string | undefined
  const unit = config?.unit as string | undefined
  if (fmt === 'pct' || unit === '%') return v.toFixed(1) + '%'
  if (fmt === 'int') return Math.round(v).toLocaleString()
  return v.toFixed(2)
}

function mapApiToPayload(q: QuestionType): QuestionPayload {
  const tools: ToolCall[] = (q.tools_used ?? []).map(t => ({
    name: t.name,
    inputs: Object.fromEntries(Object.entries(t.inputs).map(([k, v]) => [k, JSON.stringify(v)])),
    output: t.output,
    duration: `${t.duration_ms} ms`,
  }))

  const charts: ChartCfg[] = (q.charts ?? [])
    .filter(c => c.chart_type === 'hbar' || c.chart_type === 'line')
    .map(c => {
      const config = c.config ?? {}
      const accentIdx = typeof config.accent_index === 'number' ? config.accent_index : 0
      const fmt = (v: number) => _fmtValue(v, config)
      const rows = (c.data as Record<string, unknown>[]) ?? []

      if (c.chart_type === 'line') {
        const yKey = (config.y_key as string) ?? 'value'
        const xKey = (config.x_key as string) ?? 'x'
        return {
          kind: 'line' as const,
          title: c.title,
          subtitle: c.subtitle ?? '',
          data: rows.map(d => ({ label: String(d[xKey] ?? ''), value: Number(d[yKey] ?? 0) })),
          accentIndex: accentIdx,
          format: fmt,
        }
      }

      // hbar
      return {
        kind: 'hbar' as const,
        title: c.title,
        subtitle: c.subtitle ?? '',
        data: rows.map(d => ({ label: String(d.label ?? ''), value: Number(d.value ?? 0) })),
        accentIndex: accentIdx,
        format: fmt,
      }
    })

  // Real agent answers come back as markdown — render as a single MarkdownBlock
  const answerText = q.answer_text ?? ''
  const answer: AnswerBlock[] = answerText
    ? [{ kind: 'md', text: answerText }]
    : [{ kind: 'p', children: ['The agent did not return an answer.'] }]

  return {
    title: q.text,
    askedAt: 'just now',
    tools,
    charts,
    answer,
    relatedQuestions: [],
  }
}

// ── Icons ────────────────────────────────────────────────────────
function BackIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 5H2M4.5 2.5L2 5l2.5 2.5" />
    </svg>
  )
}
function ListIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h7M2 5.5h7M2 8h4" />
    </svg>
  )
}
function SparkleIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <path d="M5 1 L5.8 3.7 L8.5 5 L5.8 6.3 L5 9 L4.2 6.3 L1.5 5 L4.2 3.7 Z" />
    </svg>
  )
}
function ArrowRightSmall() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5h6M5.5 2L8 5l-2.5 3" />
    </svg>
  )
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--fg-subtle)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
      <path d="M2.5 4L5 6.5 7.5 4" />
    </svg>
  )
}
function Dot() {
  return <span className="inline-block w-[3px] h-[3px] rounded-full bg-fg-subtle flex-shrink-0" />
}

// ── Tools accordion ──────────────────────────────────────────────
function ToolsUsed({ tools }: { tools: ToolCall[] }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 cursor-pointer bg-transparent border-0 text-left"
      >
        <div className="flex items-center gap-[10px]">
          <span className="w-[22px] h-[22px] rounded-sm bg-surface-2 text-fg-muted inline-flex items-center justify-center flex-shrink-0">
            <ListIcon />
          </span>
          <span className="text-[13px] font-medium text-fg">Tools used</span>
          <span className="text-[11px] text-fg-muted bg-surface-2 px-[6px] py-[2px] rounded-sm tabular-nums">
            {tools.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-fg-subtle">{open ? 'Hide' : 'Show details'}</span>
          <ChevronIcon open={open} />
        </div>
      </button>

      {!open && (
        <div className="px-4 pb-[14px] flex flex-wrap gap-[6px]">
          {tools.map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-[6px] px-2 py-[3px] bg-surface-2 border border-border rounded-sm font-mono text-[11.5px] text-fg-muted"
            >
              <span className="text-accent">›</span>{t.name}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="border-t border-border">
          {tools.map((t, i) => (
            <div
              key={i}
              className="px-4 py-[14px] flex flex-col gap-[10px]"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] text-fg-subtle tabular-nums w-[18px]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[13px] text-fg">{t.name}</span>
                </div>
                <span className="text-[11px] text-fg-subtle tabular-nums flex-shrink-0">{t.duration}</span>
              </div>
              <div
                className="grid gap-x-3 gap-y-[6px] font-mono text-[12px] text-fg-muted"
                style={{ gridTemplateColumns: '76px 1fr' }}
              >
                <div className="text-fg-subtle">inputs</div>
                <div className="bg-surface-2 border border-border rounded-sm px-[10px] py-[6px] break-words whitespace-pre-wrap">
                  {Object.entries(t.inputs).map(([k, v]) => `${k}=${v}`).join(', ')}
                </div>
                <div className="text-fg-subtle">output</div>
                <div className="bg-surface-2 border border-border rounded-sm px-[10px] py-[6px] break-all whitespace-pre-wrap">
                  {t.output}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Charts ───────────────────────────────────────────────────────
function QuestionChart({ cfg }: { cfg: ChartCfg }) {
  if (cfg.kind === 'line') {
    const lineData = cfg.data.map(d => ({ x: d.label, value: d.value }))
    const height = 200
    return (
      <ChartContainer title={cfg.title} subtitle={cfg.subtitle} height={height}>
        <LineChart data={lineData} lines={[{ key: 'value', label: cfg.title }]} formatY={cfg.format} />
      </ChartContainer>
    )
  }
  const height = Math.max(140, 56 + cfg.data.length * 36)
  return (
    <ChartContainer title={cfg.title} subtitle={cfg.subtitle} height={height}>
      <HBarChart data={cfg.data} accentIndex={cfg.accentIndex} formatValue={cfg.format} />
    </ChartContainer>
  )
}

// ── Answer prose ─────────────────────────────────────────────────
function AnswerSection({ blocks }: { blocks: AnswerBlock[] }) {
  return (
    <section className="bg-surface border border-border rounded-lg px-5 py-[18px]">
      <div className="flex items-center gap-2 mb-[10px]">
        <span
          className="w-[18px] h-[18px] rounded-sm flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}
        >
          <SparkleIcon />
        </span>
        <span className="text-[11px] text-fg-muted">Agent's reading</span>
      </div>
      <div className="flex flex-col gap-3">
        {blocks.map((b, i) =>
          b.kind === 'md' ? <MarkdownBody key={i} text={b.text} /> : <Paragraph key={i} block={b} />
        )}
      </div>
    </section>
  )
}

function Paragraph({ block }: { block: ParagraphBlock }) {
  return (
    <p className="m-0 text-[14px] text-fg leading-[1.65]" style={{ textWrap: 'pretty' } as React.CSSProperties}>
      {block.children.map((c, i) => {
        if (typeof c === 'string') return <span key={i}>{c}</span>
        if (c.kind === 'k') return (
          <span
            key={i}
            className="font-medium tabular-nums rounded-sm px-[5px] py-[1px]"
            style={{ background: 'var(--accent-tint)', color: 'var(--fg)' }}
          >
            {c.text}
          </span>
        )
        if (c.kind === 'mono') return (
          <span
            key={i}
            className="font-mono text-[12.5px] bg-surface-2 border border-border rounded-sm px-[5px] py-[1px]"
          >
            {c.text}
          </span>
        )
        return null
      })}
    </p>
  )
}

function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="text-[14px] text-fg leading-[1.65] markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-[18px] font-semibold text-fg m-0 mt-2 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[16px] font-semibold text-fg m-0 mt-3 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[14px] font-semibold text-fg m-0 mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="m-0 my-2 text-[14px] text-fg leading-[1.65]">{children}</p>,
          ul: ({ children }) => <ul className="my-2 pl-5 list-disc text-[14px] text-fg leading-[1.65]">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 pl-5 list-decimal text-[14px] text-fg leading-[1.65]">{children}</ol>,
          li: ({ children }) => <li className="my-[2px]">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="font-mono text-[12.5px] bg-surface-2 border border-border rounded-sm px-[5px] py-[1px]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 p-3 bg-surface-2 border border-border rounded-md overflow-x-auto text-[12.5px] font-mono leading-[1.5]">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-3 border-0 border-t border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 pl-3 border-l-2 border-border text-fg-muted">{children}</blockquote>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="border-collapse text-[13px] w-full">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-border px-[10px] py-[6px] text-left font-medium text-fg">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-[10px] py-[6px] text-fg tabular-nums">{children}</td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

// ── Loading state ────────────────────────────────────────────────
function ProcessingState({ toolsUsed }: { toolsUsed: ToolCall[] }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="bg-surface border border-border rounded-lg px-5 py-5 flex items-center gap-3">
        <span
          className="w-[18px] h-[18px] rounded-sm flex-shrink-0"
          style={{ background: 'var(--accent-tint)', animation: 'pulse 1.4s ease-in-out infinite' }}
        />
        <span className="text-[14px] text-fg-muted">Agent is analyzing your question…</span>
      </section>
      {toolsUsed.length > 0 && <ToolsUsed tools={toolsUsed} />}
    </div>
  )
}

// ── Follow-up ────────────────────────────────────────────────────
function FollowUp({ onSubmit }: { onSubmit: (q: string) => void }) {
  const [value, setValue] = useState('')
  const [focus, setFocus] = useState(false)
  const submit = () => { const v = value.trim(); if (!v) return; onSubmit(v); setValue('') }
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
        value={value}
        rows={2}
        placeholder="Ask a follow-up — e.g. break this down by country"
        onChange={e => setValue(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
        className="flex-1 px-[14px] pt-3 pb-1 text-[13.5px] text-fg border-none bg-transparent outline-none resize-none leading-[1.5]"
        style={{ fontFamily: 'inherit' }}
      />
      <div className="flex items-center justify-between px-[10px] pb-[10px] pt-[6px]">
        <span className="text-[11px] text-fg-subtle">⌘↵ to ask · the agent will reuse the same dataset</span>
        <Button
          variant="primary"
          size="sm"
          disabled={!value.trim()}
          onClick={submit}
          trailing={<ArrowRightSmall />}
        >
          Ask
        </Button>
      </div>
    </div>
  )
}

// ── Question screen ──────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function Question() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { activeSource, setActiveSource, setActiveQuestionTitle } = useSourceStore()

  const isReal = Boolean(id && UUID_RE.test(id))
  const [apiQuestion, setApiQuestion] = useState<QuestionType | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Derive dashboard source_id from the question itself (more reliable than activeSource,
  // which may be empty on direct navigation / refresh)
  const dashSourceId = apiQuestion?.source_id ?? activeSource?.id ?? null
  const dashPath = dashSourceId ? `/dashboard/${dashSourceId}` : '/upload'
  const questionText = (location.state as { question?: string } | null)?.question

  // Fetch real question and poll if processing
  useEffect(() => {
    if (!isReal || !id) return

    const loadQuestion = async () => {
      try {
        const { data } = await api.questions.get(id)
        setApiQuestion(data)
        if (data.status !== 'processing' && pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      } catch {
        // 404 or error — stop polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }
    }

    loadQuestion()
    pollingRef.current = setInterval(loadQuestion, 1500)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [id, isReal])

  // Rehydrate activeSource from the question's source_id on direct navigation / refresh
  useEffect(() => {
    const sid = apiQuestion?.source_id
    if (!sid || activeSource?.id === sid) return
    api.sources.get(sid)
      .then(({ data }) => setActiveSource(data))
      .catch(() => {})
  }, [apiQuestion?.source_id, activeSource?.id, setActiveSource])

  // Determine payload to render
  let payload: QuestionPayload
  let processing = false

  if (isReal && apiQuestion) {
    if (apiQuestion.status === 'processing') {
      processing = true
      payload = { title: apiQuestion.text, askedAt: 'just now', tools: [], charts: [], answer: [], relatedQuestions: [] }
    } else {
      payload = mapApiToPayload(apiQuestion)
    }
  } else if (!isReal && id && PAYLOADS[id]) {
    payload = PAYLOADS[id]
  } else {
    payload = defaultPayload(questionText ?? 'Untitled question')
  }

  // Expose question title to the layout breadcrumb; clear on unmount
  useEffect(() => {
    setActiveQuestionTitle(payload.title)
    return () => setActiveQuestionTitle(null)
  }, [payload.title, setActiveQuestionTitle])

  function handleRelated(question: string) {
    navigate(`/question/q-rel-${Date.now()}`, { state: { question } })
  }

  function handleFollowUp(question: string) {
    if (activeSource) {
      // Submit as real question if we have a source
      api.questions.ask({ source_id: activeSource.id, text: question })
        .then(({ data }) => navigate(`/question/${data.id}`))
        .catch(() => navigate(`/question/q-fu-${Date.now()}`, { state: { question } }))
    } else {
      navigate(`/question/q-fu-${Date.now()}`, { state: { question } })
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div
        className="w-full mx-auto flex flex-col gap-7 px-7 pt-6 pb-14"
        style={{ maxWidth: 880 }}
      >
        {/* Back */}
        <button
          type="button"
          onClick={() => navigate(dashPath)}
          className="inline-flex items-center gap-[6px] text-[13px] text-fg-muted hover:text-fg transition-colors cursor-pointer bg-transparent border-0 p-0 self-start"
        >
          <BackIcon />
          Back to dashboard
        </button>

        {/* Hero */}
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
            <span>Question</span>
            <Dot />
            <span>{payload.askedAt}</span>
            {payload.relatedInsight && (
              <>
                <Dot />
                <span>
                  From insight:{' '}
                  <span className="text-fg-muted">{payload.relatedInsight.title}</span>
                </span>
              </>
            )}
          </div>
          <h1
            className="text-[26px] font-medium text-fg leading-[1.25] m-0"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            {payload.title}
          </h1>
        </header>

        {/* Content: loading or completed */}
        {processing ? (
          <ProcessingState toolsUsed={payload.tools} />
        ) : (
          <>
            {/* Tools */}
            {payload.tools.length > 0 && <ToolsUsed tools={payload.tools} />}

            {/* Charts */}
            {payload.charts.length > 0 && (
              <div className="flex flex-col gap-3">
                {payload.charts.map((c, i) => <QuestionChart key={i} cfg={c} />)}
              </div>
            )}

            {/* Answer */}
            {payload.answer.length > 0 && <AnswerSection blocks={payload.answer} />}

            {/* Related questions */}
            {payload.relatedQuestions && payload.relatedQuestions.length > 0 && (
              <div className="border-t border-border pt-4">
                <div className="text-[11px] text-fg-subtle mb-2">Related questions</div>
                <div className="flex flex-col gap-[6px]">
                  {payload.relatedQuestions.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleRelated(q)}
                      className="flex items-center gap-2 px-3 py-[10px] text-left text-[13px] text-fg bg-surface border border-border rounded-md cursor-pointer transition-colors duration-[100ms] hover:bg-surface-2"
                    >
                      <span className="text-fg-subtle flex-shrink-0">↗</span>
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up */}
            <FollowUp onSubmit={handleFollowUp} />
          </>
        )}
      </div>
    </div>
  )
}
