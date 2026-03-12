export default function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-finance-red text-sm">
      {message}
    </div>
  )
}
