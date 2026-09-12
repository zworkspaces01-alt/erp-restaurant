"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/types/actions";

interface UseActionOptions<TOutput> {
  successMessage?: string | ((data: TOutput) => string);
  errorMessage?: string;
  onSuccess?: (data: TOutput) => void | Promise<void>;
  onError?: (error: string, fieldErrors?: Record<string, string[]>) => void;
}

/**
 * Wraps a Server Action returning ActionResult<T>:
 * handles pending state, toasts and exposes the last error/fieldErrors.
 *
 * const { execute, pending, error } = useAction(createIngredient, { successMessage: "Đã lưu" });
 * execute(values);
 */
export function useAction<TInput, TOutput>(
  action: (input: TInput) => Promise<ActionResult<TOutput>>,
  options: UseActionOptions<TOutput> = {}
) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | undefined>(undefined);

  const execute = useCallback(
    (input: TInput): Promise<ActionResult<TOutput>> =>
      new Promise((resolve) => {
        setError(null);
        setFieldErrors(undefined);
        startTransition(async () => {
          let result: ActionResult<TOutput>;
          try {
            result = await action(input);
          } catch (e) {
            const message = e instanceof Error ? e.message : "Đã xảy ra lỗi không xác định";
            result = { success: false, error: message };
          }
          if (result.success) {
            const msg =
              typeof options.successMessage === "function"
                ? options.successMessage(result.data)
                : options.successMessage;
            if (msg) toast.success(msg);
            await options.onSuccess?.(result.data);
          } else {
            setError(result.error);
            setFieldErrors(result.fieldErrors);
            toast.error(options.errorMessage ?? result.error);
            options.onError?.(result.error, result.fieldErrors);
          }
          resolve(result);
        });
      }),
    [action, options]
  );

  return { execute, pending, error, fieldErrors };
}
