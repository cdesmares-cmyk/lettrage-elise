import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { erreur: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erreur: false }

  static getDerivedStateFromError(): State {
    return { erreur: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.erreur) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 p-8 text-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-gray-700">Une erreur est survenue.</p>
            <p className="text-xs text-gray-400 mt-1">Le contenu n'a pas pu s'afficher.</p>
          </div>
          <button
            onClick={() => this.setState({ erreur: false })}
            className="text-xs font-semibold border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-lg transition-colors"
          >
            Réessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
