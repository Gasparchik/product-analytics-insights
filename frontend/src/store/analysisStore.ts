import { create } from 'zustand'
import type { Insight } from '../types'

interface AnalyzerResult {
  name: string
  data: Record<string, unknown>
  chart_specs?: Record<string, unknown>[]
  error: string | null
}

interface AnalysisRun {
  id: string
  source_id: string
  status: string
  results: AnalyzerResult[]
  insights?: Insight[]
}

interface AnalysisState {
  runs: Record<string, AnalysisRun>
  setRun: (sourceId: string, run: AnalysisRun) => void
  getRun: (sourceId: string) => AnalysisRun | null
  /** Drop all cached entries whose key matches the source_id (incl. windowed `source_id:start:end`). */
  clearForSource: (sourceId: string) => void
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  runs: {},
  setRun: (sourceId, run) =>
    set(state => ({ runs: { ...state.runs, [sourceId]: run } })),
  getRun: (sourceId) => get().runs[sourceId] ?? null,
  clearForSource: (sourceId) =>
    set(state => ({
      runs: Object.fromEntries(
        Object.entries(state.runs).filter(([k]) => k !== sourceId && !k.startsWith(sourceId + ':'))
      ),
    })),
}))
