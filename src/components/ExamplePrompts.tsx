import { EXAMPLE_QUESTIONS } from './format'

interface ExamplePromptsProps {
  onPick: (question: string) => void
  disabled: boolean
}

export function ExamplePrompts({ onPick, disabled }: ExamplePromptsProps) {
  return (
    <section className="empty-chat" aria-labelledby="empty-chat-title">
      <h2 id="empty-chat-title">Ask our AI assistant</h2>
      <p className="muted">Ask about products, delivery, payment, returns or warranty. Try one of these:</p>
      <ul className="example-list">
        {EXAMPLE_QUESTIONS.map((question) => (
          <li key={question}>
            <button type="button" className="example-btn" onClick={() => onPick(question)} disabled={disabled}>
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
