import type { ApiErrorCode } from "@react-playground/api";

export class IdeaError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "IdeaError";
  }
}
