export default function LoadingSpinner({ text = 'Ładowanie...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400">
      <div className="animate-spin w-6 h-6 border-2 border-finance-green border-t-transparent rounded-full mr-3" />
      {text}
    </div>
  )
}
