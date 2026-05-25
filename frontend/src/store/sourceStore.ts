import { create } from 'zustand'
import type { Source, SourcePreview, Insight, ColumnMapping } from '../types'

interface SourceState {
  activeSource: Source | null
  preview: SourcePreview | null
  insights: Insight[]
  metrics: Record<string, unknown>
  activeQuestionTitle: string | null
  demoMode: boolean
  setActiveSource: (source: Source | null) => void
  setPreview: (preview: SourcePreview | null) => void
  setInsights: (insights: Insight[]) => void
  setMetrics: (metrics: Record<string, unknown>) => void
  setActiveQuestionTitle: (title: string | null) => void
  setDemoMode: (demoMode: boolean) => void
  reset: () => void
}

export const useSourceStore = create<SourceState>((set) => ({
  activeSource: null,
  preview: null,
  insights: [],
  metrics: {},
  activeQuestionTitle: null,
  demoMode: false,
  setActiveSource: (activeSource) => set({ activeSource }),
  setPreview: (preview) => set({ preview }),
  setInsights: (insights) => set({ insights }),
  setMetrics: (metrics) => set({ metrics }),
  setActiveQuestionTitle: (activeQuestionTitle) => set({ activeQuestionTitle }),
  setDemoMode: (demoMode) => set({ demoMode }),
  reset: () => set({ activeSource: null, preview: null, insights: [], metrics: {}, activeQuestionTitle: null }),
}))
