import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { TICK_STYLE, fmtNum, ChartTooltip } from './chartUtils'

export interface BarChartDataPoint {
  label: string
  value: number
}

export interface BarChartProps {
  data: BarChartDataPoint[]
  // Index of bar to highlight with accent; -1 = all neutral
  accentIndex?: number
  formatY?: (v: number) => string
  formatTooltip?: (v: number) => string
}

export function BarChart({ data, accentIndex = -1, formatY, formatTooltip }: BarChartProps) {
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
          dataKey="label"
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
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
            <ChartTooltip
              {...props}
              formatValue={formatTooltip ? (v: number) => formatTooltip(v) : undefined}
            />
          )}
          cursor={{ fill: 'var(--surface-2)' }}
        />
        <Bar dataKey="value" name="Value" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={i === accentIndex ? 'var(--accent)' : 'var(--border-strong)'}
            />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  )
}
