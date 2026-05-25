import { Component, ReactNode, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Upload from './components/Upload/Upload'
import Mapping from './components/Mapping/Mapping'
import Dashboard from './components/Dashboard/Dashboard'
import Question from './components/Question/Question'
import Playground from './pages/Playground'
import { api } from './api'
import { useSourceStore } from './store/sourceStore'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-[15px] font-medium text-fg">Something went wrong</div>
          <div className="text-[13px] text-fg-muted max-w-[400px]">
            {(this.state.error as Error).message}
          </div>
          <button
            className="text-[13px] text-accent cursor-pointer"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function ConfigLoader() {
  const setDemoMode = useSourceStore(s => s.setDemoMode)
  useEffect(() => {
    api.config().then(({ data }) => setDemoMode(data.demo_mode)).catch(() => {})
  }, [])
  return null
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ConfigLoader />
      <ErrorBoundary>
        <Routes>
          <Route path="/playground" element={<Playground />} />
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/mapping/:source_id" element={<Mapping />} />
            <Route path="/dashboard/:source_id" element={<Dashboard />} />
            <Route path="/question/:id" element={<Question />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
