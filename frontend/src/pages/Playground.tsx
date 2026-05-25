import { useState } from 'react'
import {
  Button, Field, TextInput, Textarea, Select, MultiSelect,
  Tag, Switch, ThemeToggle, Segmented, Tabs, Modal, Toast,
  StatCard, InsightCard, DataTable, ChartContainer, EmptyState,
  Skeleton, StatCardSkeleton, ChartSkeleton,
  LineChart, BarChart, HBarChart, StackedBarChart, FunnelChart, CohortHeatmap, ChartLegend,
} from '../ui'

// ── chart sample data ──────────────────────────────────────────
const DAU_DATA = [
  { x: 'May 7',  dau: 3820 }, { x: 'May 8',  dau: 3950 },
  { x: 'May 9',  dau: 3890 }, { x: 'May 10', dau: 4100 },
  { x: 'May 11', dau: 3980 }, { x: 'May 12', dau: 4050 },
  { x: 'May 13', dau: 4200 }, { x: 'May 14', dau: 4180 },
  { x: 'May 15', dau: 4320 }, { x: 'May 16', dau: 4290 },
  { x: 'May 17', dau: 4410 }, { x: 'May 18', dau: 4380 },
  { x: 'May 19', dau: 4520 }, { x: 'May 20', dau: 4283 },
]

const COMPLETIONS = [
  { label: 'Mon', value: 820 }, { label: 'Tue', value: 950 },
  { label: 'Wed', value: 1100 }, { label: 'Thu', value: 1380 },
  { label: 'Fri', value: 980 }, { label: 'Sat', value: 420 },
  { label: 'Sun', value: 310 },
]

const TOP_EVENTS = [
  { label: 'task_viewed',    value: 28430 },
  { label: 'app_opened',     value: 19200 },
  { label: 'task_created',   value: 11820 },
  { label: 'task_completed', value:  9810 },
  { label: 'project_opened', value:  7460 },
]

const NEW_VS_RET = [
  { x: 'W1', returning: 2100, new: 210 },
  { x: 'W2', returning: 2280, new: 230 },
  { x: 'W3', returning: 2150, new: 190 },
  { x: 'W4', returning: 2390, new: 265 },
]

const FUNNEL_STEPS = [
  { label: 'Visited landing', users: 12480 },
  { label: 'Signed up',       users:  3210 },
  { label: 'Created task',    users:  2042 },
  { label: 'Day 3 active',    users:   724 },
  { label: 'Day 7 active',    users:   468 },
]

const COHORTS = [
  { label: 'Week 13', size: 412, values: [412, 173, 128, 111,  99,  86] },
  { label: 'Week 14', size: 488, values: [488, 220, 166, 142, 127, null] },
  { label: 'Week 15', size: 521, values: [521, 250, 188, 162, null, null] },
  { label: 'Week 16', size: 597, values: [597, 239, 179, null, null, null] },
  { label: 'Week 17', size: 642, values: [642, 334, null, null, null, null] },
  { label: 'Week 18', size: 705, values: [705, null, null, null, null, null] },
]
const COHORT_LABELS = ['W0', 'W1', 'W2', 'W3', 'W4', 'W5']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-[11px] font-medium tracking-[0.04em] text-fg-subtle uppercase mb-4 pb-2 border-b border-border">
        {title}
      </h2>
      <div className="flex flex-wrap gap-3 items-start">{children}</div>
    </section>
  )
}

