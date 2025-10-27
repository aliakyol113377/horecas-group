export default function SkeletonGrid() {
  return (
    <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="aspect-square rounded-md bg-white/10" />
          <div className="mt-3 h-4 w-3/4 bg-white/10 rounded" />
          <div className="mt-2 h-4 w-1/2 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  )
}
