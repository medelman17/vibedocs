/**
 * @fileoverview Validation Gates for NDA Analysis Pipeline
 *
 * Provides validation functions that halt the pipeline on critical failures
 * with user-friendly error messages.
 *
 * This barrel is safe because it only re-exports lightweight validation code
 * (no heavy dependencies like pdf-parse).
 *
 * @module agents/validation
 */

export { validateParserOutput, validateClassifierOutput } from "./gates"
export {
  VALIDATION_MESSAGES,
  formatValidationError,
  type ValidationResult,
} from "./messages"
