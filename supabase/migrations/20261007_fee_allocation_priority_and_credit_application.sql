-- Preserve configured vote-head priority on historical invoice items and
-- record application of previously collected student credits.

alter table public.student_invoice_items
  add column if not exists display_order integer not null default 0;

alter table public.payment_allocations
  drop constraint if exists payment_allocations_allocation_type_check;

alter table public.payment_allocations
  add constraint payment_allocations_allocation_type_check
  check (allocation_type in ('FEE','CREDIT','CREDIT_APPLIED','REVERSAL'));

create or replace function public.post_student_fee_payment(
  p_school_id integer,
  p_student_id bigint,
  p_amount numeric,
  p_payment_method text default 'cash',
  p_reference_number text default null,
  p_notes text default null,
  p_received_by text default null,
  p_invoice_id bigint default null
) returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  v_payment_id bigint;
  v_remaining numeric(14,2) := round(coalesce(p_amount,0),2);
  v_apply numeric(14,2);
  v_invoice record;
  v_item record;
  v_credit record;
  v_allocated numeric(14,2) := 0;
  v_credit_used numeric(14,2) := 0;
  v_carry numeric(14,2) := 0;
  v_invoice_applied numeric(14,2);
  v_credit_invoice_applied numeric(14,2);
  v_credit_remaining numeric(14,2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  insert into public.payments (
    student_id, amount, method, payment_method, reference, reference_number,
    notes, received_by, status, paid_at, school_id
  )
  values (
    p_student_id, v_remaining, coalesce(p_payment_method,'cash'),
    coalesce(p_payment_method,'cash'), p_reference_number, p_reference_number,
    p_notes, p_received_by, 'POSTED', now(), p_school_id
  )
  returning id into v_payment_id;

  update public.payments
  set payment_number = coalesce(payment_number,'PAY-'||v_payment_id)
  where id = v_payment_id;

  for v_invoice in
    select *
    from public.student_invoices
    where school_id=p_school_id
      and student_id=p_student_id
      and balance>0
      and (p_invoice_id is null or id=p_invoice_id)
    order by
      case when academic_year ~ '[0-9]'
        then substring(academic_year from '[0-9]+')::int else 0 end,
      case when term ~ '[0-9]'
        then substring(term from '[0-9]+')::int else 0 end,
      due_date nulls last, created_at, id
    for update
  loop
    v_invoice_applied := 0;
    v_credit_invoice_applied := 0;

    for v_credit in
      select id,balance
      from public.student_fee_credits
      where school_id=p_school_id
        and student_id=p_student_id
        and status='AVAILABLE'
        and balance>0
      order by created_at,id
      for update
    loop
      v_credit_remaining := v_credit.balance;
      exit when v_credit_remaining <= 0;

      if exists (
        select 1 from public.student_invoice_items
        where invoice_id=v_invoice.id and balance>0
      ) then
        for v_item in
          select *
          from public.student_invoice_items
          where invoice_id=v_invoice.id and balance>0
          order by display_order, id
          for update
        loop
          exit when v_credit_remaining<=0;
          v_apply := least(v_credit_remaining, v_item.balance);

          insert into public.payment_allocations(
            school_id,payment_id,invoice_id,invoice_item_id,vote_head_id,
            amount,allocation_type
          )
          values(
            p_school_id,v_payment_id,v_invoice.id,v_item.id,v_item.vote_head_id,
            v_apply,'CREDIT_APPLIED'
          );

          update public.student_invoice_items
          set balance=balance-v_apply
          where id=v_item.id;

          v_credit_remaining := v_credit_remaining-v_apply;
          v_credit_invoice_applied := v_credit_invoice_applied+v_apply;
          v_credit_used := v_credit_used+v_apply;
        end loop;
      else
        v_apply := least(v_credit_remaining,v_invoice.balance);
        if v_apply>0 then
          insert into public.payment_allocations(
            school_id,payment_id,invoice_id,amount,allocation_type
          )
          values(p_school_id,v_payment_id,v_invoice.id,v_apply,'CREDIT_APPLIED');

          v_credit_remaining := v_credit_remaining-v_apply;
          v_credit_invoice_applied := v_credit_invoice_applied+v_apply;
          v_credit_used := v_credit_used+v_apply;
        end if;
      end if;

      update public.student_fee_credits
      set balance=v_credit_remaining,
          status=case when v_credit_remaining<=0 then 'APPLIED' else 'AVAILABLE' end,
          updated_at=now()
      where id=v_credit.id;

      exit when v_credit_remaining<=0;
    end loop;

    if v_remaining>0 then
      if exists (
        select 1 from public.student_invoice_items
        where invoice_id=v_invoice.id and balance>0
      ) then
        for v_item in
          select *
          from public.student_invoice_items
          where invoice_id=v_invoice.id and balance>0
          order by display_order, id
          for update
        loop
          exit when v_remaining<=0;
          v_apply := least(v_remaining, v_item.balance);

          insert into public.payment_allocations(
            school_id,payment_id,invoice_id,invoice_item_id,vote_head_id,
            amount,allocation_type
          )
          values(
            p_school_id,v_payment_id,v_invoice.id,v_item.id,v_item.vote_head_id,
            v_apply,'FEE'
          );

          update public.student_invoice_items
          set balance=balance-v_apply
          where id=v_item.id;

          v_remaining := v_remaining-v_apply;
          v_allocated := v_allocated+v_apply;
          v_invoice_applied := v_invoice_applied+v_apply;
        end loop;
      else
        v_apply := least(v_remaining,v_invoice.balance-v_credit_invoice_applied);
        if v_apply>0 then
          insert into public.payment_allocations(
            school_id,payment_id,invoice_id,amount,allocation_type
          )
          values(p_school_id,v_payment_id,v_invoice.id,v_apply,'FEE');

          v_remaining := v_remaining-v_apply;
          v_allocated := v_allocated+v_apply;
          v_invoice_applied := v_invoice_applied+v_apply;
        end if;
      end if;
    end if;

    if exists(select 1 from public.student_invoice_items where invoice_id=v_invoice.id) then
      update public.student_invoices
      set balance=coalesce((
            select sum(balance) from public.student_invoice_items where invoice_id=v_invoice.id
          ),0),
          status=case when coalesce((
            select sum(balance) from public.student_invoice_items where invoice_id=v_invoice.id
          ),0)<=0 then 'paid' else 'unpaid' end,
          status_new=case when coalesce((
            select sum(balance) from public.student_invoice_items where invoice_id=v_invoice.id
          ),0)<=0 then 'paid' else status_new end,
          updated_at=now()
      where id=v_invoice.id;
    else
      update public.student_invoices
      set balance=greatest(0,balance-v_credit_invoice_applied-v_invoice_applied),
          status=case when greatest(0,balance-v_credit_invoice_applied-v_invoice_applied)<=0 then 'paid' else status end,
          status_new=case when greatest(0,balance-v_credit_invoice_applied-v_invoice_applied)<=0 then 'paid' else status_new end,
          updated_at=now()
      where id=v_invoice.id;
    end if;
  end loop;

  if v_remaining>0 then
    v_carry:=v_remaining;

    insert into public.student_fee_credits(
      school_id,student_id,source_payment_id,amount,balance,status
    )
    values(p_school_id,p_student_id,v_payment_id,v_carry,v_carry,'AVAILABLE');

    insert into public.payment_allocations(
      school_id,payment_id,amount,allocation_type
    )
    values(p_school_id,v_payment_id,v_carry,'CREDIT');
  end if;

  if p_reference_number is not null then
    update public.payment_inbox
    set status='matched',posted_payment_id=v_payment_id,posted_at=now()
    where school_id=p_school_id and external_reference=p_reference_number;
  end if;

  return jsonb_build_object(
    'payment_id',v_payment_id,
    'amount',p_amount,
    'allocated',v_allocated,
    'credit_used',v_credit_used,
    'carried_forward',v_carry
  );
end;
$function$;

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
  if new.reversed or new.journal_id is not null or coalesce(new.amount,0) <= 0 then
    return new;
  end if;

  if exists (
    select 1 from public.finance_journals j
    where j.school_id=new.school_id
      and j.reference='PAYMENT:'||new.id::text
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
  from public.payment_allocations
  where payment_id=new.id and allocation_type='FEE';

  select coalesce(sum(amount),0) into v_credit_created
  from public.payment_allocations
  where payment_id=new.id and allocation_type='CREDIT';

  select coalesce(sum(amount),0) into v_credit_applied
  from public.payment_allocations
  where payment_id=new.id and allocation_type='CREDIT_APPLIED';

  insert into public.finance_journals(
    journal_date,description,reference,status,school_id,journal_number
  )
  values(
    coalesce(new.paid_at::date,new.created_at::date,current_date),
    'Student fee payment '||coalesce(new.payment_number,new.id::text),
    'PAYMENT:'||new.id::text,
    'POSTED',
    new.school_id,
    'PAY-'||new.id::text
  )
  returning id into v_journal;

  insert into public.finance_journal_entries(
    journal_id,account_id,debit,credit,description
  )
  values(v_journal,v_cash,new.amount,0,'Cash / bank received');

  if v_fee_allocated+v_credit_applied > 0 then
    insert into public.finance_journal_entries(
      journal_id,account_id,debit,credit,description
    )
    values(
      v_journal,v_ar,0,v_fee_allocated+v_credit_applied,
      'Student receivable settled'
    );
  end if;

  if v_credit_applied > 0 then
    insert into public.finance_journal_entries(
      journal_id,account_id,debit,credit,description
    )
    values(v_journal,v_deposit,v_credit_applied,0,'Customer credit applied');
  end if;

  if v_credit_created > 0 then
    insert into public.finance_journal_entries(
      journal_id,account_id,debit,credit,description
    )
    values(v_journal,v_deposit,0,v_credit_created,'Unapplied student credit');
  end if;

  if abs(new.amount-v_fee_allocated-v_credit_created)>0.005 then
    raise exception
      'Payment % cash is not fully accounted for: amount %, fee allocated %, credit created %',
      new.id,new.amount,v_fee_allocated,v_credit_created;
  end if;

  update public.payments set journal_id=v_journal where id=new.id;
  return new;
end;
$function$;