export default function Playground() {
  const [modalOpen, setModalOpen] = useState(false)
  const [switchOn, setSwitchOn] = useState(false)
  const [tab, setTab] = useState('overview')
  const [seg, setSeg] = useState('day')
  const [selected, setSelected] = useState(['retention', 'funnel'])
  const [inputVal, setInputVal] = useState('')

  return (
    <div className="max-w-[900px] mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.3px] text-fg">UI Playground</h1>
          <p className="text-[13px] text-fg-muted mt-1">Step 2 — Core component library</p>
        </div>
        <ThemeToggle />
      </div>

      {/* Buttons */}
      <Section title="Button">
        {(['primary', 'secondary', 'ghost', 'danger'] as const).map(v => (
          ['sm', 'md', 'lg'].map(s => (
            <Button key={`${v}-${s}`} variant={v} size={s as any}>{v} {s}</Button>
          ))
        ))}
        <Button variant="primary" disabled>Disabled</Button>
        <Button variant="primary" leading={<span>+</span>}>With icon</Button>
        <Button variant="secondary" full className="max-w-[200px]">Full width</Button>
      </Section>

      {/* Tags */}
      <Section title="Tag">
        {(['neutral', 'accent', 'danger', 'warning', 'success', 'info', 'outline'] as const).map(tone => (
          <Tag key={tone} tone={tone}>{tone}</Tag>
        ))}
      </Section>

      {/* Inputs */}
      <Section title="TextInput">
        <div className="w-[240px]">
          <TextInput
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            placeholder="Placeholder…"
          />
        </div>
        <div className="w-[240px]">
          <TextInput placeholder="Error state" error />
        </div>
        <div className="w-[240px]">
          <TextInput placeholder="Disabled" disabled />
        </div>
      </Section>

      {/* Field */}
      <Section title="Field">
        <div className="w-[240px]">
          <Field label="User ID column" hint="Select the column that identifies each user.">
            <Select placeholder="— select column —">
              <option value="user_id">user_id</option>
              <option value="uid">uid</option>
            </Select>
          </Field>
        </div>
        <div className="w-[240px]">
          <Field label="Event name" error="This field is required.">
            <TextInput placeholder="event_name" error />
          </Field>
        </div>
      </Section>

      {/* Textarea */}
      <Section title="Textarea">
        <div className="w-[320px]">
          <Textarea placeholder="Ask anything about your data…" rows={3} />
        </div>
      </Section>

      {/* Select */}
      <Section title="Select">
        <div className="w-[200px]">
          <Select placeholder="— select column —">
            <option value="a">user_id</option>
            <option value="b">event_time</option>
          </Select>
        </div>
      </Section>

      {/* MultiSelect */}
      <Section title="MultiSelect">
        <div className="w-[320px]">
          <MultiSelect
            values={selected}
            onRemove={v => setSelected(s => s.filter(x => x !== v))}
            placeholder="Select properties…"
          />
        </div>
        <div className="w-[200px]">
          <MultiSelect values={[]} placeholder="Empty state" />
        </div>
      </Section>

      {/* Switch */}
      <Section title="Switch">
        <div className="flex items-center gap-3">
          <Switch on={switchOn} onChange={setSwitchOn} />
          <span className="text-[13px] text-fg-muted">{switchOn ? 'On' : 'Off'}</span>
        </div>
        <Switch on disabled />
      </Section>

      {/* Segmented */}
      <Section title="Segmented">
        <Segmented
          value={seg}
          onChange={setSeg}
          options={[
            { id: 'day', label: 'Day' },
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
          ]}
        />
        <Segmented
          value="day"
          onChange={() => {}}
          options={[
            { id: 'day', label: 'Day' },
            { id: 'week', label: 'Week', disabled: true },
            { id: 'month', label: 'Month', disabled: true },
          ]}
        />
      </Section>

      {/* Tabs */}
      <Section title="Tabs">
        <div className="w-full">
          <Tabs
            active={tab}
            onChange={setTab}
            items={[
              { id: 'overview', label: 'Overview', count: 4 },
              { id: 'retention', label: 'Retention' },
              { id: 'funnel', label: 'Funnel', count: 0 },
            ]}
          />
        </div>
      </Section>

      {/* Toast */}
      <Section title="Toast">
        <Toast kind="success" title="Analysis complete" description="5 insights were generated." />
        <Toast kind="error" title="Upload failed" description="File exceeds 500 MB limit." onClose={() => {}} />
        <Toast kind="info" title="Mapping auto-detected" description="Amplitude export recognized." />
      </Section>

      {/* StatCard */}
      <Section title="StatCard">
        <div className="grid grid-cols-4 gap-3 w-full">
          <StatCard label="DAU" value="4,283" delta={6.2} deltaDir="up" showDelta trail={[30,28,35,40,38,42,44,41,47,46,48,52,55]} />
          <StatCard label="D7 Retention" value="38%" delta={-4.1} deltaDir="down" showDelta trail={[45,44,43,42,40,39,38,37,38,37,36,38,38]} />
          <StatCard label="MAU" value="21,400" showDelta={false} trail={[180,190,200,195,210,205,215,210,218,214,220,219,214]} />
          <StatCardSkeleton />
        </div>
      </Section>

      {/* InsightCard */}
      <Section title="InsightCard">
        <div className="grid grid-cols-2 gap-3 w-full">
          <InsightCard
            severity="high"
            category="Retention"
            title="D7 retention dropped 8pp week-over-week"
            description="Users who signed up in week 12 return at 30%, down from 38% the prior week. The drop is concentrated in mobile."
            metric={{ value: '30%', label: 'D7 retention, week 12 cohort' }}
            tags={['retention', 'mobile']}
            onInvestigate={() => {}}
          />
          <InsightCard
            severity="medium"
            category="Acquisition"
            title="New user growth slowed in the last 14 days"
            description="New user registrations are down 12% vs the prior period. Returning user counts remain stable."
            tags={['acquisition', 'growth']}
          />
          <InsightCard
            severity="low"
            category="Engagement"
            title="Power users generate 60% of all events"
            description="Top 10% of users by event count drive the majority of activity. This is typical for B2B tools."
            tags={['engagement', 'power-users']}
          />
        </div>
      </Section>

      {/* DataTable */}
      <Section title="DataTable">
        <div className="w-full">
          <DataTable
            columns={[
              { key: 'event', label: 'Event name', mono: true },
              { key: 'count', label: 'Count', align: 'right', numeric: true },
              { key: 'users', label: 'Unique users', align: 'right', numeric: true },
              { key: 'pct', label: '% of total', align: 'right', numeric: true },
            ]}
            rows={[
              { event: 'page_view', count: '18,432', users: '4,201', pct: '36.4%' },
              { event: 'button_click', count: '9,108', users: '3,890', pct: '18.0%' },
              { event: 'form_submit', count: '4,221', users: '2,104', pct: '8.3%' },
              { event: 'first_task_created', count: '1,840', users: '1,840', pct: '3.6%' },
            ]}
            striped
          />
        </div>
      </Section>

      {/* ChartContainer */}
      <Section title="ChartContainer">
        <div className="w-full grid grid-cols-2 gap-3">
          <ChartContainer title="DAU over time" subtitle="Daily active users" height={120}
            action={<Segmented value="day" onChange={() => {}} options={[{id:'day',label:'Day'},{id:'week',label:'Week'},{id:'month',label:'Month'}]} />}
          >
            <div className="w-full h-full flex items-center justify-center text-fg-subtle text-[13px]">
              Chart renders here (Recharts)
            </div>
          </ChartContainer>
          <ChartContainer title="Empty state example" height={120}>
            <EmptyState
              title="No funnel configured"
              description="Set a signup and conversion event in the mapping step to see funnel data."
            />
          </ChartContainer>
        </div>
      </Section>

      {/* Skeleton */}
      <Section title="Skeleton">
        <div className="grid grid-cols-4 gap-3 w-full">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="w-full">
          <ChartSkeleton height={120} />
        </div>
        <div className="flex flex-col gap-2 w-[300px]">
          <Skeleton width="70%" height={12} />
          <Skeleton width="100%" height={10} />
          <Skeleton width="50%" height={10} />
        </div>
      </Section>

      {/* Charts */}
      <Section title="LineChart">
        <div className="w-full">
          <ChartContainer title="Daily active users" subtitle="Last 14 days · 4,283 today" height={200}>
            <LineChart
              data={DAU_DATA}
              lines={[{ key: 'dau', label: 'DAU' }]}
            />
          </ChartContainer>
        </div>
      </Section>

      <Section title="BarChart">
        <div className="w-full">
          <ChartContainer title="Task completions per day" subtitle="Last 7 days · Thursday peak" height={180}>
            <BarChart data={COMPLETIONS} accentIndex={3} />
          </ChartContainer>
        </div>
      </Section>

      <Section title="HBarChart + StackedBarChart">
        <div className="w-full grid grid-cols-2 gap-3">
          <ChartContainer title="Top events" subtitle="Last 30 days · share of all events" height={200}>
            <HBarChart data={TOP_EVENTS} accentIndex={0} />
          </ChartContainer>
          <ChartContainer
            title="New vs returning users"
            subtitle="Last 4 weeks"
            height={200}
            action={<ChartLegend items={[{ label: 'Returning' }, { label: 'New', accent: true }]} />}
          >
            <StackedBarChart
              data={NEW_VS_RET}
              stacks={[
                { key: 'returning', label: 'Returning' },
                { key: 'new', label: 'New', accent: true },
              ]}
            />
          </ChartContainer>
        </div>
      </Section>

      <Section title="FunnelChart">
        <div className="w-full">
          <ChartContainer title="Signup → activation funnel" subtitle="Last 30 days · 12,480 sessions" height={260}>
            <FunnelChart steps={FUNNEL_STEPS} />
          </ChartContainer>
        </div>
      </Section>

      <Section title="CohortHeatmap">
        <div className="w-full">
          <ChartContainer title="Weekly retention by signup cohort" subtitle="Week of signup × weeks since signup" height={240}>
            <div className="w-full pt-1">
              <CohortHeatmap rows={COHORTS} weekLabels={COHORT_LABELS} />
            </div>
          </ChartContainer>
        </div>
      </Section>

      {/* Modal */}
      <Section title="Modal">
        <Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Confirm action"
          description="This will delete the dataset and all associated insights."
          body={
            <p className="text-[13px] text-fg-muted leading-normal">
              Once deleted, this action cannot be undone. All questions and analysis results will be permanently removed.
            </p>
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>Delete</Button>
            </>
          }
        />
      </Section>
    </div>
  )
}
