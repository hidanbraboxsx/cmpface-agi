// Shared, browser-safe validation and credit logic.

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function isValidCPF(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export const maskCPF = (v: string) =>
  onlyDigits(v).slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

export const maskPhone = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const maskDate = (v: string) =>
  onlyDigits(v).slice(0, 8).replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})(\d)/, "$1/$2");

// Official ANATEL Brazilian DDDs
const VALID_BRAZILIAN_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24, // RJ
  27, 28, // ES
  31, 32, 33, 34, 35, 37, 38, // MG
  41, 42, 43, 44, 45, 46, // PR
  47, 48, 49, // SC
  51, 53, 54, 55, // RS
  61, // DF
  62, 64, // GO
  63, // TO
  65, 66, // MT
  67, // MS
  68, // AC
  69, // RO
  71, 73, 74, 75, 77, // BA
  79, // SE
  81, 87, // PE
  82, // AL
  83, // PB
  84, // RN
  85, 88, // CE
  86, 89, // PI
  91, 93, 94, // PA
  92, 97, // AM
  95, // RR
  96, // AP
  98, 99, // MA
]);

export const isValidPhone = (v: string) => {
  const d = onlyDigits(v);
  if (d.length !== 11) return false;
  
  const ddd = Number(d.slice(0, 2));
  if (!VALID_BRAZILIAN_DDDS.has(ddd)) return false;

  // Brazilian mobile numbers must start with digit 9
  if (d[2] !== "9") return false;

  // Reject sequence of identical phone numbers like (11) 99999-9999, (11) 91111-1111
  const numberPart = d.slice(2);
  if (/^(\d)\1{8}$/.test(numberPart)) return false;

  return true;
};

const SUSPICIOUS_FAKE_NAMES = new Set([
  "teste", "test", "asdf", "qwerty", "fulano", "ciclano", "beltrano", "anonimo", "usuario", "cliente", "lead", "fake"
]);

export const isValidName = (v: string) => {
  const trimmed = v.trim();
  if (trimmed.length < 5 || trimmed.length > 100) return false;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' ]+$/.test(trimmed)) return false;

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;

  // Each name part must be at least 2 characters (e.g. not "A B")
  if (parts.some((p) => p.length < 2)) return false;

  // Detect suspicious test/fake names
  const lower = trimmed.toLowerCase();
  for (const part of parts) {
    if (SUSPICIOUS_FAKE_NAMES.has(part.toLowerCase())) return false;
  }

  // Reject repetitive character sequences like "aaaa bbbb", "kkkkkk"
  if (/(.)\1{3,}/.test(lower)) return false;

  return true;
};

/** dd/mm/aaaa -> ISO, requiring age 18–110. */
export function parseBirthDate(v: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
  if (isNaN(d.getTime()) || d.getUTCDate() !== Number(dd) || d.getUTCMonth() + 1 !== Number(mm)) return null;
  const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
  if (age < 18 || age > 110) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export const PIX_TYPES = ["cpf", "telefone", "email", "aleatoria"] as const;
export type PixType = (typeof PIX_TYPES)[number];

export function isValidPix(type: PixType, key: string): boolean {
  const k = key.trim();
  switch (type) {
    case "cpf": return isValidCPF(k);
    case "telefone": return isValidPhone(k);
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(k) && k.length <= 120;
    case "aleatoria": return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k);
  }
}

export const isValidAgency = (v: string) => /^\d{4}$/.test(v);
export const isValidAccount = (v: string) => /^\d{4,12}-[\dXx]$/.test(v);
export const maskAccount = (v: string) => {
  const d = v.replace(/[^\dXx]/g, "").slice(0, 13);
  return d.length > 1 ? `${d.slice(0, -1)}-${d.slice(-1)}` : d;
};

export const PROFILES = { aposentado: "Aposentado(a)", pensionista: "Pensionista", ambos: "Aposentado(a) e pensionista" } as const;
export const REASONS = {
  idade: "Aposentadoria por idade",
  contribuicao: "Aposentadoria por tempo de contribuição",
  invalidez: "Aposentadoria por invalidez",
  pensao_morte: "Pensão por morte",
  especial: "Aposentadoria especial",
} as const;
export const DURATIONS = {
  ate1: "Menos de 1 ano",
  "1a3": "De 1 a 3 anos",
  "3a5": "De 3 a 5 anos",
  "5a10": "De 5 a 10 anos",
  mais10: "Mais de 10 anos",
} as const;
export const RANGES = {
  r1: "Até R$ 1.518,00 (salário mínimo)",
  r2: "De R$ 1.518,01 a R$ 2.500,00",
  r3: "De R$ 2.500,01 a R$ 4.000,00",
  r4: "Acima de R$ 4.000,00",
} as const;

export type Profile = keyof typeof PROFILES;
export type Reason = keyof typeof REASONS;
export type Duration = keyof typeof DURATIONS;
export type Range = keyof typeof RANGES;

export const BANKS = [
  "Caixa Econômica Federal", "Banco do Brasil", "Bradesco", "Itaú", "Santander",
  "Nubank", "Banco Inter", "C6 Bank", "Mercado Pago", "PicPay", "Banco Pan", "Sicoob",
] as const;

const DURATION_PTS: Record<Duration, number> = { ate1: 20, "1a3": 70, "3a5": 110, "5a10": 150, mais10: 180 };
const RANGE_PTS: Record<Range, number> = { r1: 40, r2: 90, r3: 130, r4: 160 };
const REASON_PTS: Record<Reason, number> = { idade: 60, contribuicao: 60, especial: 50, pensao_morte: 40, invalidez: 30 };

/** Score 300–950 from benefit history plus a stable account-activity factor derived from the CPF. */
export function computeScore(i: { cpf: string; duration: Duration; range: Range; reason: Reason }): number {
  const d = onlyDigits(i.cpf);
  const activity = d.split("").reduce((a, c, idx) => a + Number(c) * (idx + 3), 0) % 120;
  const s = 400 + DURATION_PTS[i.duration] + RANGE_PTS[i.range] + REASON_PTS[i.reason] + activity;
  return Math.max(300, Math.min(950, s));
}

const RANGE_BASE: Record<Range, number> = { r1: 700, r2: 1100, r3: 1500, r4: 1900 };

/** Available amount in BRL, always between 700 and 2500, in steps of 50. */
export function computeAmount(score: number, range: Range): number {
  const bonus = Math.max(0, score - 500) * 1.4;
  const raw = Math.round((RANGE_BASE[range] + bonus) / 50) * 50;
  return Math.max(700, Math.min(2500, raw));
}

export const scoreLabel = (s: number) =>
  s >= 800 ? "Excelente" : s >= 650 ? "Bom" : s >= 500 ? "Regular" : "Em análise";

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
