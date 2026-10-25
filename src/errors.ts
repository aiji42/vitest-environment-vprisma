const DOCS_URL = "https://github.com/aiji42/vitest-environment-vprisma/blob/main/docs/errors.md";

/**
 * Stable identifiers for every error thrown by vitest-prisma.
 * Each code has a matching section in `docs/errors.md` (also shipped in the npm package).
 */
export type VPrismaErrorCode =
  | "E_OUTSIDE_TEST"
  | "E_CONCURRENT_TEST"
  | "E_UNSUPPORTED_ON_TEST_CLIENT"
  | "E_INVALID_CLIENT"
  | "E_SAVEPOINT_FAILED";

/** Error thrown by vitest-prisma. Check `code` to branch on the cause. */
export class VPrismaError extends Error {
  override name = "VPrismaError";
  readonly code: VPrismaErrorCode;
  readonly docs: string;

  constructor(code: VPrismaErrorCode, message: string, options?: ErrorOptions) {
    const docs = `${DOCS_URL}#${code.toLowerCase()}`;
    super(`[vitest-prisma:${code}] ${message}\nSee: ${docs}`, options);
    this.code = code;
    this.docs = docs;
  }
}
