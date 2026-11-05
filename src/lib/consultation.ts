import { isValidCPF, type Duration, type Profile, type Range, type Reason } from './loan';

export function canAnalyze(input: { cpf: string; profile: Profile | null; reason: Reason | null; duration: Duration | null; range: Range | null; rules: boolean[] }): boolean {
  return isValidCPF(input.cpf) && Boolean(input.profile && input.reason && input.duration && input.range) && input.rules.length === 4 && input.rules.every(Boolean);
}

export function canConfirmIdentity(identity: { verified: boolean; fullName?: string; birthDate?: string }): boolean {
  return identity.verified && Boolean(identity.fullName?.trim() && identity.birthDate);
}