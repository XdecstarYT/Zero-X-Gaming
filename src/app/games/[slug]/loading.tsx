import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" role="status" aria-label="Loading game">
      <Skeleton className="mb-4 h-4 w-40" />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div>
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="mt-6 h-9 w-64" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    </div>
  );
}
