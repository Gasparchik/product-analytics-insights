export interface PropertyFilter {
  col: string
  vals: string[]
}

export interface ColumnMapping {
  user_id: string
  timestamp: string
  event_name: string
  properties?: string
  signup_event?: string
  conversion_event?: string
}

export interface SourcePreview {
  source_id?: string
  columns: string[]
  preview_rows: Record<string, unknown>[]
  detected_format: 'amplitude' | 'mixpanel' | 'custom'
  total_rows: number
  mapping?: Partial<ColumnMapping>
  profile?: string
}

export interface Source {
  id: string
  type: string
  name: string
  is_demo?: boolean
  created_at: string
  metadata: {
    columns?: string[]
    detected_format?: string
    total_rows?: number
    preview_rows?: Record<string, unknown>[]
    mapping?: Partial<ColumnMapping>
    [key: string]: unknown
  }
}

export interface Insight {
  id: string
  source_id: string
  type: string
  category: string
  title: string
  description: string
  metrics: { metric_value?: string; metric_label?: string } & Record<string, unknown>
  tags: string[]
  severity: 'low' | 'medium' | 'high'
  created_at: string
}

export interface QuestionToolCall {
  name: string
  inputs: Record<string, unknown>
  output: string
  duration_ms: number
}

export interface ChartSpec {
  chart_type: string
  section?: string
  title: string
  subtitle?: string
  data: unknown
  config: Record<string, unknown>
}

export interface Question {
  id: string
  source_id: string
  text: string
  status: 'processing' | 'completed' | 'error'
  answer_text?: string
  tools_used: QuestionToolCall[]
  charts: ChartSpec[]
  created_at: string
  completed_at?: string
  error?: string
}
