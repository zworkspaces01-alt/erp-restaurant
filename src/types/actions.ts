/** Uniform return type for every Server Action. */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function fail<T = never>(
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionResult<T> {
  return { success: false, error, fieldErrors };
}
