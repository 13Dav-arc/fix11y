/**
 * Zod Validation Guardrails for LLM Semantic Output.
 *
 * Enforces strict semantic constraints to prevent hallucinated tags (e.g. <div-button>),
 * unauthorized attributes, or dangerous script injections (XSS).
 */

import { z } from 'zod';

export const ALLOWED_SEMANTIC_TAGS = ['button', 'a', 'summary', 'input'] as const;
export type AllowedSemanticTag = (typeof ALLOWED_SEMANTIC_TAGS)[number];

export const ALLOWED_ARIA_ROLES = [
  'button',
  'link',
  'menuitem',
  'tab',
  'switch',
  'checkbox',
  'option',
  'status',
  'alert',
] as const;
export type AllowedAriaRole = (typeof ALLOWED_ARIA_ROLES)[number];

// Matches standard aria-* attributes and safe standard HTML attributes
const VALID_ATTRIBUTE_NAME_REGEX = /^(aria-[a-z0-9-]+|role|type|tabindex|title|href)$/i;

export const SemanticFixSchema = z.object({
  newTagName: z.enum(ALLOWED_SEMANTIC_TAGS, {
    errorMap: () => ({
      message: `Invalid newTagName. Allowed semantic tags: ${ALLOWED_SEMANTIC_TAGS.join(', ')}`,
    }),
  }),
  attributesToAdd: z
    .record(z.string(), z.string())
    .default({})
    .superRefine((attrs, ctx) => {
      for (const [key, val] of Object.entries(attrs)) {
        // 1. Check attribute name
        if (!VALID_ATTRIBUTE_NAME_REGEX.test(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Disallowed attribute '${key}'. Allowed: aria-*, role, type, tabindex, title, href`,
            path: [key],
          });
        }

        // 2. If role is specified, validate against ALLOWED_ARIA_ROLES
        if (key.toLowerCase() === 'role') {
          if (!ALLOWED_ARIA_ROLES.includes(val.toLowerCase() as AllowedAriaRole)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Disallowed ARIA role '${val}'. Allowed roles: ${ALLOWED_ARIA_ROLES.join(', ')}`,
              path: [key],
            });
          }
        }

        // 3. Prohibit dangerous javascript: URI protocols in values
        if (/javascript:/i.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Forbidden 'javascript:' protocol detected in attribute value for '${key}'`,
            path: [key],
          });
        }

        // 4. Prohibit script tags in both keys and values
        if (/<script/i.test(val) || /<script/i.test(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Forbidden '<script>' tag detected in attribute '${key}'`,
            path: [key],
          });
        }
      }
    }),
  attributesToRemove: z.array(z.string()).default([]).optional(),
  innerText: z.string().optional(),
  wcagRationale: z
    .string()
    .min(10, 'wcagRationale must be at least 10 characters long')
    .max(300, 'wcagRationale cannot exceed 300 characters'),
});

export type SemanticFixOutput = z.infer<typeof SemanticFixSchema>;

/**
 * Validates untrusted LLM output against the SemanticFixSchema.
 */
export function validateSemanticFix(data: unknown): SemanticFixOutput {
  return SemanticFixSchema.parse(data);
}
