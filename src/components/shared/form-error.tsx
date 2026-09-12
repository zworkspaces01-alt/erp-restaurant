import { cn } from "@/lib/utils";

/** Inline field error text. Renders nothing when message is empty. */
export function FormError({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return <p className={cn("text-sm text-destructive", className)}>{message}</p>;
}

/** Banner for a server-side (non-field) error returned by a Server Action. */
export function FormServerError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
