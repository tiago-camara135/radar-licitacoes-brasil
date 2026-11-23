-- TVC Control: schema for the Neon PostgreSQL project.
-- The production database was provisioned separately; this file documents the schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL,
 full_name text NOT NULL DEFAULT '', currency char(3) NOT NULL DEFAULT 'BRL',
 theme text NOT NULL DEFAULT 'system' CHECK(theme IN ('light','dark','system')),
 password_hash text, last_login_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL, account_type text NOT NULL CHECK(account_type IN ('checking','savings','cash','investment','other')),
 institution text, opening_balance numeric(14,2) NOT NULL DEFAULT 0, color text NOT NULL DEFAULT '#2563EB',
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL CHECK(kind IN ('income','expense')), icon text NOT NULL DEFAULT 'circle',
 color text NOT NULL DEFAULT '#64748B', is_default boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL, brand text, last_four char(4), credit_limit numeric(14,2) NOT NULL DEFAULT 0,
 closing_day smallint CHECK(closing_day BETWEEN 1 AND 31), due_day smallint CHECK(due_day BETWEEN 1 AND 31),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL, category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('income','expense','transfer')), description text NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0), occurred_on date NOT NULL, due_on date,
 status text NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','pending','overdue','cancelled')),
 payment_method text, notes text, is_recurring boolean NOT NULL DEFAULT false,
 transfer_to_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
 card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
 installment_group uuid, installment_number smallint, installment_total smallint,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE, month date NOT NULL,
 limit_amount numeric(14,2) NOT NULL CHECK(limit_amount>=0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,category_id,month)
);
CREATE TABLE IF NOT EXISTS public.recurring_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL, category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
 description text NOT NULL, amount numeric(14,2) NOT NULL CHECK(amount>0),
 kind text NOT NULL CHECK(kind IN ('income','expense')), frequency text NOT NULL CHECK(frequency IN ('weekly','monthly','yearly')),
 next_due date NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
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
CREATE TABLE IF NOT EXISTS public.goals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL, target_amount numeric(14,2) NOT NULL CHECK(target_amount>0),
 current_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(current_amount>=0), target_date date, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_idx ON public.profiles(lower(email));
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id,occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_status_due ON public.transactions(user_id,status,due_on);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON public.budgets(user_id,month);
CREATE INDEX IF NOT EXISTS idx_recurring_user_next_due ON public.recurring_rules(user_id,next_due);
CREATE INDEX IF NOT EXISTS idx_categories_user_kind ON public.categories(user_id,kind);
CREATE INDEX IF NOT EXISTS idx_cards_user ON public.cards(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user_due ON public.calendar_reminders(user_id,due_on) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_account_due ON public.calendar_reminders(account_id,due_on) WHERE status='pending' AND account_id IS NOT NULL;
