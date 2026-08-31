// Data binding resolver — converts $ref references to actual values

import type { DataRef, SchemaContext, ValueBinding } from './types';

export function isDataRef(value: any): value is DataRef {
  return value && typeof value === 'object' && '$ref' in value && typeof value.$ref === 'string';
}

export function resolveValue(binding: ValueBinding, context: SchemaContext): any {
  if (!isDataRef(binding)) return binding;
  
  const path = binding.$ref;
  const parts = path.split('.');
  const root = parts[0];
  const key = parts.slice(1).join('.');
  
  let source: Record<string, any> | undefined;
  switch (root) {
    case 'data': source = context.data; break;
    case 'env': source = context.env; break;
    case 'response': source = context.response; break;
    default: return undefined;
  }
  
  if (!source || !key) return source;
  
  return key.split('.').reduce((obj, k) => obj?.[k], source as any);
}

export function resolveBody(body: Record<string, any> | undefined, context: SchemaContext): Record<string, any> | undefined {
  if (!body) return undefined;
  const resolved: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    resolved[key] = resolveValue(value, context);
  }
  return resolved;
}

export function evaluateCondition(field: string, operator: string, value: any, context: SchemaContext): boolean {
  const actual = resolveValue({ $ref: field }, context);
  switch (operator) {
    case 'eq': return actual === value;
    case 'neq': return actual !== value;
    case 'gt': return actual > value;
    case 'lt': return actual < value;
    case 'contains': return Array.isArray(actual) ? actual.includes(value) : String(actual).includes(String(value));
    case 'empty': return !actual || (Array.isArray(actual) && actual.length === 0);
    case 'notEmpty': return !!actual && (!Array.isArray(actual) || actual.length > 0);
    default: return true;
  }
}
