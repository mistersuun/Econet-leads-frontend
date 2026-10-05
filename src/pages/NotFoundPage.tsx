import { Link } from 'react-router-dom'
import { EmptyState } from '../components/States'

export default function NotFoundPage() {
  return (
    <div className="page">
      <div className="card">
        <EmptyState title="Page introuvable">
          <Link to="/">Retour au tableau de bord</Link>
        </EmptyState>
      </div>
    </div>
  )
}
