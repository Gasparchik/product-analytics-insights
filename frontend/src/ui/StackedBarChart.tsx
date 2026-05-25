import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { TICK_STYLE, fmtNum, ChartTooltip } from './chartUtils'

export interface StackSeries {
  key: string
  label: string
  // When true, uses accent color; otherwise uses surface-3 (neutral fill)
  accent?: boolean
  color?: string
}

export interface StackedBarChartProps {
  data: Record<string, string | number>[]
  stacks: StackSeries[]
  xKey?: string
  formatX?: (v: string) => string
  formatY?: (v: number) => string
  formatTooltip?: (v: number, key: string) => string
}

export function StackedBarChart({
  data, stacks, xKey = 'x', formatX, formatY, formatTooltip,
}: StackedBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RBarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        <XAxis
          dataKey={xKey}
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatX}
          dy={5}
        />
        <YAxis
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatY ?? fmtNum}
          width={32}
        />
        <Tooltip
          content={(props: any) => (
            <ChartTooltip {...props} formatValue={formatTooltip} />
          )}
          cursor={{ fill: 'var(--surface-2)' }}
        />
        {stacks.map((stack, i) => (
          <Bar
            key={stack.key}
            dataKey={stack.key}
            name={stack.label}
            fill={stack.color ?? (stack.accent ? 'var(--accent)' : 'var(--surface-3)')}
            stackId="stack"
            radius={i === stacks.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  )
}
