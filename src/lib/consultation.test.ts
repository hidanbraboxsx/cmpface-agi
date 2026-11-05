import { describe, expect, it } from 'vitest';
import { canAnalyze, canConfirmIdentity } from './consultation';

const complete = { cpf: '52998224725', profile: 'aposentado' as const, reason: 'idade' as const, duration: 'mais10' as const, range: 'r2' as const, rules: [true, true, true, true] };
describe('consultation requirements', () => {
  it('requires a valid CPF', () => expect(canAnalyze({ ...complete, cpf: '11111111111' })).toBe(false));
  it('requires every profile answer', () => {
    for (const field of ['profile', 'reason', 'duration', 'range'] as const) expect(canAnalyze({ ...complete, [field]: null })).toBe(false);
    expect(canAnalyze(complete)).toBe(true);
  });
  it('requires all four confirmations', () => {
    expect(canAnalyze({ ...complete, rules: [true, true, true, false] })).toBe(false);
    expect(canAnalyze({ ...complete, rules: [] })).toBe(false);
  });
  it('never accepts unverified identity as verified', () => {
    expect(canConfirmIdentity({ verified: false, fullName: 'Nome de exemplo', birthDate: '1960-01-01' })).toBe(false);
    expect(canConfirmIdentity({ verified: true })).toBe(false);
    expect(canConfirmIdentity({ verified: true, fullName: 'Nome de exemplo', birthDate: '1960-01-01' })).toBe(true);
  });
});