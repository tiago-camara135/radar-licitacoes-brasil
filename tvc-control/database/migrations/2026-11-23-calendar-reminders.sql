-- TVC Control: editable calendar payment reminders
CREATE TABLE IF NOT EXISTS public.calendar_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  description varchar(120) NOT NULL CHECK (char_length(btrim(description)) >= 2),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  notes varchar(500),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user_due
  ON public.calendar_reminders(user_id,due_on) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_account_due
  ON public.calendar_reminders(account_id,due_on)
  WHERE status='pending' AND account_id IS NOT NULL;
