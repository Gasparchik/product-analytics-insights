import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { CHART_COLORS, TICK_STYLE, fmtNum, ChartTooltip } from './chartUtils'

export interface LineSeries {
  key: string
  label: string
  color?: string
}

export interface AnnotationMark {
  xValue: string  // formatted x-axis label, e.g. "Apr 13"
  label: string
}

export interface LineChartProps {
  data: Record<string, string | number>[]
  lines: LineSeries[]
  xKey?: string
  formatX?: (v: string) => string
  formatY?: (v: number) => string
  formatTooltip?: (v: number, key: string) => string
  annotations?: AnnotationMark[]
}

export function LineChart({
  data, lines, xKey = 'x', formatX, formatY, formatTooltip, annotations,
}: LineChartProps) {
  const isSingle = lines.length === 1

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
        <defs>
          {lines.map((line, i) => {
            const color = line.color ?? CHART_COLORS[i % CHART_COLORS.length]
            return (
              <linearGradient key={line.key} id={`lg-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            )
          })}
        </defs>
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
          cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1, strokeDasharray: '2 3' }}
        />
        {annotations?.map((a, i) => (
          <ReferenceLine
            key={i}
            x={a.xValue}
            stroke="var(--warning)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{
              value: a.label,
              position: 'insideTopLeft',
              fontSize: 9.5,
              fill: 'var(--warning)',
              fontFamily: 'inherit',
              offset: 4,
            }}
          />
        ))}
        {lines.map((line, i) => {
          const color = line.color ?? CHART_COLORS[i % CHART_COLORS.length]
          return (
            <Area
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.label}
              stroke={color}
              strokeWidth={1.75}
              fill={isSingle ? `url(#lg-${line.key})` : 'transparent'}
              dot={false}
              activeDot={{ r: 3.5, fill: 'var(--bg)', stroke: color, strokeWidth: 1.75 }}
            />
          )
        })}
      </AreaChart>
    </ResponsiveContainer>
  )
}
