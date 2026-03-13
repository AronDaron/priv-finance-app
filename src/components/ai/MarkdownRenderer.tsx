import ReactMarkdown from 'react-markdown'

interface Props {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: Props) {
  return (
    <div className={`text-gray-200 text-sm leading-relaxed ${className}`}>
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="text-white font-bold text-base mt-4 mb-2 border-b border-gray-700 pb-1">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-white font-semibold text-sm mt-3 mb-1">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-finance-green font-semibold text-sm mt-3 mb-1">{children}</h3>
        ),
        strong: ({ children }) => (
          <strong className="text-white font-semibold">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="text-gray-300 italic">{children}</em>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside my-2 space-y-1 text-gray-300">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside my-2 space-y-1 text-gray-300">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-gray-200 ml-2">{children}</li>
        ),
        p: ({ children }) => (
          <p className="mb-2 text-gray-200">{children}</p>
        ),
        code: ({ children }) => (
          <code className="bg-gray-800 text-finance-green px-1 rounded text-xs font-mono">{children}</code>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-finance-green pl-3 my-2 text-gray-400 italic">{children}</blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  )
}
