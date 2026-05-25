export interface MiniSparklineProps {
  values: number[]
  width?: number
  height?: number
  color?: string
}

export function MiniSparkline({ values, width = 72, height = 22, color }: MiniSparklineProps) {
  if (values.length < 2) return null

  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1

  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (width - 2) + 1,
    height - 1 - ((v - min) / range) * (height - 2),
  ])

  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(' ')

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path
        d={d}
        fill="none"
        stroke={color ?? 'var(--fg-subtle)'}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
