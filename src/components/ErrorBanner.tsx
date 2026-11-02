interface ErrorBannerProps {
  message: string | null
  onDismiss?: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null
  return (
    <div className="banner banner-error" role="alert">
      <span className="banner-text">{message}</span>
      {onDismiss && (
        <button type="button" className="btn btn-ghost btn-small" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}
