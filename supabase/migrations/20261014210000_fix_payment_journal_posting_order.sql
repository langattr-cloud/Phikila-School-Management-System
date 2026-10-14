-- Fix payment posting order without changing the existing finance workflow.
-- The payment row is inserted before its allocations by post_student_fee_payment.
-- Do not attempt to journal it until the cash allocations account for the full
-- payment; the allocation trigger retries after each allocation insert.

create or replace function public.post_finance_payment_journal_for_payment(
  p_payment_id bigint
)
returns void
language plpgsql
set search_path = public
as $function$
declare
  v_payment public.payments%rowtype;
  v_ar bigint;
  v_cash bigint;
  v_deposit bigint;
  v_journal bigint;
  v_method text;
  v_fee_allocated numeric(14,2);
  v_credit_created numeric(14,2);
  v_credit_applied numeric(14,2);
begin
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found or coalesce(v_payment.reversed,false) or coalesce(v_payment.amount,0) <= 0 then
    return;
  end if;

  -- The Python posting path writes its balanced journal first. Link it rather
  -- than creating a duplicate journal.
  select j.id into v_journal
  from public.finance_journals j
  where j.school_id = v_payment.school_id
    and j.journal_number = 'FEE-' || v_payment.id::text
    and j.reference is not distinct from v_payment.reference_number
    and upper(j.status) = 'POSTED'
  order by j.id
  limit 1;

  if v_journal is not null then
    update public.payments set journal_id = v_journal where id = v_payment.id;
    return;
  end if;

  if v_payment.journal_id is not null then
    return;
  end if;

  select j.id into v_journal
  from public.finance_journals j
  where j.school_id = v_payment.school_id
    and j.reference = 'PAYMENT:' || v_payment.id::text
  order by j.id
  limit 1;

  if v_journal is not null then
    update public.payments set journal_id = v_journal where id = v_payment.id;
    return;
  end if;

  select coalesce(sum(amount),0) into v_fee_allocated
  from public.payment_allocations
  where payment_id = v_payment.id and allocation_type = 'FEE';

  select coalesce(sum(amount),0) into v_credit_created
  from public.payment_allocations
  where payment_id = v_payment.id and allocation_type = 'CREDIT';

  select coalesce(sum(amount),0) into v_credit_applied
  from public.payment_allocations
  where payment_id = v_payment.id and allocation_type = 'CREDIT_APPLIED';

  -- A payment is inserted before its allocations. Waiting here avoids creating
  -- an unbalanced journal on that initial insert. The last allocation retries
  -- this function once the payment amount is fully accounted for.
  if abs(v_payment.amount - v_fee_allocated - v_credit_created) > 0.005 then
    return;
  end if;

  v_ar := public.ensure_finance_account(v_payment.school_id,'1100','Student Receivables','ASSET');
  v_deposit := public.ensure_finance_account(v_payment.school_id,'2000','Student Fee Credits / Customer Deposits','LIABILITY');
  v_method := lower(coalesce(v_payment.payment_method,v_payment.method,'cash'));

  if v_method in ('bank','cheque','check') then
    v_cash := public.ensure_finance_account(v_payment.school_id,'1010','Bank','ASSET');
  elsif v_method in ('mpesa','m-pesa','mobile money') then
    v_cash := public.ensure_finance_account(v_payment.school_id,'1020','M-PESA','ASSET');
  else
    v_cash := public.ensure_finance_account(v_payment.school_id,'1000','Cash on Hand','ASSET');
  end if;

  insert into public.finance_journals(
    journal_date, description, reference, status, school_id, journal_number
  )
  values(
    coalesce(v_payment.paid_at::date,v_payment.created_at::date,current_date),
    'Student fee payment '||coalesce(v_payment.payment_number,v_payment.id::text),
    'PAYMENT:'||v_payment.id::text,
    'POSTED',
    v_payment.school_id,
    'PAY-'||v_payment.id::text
  )
  returning id into v_journal;

  insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description)
  values(v_journal,v_cash,v_payment.amount,0,'Cash / bank received');

  if v_fee_allocated + v_credit_applied > 0 then
    insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description)
    values(v_journal,v_ar,0,v_fee_allocated+v_credit_applied,'Student receivable settled');
  end if;

  if v_credit_applied > 0 then
    insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description)
    values(v_journal,v_deposit,v_credit_applied,0,'Customer credit applied');
  end if;

  if v_credit_created > 0 then
    insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description)
    values(v_journal,v_deposit,0,v_credit_created,'Unapplied student credit');
  end if;

  update public.payments set journal_id = v_journal where id = v_payment.id;

  -- The worker/RPC posting path does not create its receipt in Python. Issue
  -- one here atomically with the journal. The Python path is handled above by
  -- linking its pre-created FEE journal and continues creating its own receipt.
  insert into public.finance_receipts(
    receipt_number, payment_id, student_id, amount, issued_at, school_id, status, issued_by
  )
  select
    'RCPT-' || v_payment.id::text,
    v_payment.id,
    v_payment.student_id,
    v_payment.amount,
    coalesce(v_payment.paid_at, now()),
    v_payment.school_id,
    'ISSUED',
    v_payment.received_by
  where not exists (
    select 1 from public.finance_receipts r
    where r.payment_id = v_payment.id and r.school_id = v_payment.school_id
  )
  on conflict do nothing;
end;
$function$;

-- Preserve the existing AFTER INSERT payment trigger for Python-created payments
-- and route both paths through the same idempotent posting helper.
create or replace function public.post_finance_payment_journal()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  perform public.post_finance_payment_journal_for_payment(new.id);
  return new;
end;
$function$;

create or replace function public.post_finance_payment_journal_after_allocation()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  perform public.post_finance_payment_journal_for_payment(new.payment_id);
  return new;
end;
$function$;

drop trigger if exists trg_post_finance_payment_journal_after_allocation
  on public.payment_allocations;
create trigger trg_post_finance_payment_journal_after_allocation
after insert on public.payment_allocations
for each row
execute function public.post_finance_payment_journal_after_allocation();
