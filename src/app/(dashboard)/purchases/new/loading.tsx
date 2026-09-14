import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-44" />
      <Skeleton className="h-72" />
      <Skeleton className="h-40" />
    </div>
  );
}
