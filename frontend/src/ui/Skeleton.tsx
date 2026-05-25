import { cn } from './utils'

export interface SkeletonProps {
  width?: string | number
  height?: string | number
  radius?: number
  className?: string
}

export function Skeleton({ width = '100%', height = 14, radius = 4, className }: SkeletonProps) {
  return (
    <span
      className={cn('block animate-[skeleton_1.6s_linear_infinite]', className)}
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, var(--surface-2) 0%, var(--surface-3) 50%, var(--surface-2) 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  )
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-surface border border-border rounded-lg p-[14px_16px] flex flex-col gap-[10px]', className)}>
      <Skeleton width="40%" height={10} />
      <Skeleton width="55%" height={22} radius={6} />
      <Skeleton width="30%" height={10} />
    </div>
  )
}

export function ChartSkeleton({ height = 200, className }: { height?: number; className?: string }) {
  return (
    <div className={cn('bg-surface border border-border rounded-lg p-4 flex flex-col gap-3', className)}>
      <div className="flex justify-between">
        <Skeleton width={140} height={12} />
        <Skeleton width={80} height={10} />
      </div>
      <div className="flex items-end gap-[6px]" style={{ height }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <Skeleton
            key={i}
            width={`${100 / 16}%`}
            height={20 + ((i * 13) % 70)}
            radius={3}
          />
        ))}
      </div>
    </div>
  )
}
