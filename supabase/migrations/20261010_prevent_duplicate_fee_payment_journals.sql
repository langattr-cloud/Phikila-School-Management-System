-- Prevent duplicate fee-payment journals from the Python path and deferred payment trigger.
-- Prefer the application-created FEE-<payment id> journal when it already exists.
create or replace function public.post_finance_payment_journal()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_ar bigint;
  v_cash bigint;
  v_deposit bigint;
  v_journal bigint;
  v_method text;
  v_fee_allocated numeric(14,2);
  v_credit_created numeric(14,2);
  v_credit_applied numeric(14,2);
begin
  if new.reversed or coalesce(new.amount,0) <= 0 then
    return new;
  end if;

  select j.id into v_journal
  from public.finance_journals j
  where j.school_id = new.school_id
    and j.journal_number = 'FEE-' || new.id::text
    and j.reference is not distinct from new.reference_number
    and upper(j.status) = 'POSTED'
  order by j.id
  limit 1;

  if v_journal is not null then
    update public.payments set journal_id = v_journal where id = new.id;
    return new;
  end if;

  if new.journal_id is not null then
    return new;
  end if;

  if exists (
    select 1 from public.finance_journals j
    where j.school_id = new.school_id
      and j.reference = 'PAYMENT:' || new.id::text
  ) then
    return new;
  end if;

  v_ar := public.ensure_finance_account(new.school_id,'1100','Student Receivables','ASSET');
  v_deposit := public.ensure_finance_account(new.school_id,'2000','Student Fee Credits / Customer Deposits','LIABILITY');
  v_method := lower(coalesce(new.payment_method,new.method,'cash'));

  if v_method in ('bank','cheque','check') then
    v_cash := public.ensure_finance_account(new.school_id,'1010','Bank','ASSET');
  elsif v_method in ('mpesa','m-pesa','mobile money') then
    v_cash := public.ensure_finance_account(new.school_id,'1020','M-PESA','ASSET');
  else
    v_cash := public.ensure_finance_account(new.school_id,'1000','Cash on Hand','ASSET');
  end if;

  select coalesce(sum(amount),0) into v_fee_allocated
  from public.payment_allocations where payment_id=new.id and allocation_type='FEE';
  select coalesce(sum(amount),0) into v_credit_created
  from public.payment_allocations where payment_id=new.id and allocation_type='CREDIT';
  select coalesce(sum(amount),0) into v_credit_applied
  from public.payment_allocations where payment_id=new.id and allocation_type='CREDIT_APPLIED';

  insert into public.finance_journals(journal_date,description,reference,status,school_id,journal_number)
  values(coalesce(new.paid_at::date,new.created_at::date,current_date),
    'Student fee payment '||coalesce(new.payment_number,new.id::text),
    'PAYMENT:'||new.id::text,'POSTED',new.school_id,'PAY-'||new.id::text)
  returning id into v_journal;

  insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description)
  values(v_journal,v_cash,new.amount,0,'Cash / bank received');

  if v_fee_allocated+v_credit_applied > 0 then
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

  if abs(new.amount-v_fee_allocated-v_credit_created)>0.005 then
    raise exception 'Payment % cash is not fully accounted for: amount %, fee allocated %, credit created %',
      new.id,new.amount,v_fee_allocated,v_credit_created;
  end if;
  update public.payments set journal_id=v_journal where id=new.id;
  return new;
end;
$function$;

-- Canonicalize existing status values; reports also compare case-insensitively.
update public.finance_journals set status='POSTED' where lower(status)='posted';

create unique index if not exists uq_finance_journals_school_number
  on public.finance_journals(school_id, journal_number);
create unique index if not exists uq_payments_school_reference_active
  on public.payments(school_id, lower(reference_number))
  where reference_number is not null and upper(status) <> 'REVERSED';
create unique index if not exists uq_payments_journal_id
  on public.payments(journal_id) where journal_id is not null;
