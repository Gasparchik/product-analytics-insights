import axios from 'axios'
import type { Source, SourcePreview, ColumnMapping, Question, PropertyFilter } from '../types'

const http = axios.create({ baseURL: '/api' })

export const api = {
  health: () => http.get<{ status: string }>('/health'),

  sources: {
    list: () => http.get<Source[]>('/sources/'),
    get: (id: string) => http.get<Source>(`/sources/${id}`),
    delete: (id: string) => http.delete(`/sources/${id}`),
    uploadCsv: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return http.post<{
        source_id: string
        columns: string[]
        preview_rows: Record<string, unknown>[]
        detected_format: 'amplitude' | 'mixpanel' | 'custom'
        total_rows: number
      }>('/sources/upload', form)
    },
    fromDemo: () => http.post<{ source_id: string }>('/sources/from_demo'),
    getPreview: (id: string) => http.get<SourcePreview>(`/sources/${id}/preview`),
    getEventCounts: (id: string, col: string) =>
      http.get<{ col: string; total_rows: number; counts: { name: string; count: number }[] }>(
        `/sources/${id}/event_counts`, { params: { col } }
      ),
    saveMapping: (id: string, mapping: ColumnMapping, profile = 'event_log') =>
      http.post(`/sources/${id}/mapping`, mapping, { params: { profile } }),
  },

  analysis: {
    run: (sourceId: string, params?: { start?: string; end?: string }) =>
      http.post(`/analysis/${sourceId}/run`, undefined, { params }),
    get: (sourceId: string, params?: { start?: string; end?: string }) =>
      http.get(`/analysis/${sourceId}`, { params }),
    getMetrics: (sourceId: string) => http.get(`/analysis/${sourceId}/metrics`),
    getInsights: (sourceId: string) => http.get(`/analysis/${sourceId}/insights`),
    regenerateInsights: (sourceId: string) => http.post(`/analysis/${sourceId}/insights/regenerate`),
    recomputeFunnel: (
      sourceId: string,
      steps: string[],
      windowDays: number,
      params?: { start?: string; end?: string },
      filters?: PropertyFilter[],
    ) =>
      http.post(`/analysis/${sourceId}/funnel`, { steps, window_days: windowDays, filters: filters ?? [] }, { params }),
    computeSection: (
      sourceId: string,
      section: string,
      filters: PropertyFilter[],
      funnelSteps?: string[],
      funnelWindowDays?: number,
      params?: { start?: string; end?: string },
    ) =>
      http.post(`/analysis/${sourceId}/section`, {
        section,
        filters,
        funnel_steps: funnelSteps,
        funnel_window_days: funnelWindowDays ?? 7,
      }, { params }),
  },

  questions: {
    ask: (payload: { source_id: string; text: string }) =>
      http.post<Question>('/questions/', payload),
    get: (id: string) => http.get<Question>(`/questions/${id}`),
    listForSource: (sourceId: string) =>
      http.get<Question[]>(`/questions/source/${sourceId}`),
  },
}
