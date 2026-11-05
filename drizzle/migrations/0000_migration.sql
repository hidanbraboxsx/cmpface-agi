CREATE TABLE public.loan_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  full_name text NOT NULL,
  cpf text NOT NULL,
  phone text NOT NULL,
  birth_date date NOT NULL,
  profile text NOT NULL,
  benefit_reason text NOT NULL,
  benefit_duration text NOT NULL,
  benefit_range text NOT NULL,
  score integer NOT NULL,
  approved_amount integer NOT NULL,
  other_banks text[] NOT NULL DEFAULT '{}',
  payout_method text NOT NULL,
  pix_key_type text,
  pix_key text,
  bank_name text,
  agency text,
  account text
);
GRANT ALL ON public.loan_inquiries TO service_role;
ALTER TABLE public.loan_inquiries ENABLE ROW LEVEL SECURITY;
CREATE INDEX loan_inquiries_created_idx ON public.loan_inquiries (created_at DESC);