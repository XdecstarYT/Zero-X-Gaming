import { GameCardSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6" role="status" aria-label="Loading">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-72 max-w-full" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <GameCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
