"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

interface SubmitButtonProps extends ButtonProps {
  pending?: boolean;
  pendingText?: string;
}

/** Submit button with spinner; pass `pending` from useTransition/formState. */
export function SubmitButton({ pending = false, pendingText, children, disabled, ...props }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
