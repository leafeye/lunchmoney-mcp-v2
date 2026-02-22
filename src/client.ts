import createClient from "openapi-fetch";
import type { paths } from "./types.js";

const token = process.env.LUNCHMONEY_TOKEN;

export function assertToken(): void {
  if (!token) {
    console.error(
      "LUNCHMONEY_TOKEN is not set. Pass it as an environment variable."
    );
    process.exit(1);
  }
}

export const api = createClient<paths>({
  baseUrl: "https://api.lunchmoney.dev/v2",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
});

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function handleError(status: number, body: unknown): never {
  const parsed = body as { message?: string; errors?: { errMsg: string }[] };
  const detail =
    parsed?.errors?.map((e) => e.errMsg).join("; ") ?? parsed?.message;

  switch (status) {
    case 401:
      throw new ApiError(
        401,
        "API token invalid or expired. Check LUNCHMONEY_TOKEN."
      );
    case 429:
      throw new ApiError(429, "Rate limit reached. Try again in a moment.");
    case 404:
      throw new ApiError(404, detail ?? "Resource not found.");
    default:
      if (status >= 500) {
        throw new ApiError(
          status,
          "Lunch Money API error. Try again later."
        );
      }
      throw new ApiError(status, detail ?? `Request failed (${status}).`);
  }
}
