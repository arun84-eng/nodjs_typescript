import { GuardrailResult, GuardrailReason } from '../models/types';
import { logger } from '../utils/logger';

// ─── Prompt Injection Patterns ────────────────────────────────────────────────
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous|above|all|prior)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(everything|all|previous|above)/i,
  /you\s+are\s+now\s+(a\s+)?(?!an?\s+assistant)/i,
  /act\s+as\s+(if\s+you\s+are|a\s+)?(?!an?\s+assistant)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /system\s*prompt/i,
  /jailbreak/i,
  /\bDAN\b/,
  /override\s+(your\s+)?(instructions?|rules?|guidelines?)/i,
  /disregard\s+(your\s+)?(instructions?|rules?|guidelines?)/i,
  /do\s+anything\s+now/i,
  /bypass\s+(your\s+)?(safety|filter|restriction)/i,
  /<\s*script[^>]*>/i,
  /\{\{.*\}\}/,  // Template injection
  /\$\{.*\}/,    // JS template injection
];

// ─── Cross-Tenant Probe Patterns ──────────────────────────────────────────────
const CROSS_TENANT_PATTERNS: RegExp[] = [
  /other\s+tenant/i,
  /another\s+tenant/i,
  /different\s+(company|organization|tenant|client)/i,
  /all\s+tenants/i,
  /other\s+(companies|organizations|clients|users)/i,
  /access\s+.{0,30}\s+data\s+from/i,
  /show\s+me\s+.{0,30}\s+(other|another|all)/i,
];

// ─── Out-of-Scope Patterns ────────────────────────────────────────────────────
const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\b(bomb|weapon|explosive|poison|hack|malware|virus)\b/i,
  /how\s+to\s+(kill|harm|hurt|attack|steal)/i,
  /\b(password|credentials|api.?key|secret.?key)\b.{0,30}(for|of|from)/i,
];

// ─── Sanitize Input ────────────────────────────────────────────────────────────
function sanitizeInput(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')          // Strip HTML tags
    .replace(/\{\{.*?\}\}/g, '')      // Remove template syntax
    .replace(/\$\{.*?\}/g, '')        // Remove JS templates
    .trim()
    .slice(0, 2000);                  // Cap length
}

// ─── Main Guardrail Check ─────────────────────────────────────────────────────
export function checkGuardrails(input: string): GuardrailResult {
  const sanitized = sanitizeInput(input);

  // 1. Check prompt injection (test BOTH raw and sanitized input)
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input) || pattern.test(sanitized)) {
      logger.warn('Guardrail triggered: prompt injection', {
        pattern: pattern.toString(),
        input: sanitized.slice(0, 100),
      });
      return {
        blocked: true,
        reason: 'prompt_injection' as GuardrailReason,
        sanitizedInput: sanitized,
      };
    }
  }

  // 2. Check cross-tenant probing
  for (const pattern of CROSS_TENANT_PATTERNS) {
    if (pattern.test(sanitized)) {
      logger.warn('Guardrail triggered: cross-tenant attempt', {
        input: sanitized.slice(0, 100),
      });
      return {
        blocked: true,
        reason: 'cross_tenant_attempt' as GuardrailReason,
        sanitizedInput: sanitized,
      };
    }
  }

  // 3. Check out-of-scope content
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(sanitized)) {
      logger.warn('Guardrail triggered: out of scope', {
        input: sanitized.slice(0, 100),
      });
      return {
        blocked: true,
        reason: 'out_of_scope' as GuardrailReason,
        sanitizedInput: sanitized,
      };
    }
  }

  return { blocked: false, sanitizedInput: sanitized };
}

// ─── Low-Confidence Guardrail ─────────────────────────────────────────────────
export function checkConfidence(confidence: number): GuardrailResult {
  const threshold = 0.3;
  if (confidence < threshold) {
    return {
      blocked: true,
      reason: 'low_confidence' as GuardrailReason,
    };
  }
  return { blocked: false };
}

// ─── Safe fallback responses ──────────────────────────────────────────────────
export function getSafeResponse(reason: GuardrailReason): string {
  const responses: Record<GuardrailReason, string> = {
    prompt_injection:
      "I'm sorry, I can't process that request. Please ask a straightforward question about your documents.",
    cross_tenant_attempt:
      "Access to other organizations' data is not permitted. I can only answer questions about your own documents.",
    out_of_scope:
      "I'm only able to answer questions related to the documents in your knowledge base.",
    low_confidence:
      "I don't have enough relevant information in your knowledge base to answer this question confidently. Please upload more relevant documents or rephrase your question.",
    content_policy:
      "I'm unable to respond to that request as it violates content policy.",
  };
  return responses[reason];
}
