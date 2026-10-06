import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { EmptyState, ErrorState, SkeletonRows } from './States'

interface WidgetProps<T> {
  title: string
  hint?: ReactNode
  actions?: ReactNode
  query: UseQueryResult<T>
  isEmpty?: (data: T) => boolean
  emptyTitle?: string
  emptyText?: ReactNode
  skeleton?: ReactNode
  className?: string
  minHeight?: number
  children: (data: T) => ReactNode
}

/** Card with a title and the loading / empty / error / data states of one query. */
export function Widget<T>({
  title,
  hint,
  actions,
  query,
  isEmpty,
  emptyTitle = 'Aucune donnée pour cette période',
  emptyText,
  skeleton,
  className = '',
  minHeight = 240,
  children,
}: WidgetProps<T>) {
  let body: ReactNode
  if (query.isPending) body = skeleton ?? <SkeletonRows rows={6} />
  else if (query.isError) body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  else if (isEmpty?.(query.data)) body = <EmptyState title={emptyTitle}>{emptyText}</EmptyState>
  else body = children(query.data)

  return (
    <section className={`card widget ${className}`} aria-busy={query.isFetching}>
      <header className="widget-head">
        <h2>{title}</h2>
        {hint && <span className="hint">{hint}</span>}
        {actions && <div style={{ marginLeft: 'auto' }}>{actions}</div>}
      </header>
      <div className="widget-body" style={{ minHeight }}>
        {body}
      </div>
    </section>
  )
}
