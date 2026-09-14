import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full max-w-lg" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
