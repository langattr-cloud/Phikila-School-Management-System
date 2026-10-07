alter function public.ensure_finance_account(bigint,text,text,text) set search_path = public;
alter function public.post_finance_invoice_journal() set search_path = public;
alter function public.post_finance_payment_journal() set search_path = public;
alter function public.finance_trial_balance(integer) set search_path = public;
alter function public.finance_balance_sheet(integer) set search_path = public;
