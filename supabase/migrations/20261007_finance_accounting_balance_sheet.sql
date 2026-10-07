alter table public.finance_vote_heads
  add column if not exists revenue_account_id bigint references public.chart_of_accounts(id);

create index if not exists idx_finance_vote_heads_revenue_account
  on public.finance_vote_heads(revenue_account_id);

create or replace function public.ensure_finance_account(
  p_school_id bigint,
  p_code text,
  p_name text,
  p_account_type text
) returns bigint
language plpgsql
as $$
declare v_id bigint;
begin
  select id into v_id
  from public.chart_of_accounts
  where school_id = p_school_id and code = p_code
  limit 1;
  if v_id is null then
    insert into public.chart_of_accounts(code,name,account_type,school_id,is_active)
    values(p_code,p_name,p_account_type,p_school_id,1)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.post_finance_invoice_journal()
returns trigger language plpgsql as $$
declare
  v_ar bigint; v_default_revenue bigint; v_journal bigint; v_total numeric(14,2);
  v_item record; v_revenue bigint; v_has_items boolean;
begin
  if coalesce(new.amount,0) <= 0 or new.student_id is null then return new; end if;
  if exists (select 1 from public.finance_journals j where j.school_id=new.school_id and j.reference='INVOICE:'||new.id::text) then return new; end if;
  v_ar := public.ensure_finance_account(new.school_id,'1100','Student Receivables','ASSET');
  v_default_revenue := public.ensure_finance_account(new.school_id,'4000','Fee Revenue','REVENUE');
  select exists(select 1 from public.student_invoice_items where invoice_id=new.id) into v_has_items;
  if not v_has_items and new.fee_structure_id is not null then
    insert into public.student_invoice_items(school_id,invoice_id,vote_head_id,description,amount,balance)
    select new.school_id,new.id,fsi.vote_head_id,vh.name,fsi.amount,fsi.amount
    from public.fee_structure_items fsi
    left join public.finance_vote_heads vh on vh.id=fsi.vote_head_id
    where fsi.fee_structure_id=new.fee_structure_id and fsi.school_id=new.school_id
    order by fsi.display_order,fsi.id;
  end if;
  select exists(select 1 from public.student_invoice_items where invoice_id=new.id) into v_has_items;
  if v_has_items then
    select coalesce(sum(amount),0) into v_total from public.student_invoice_items where invoice_id=new.id;
    if abs(v_total-new.amount)>0.005 then
      raise exception 'Invoice % amount % does not match vote-head obligations total %',new.id,new.amount,v_total;
    end if;
  end if;
  insert into public.finance_journals(journal_date,description,reference,status,school_id,journal_number)
  values(coalesce(new.created_at::date,current_date),'Student fee invoice '||coalesce(new.invoice_number,new.id::text),'INVOICE:'||new.id::text,'POSTED',new.school_id,'INV-'||new.id::text)
  returning id into v_journal;
  insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description)
  values(v_journal,v_ar,new.amount,0,'Student receivable');
  if v_has_items then
    for v_item in select sii.vote_head_id,sum(sii.amount)::numeric(14,2) amount from public.student_invoice_items sii where sii.invoice_id=new.id group by sii.vote_head_id loop
      select revenue_account_id into v_revenue from public.finance_vote_heads where id=v_item.vote_head_id;
      v_revenue := coalesce(v_revenue,v_default_revenue);
      insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description)
      values(v_journal,v_revenue,0,v_item.amount,'Fee revenue');
    end loop;
  else
    insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description)
    values(v_journal,v_default_revenue,0,new.amount,'Fee revenue');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_post_finance_invoice_journal on public.student_invoices;
create trigger trg_post_finance_invoice_journal after insert on public.student_invoices
for each row execute function public.post_finance_invoice_journal();

create or replace function public.post_finance_payment_journal()
returns trigger language plpgsql as $$
declare
  v_ar bigint; v_cash bigint; v_deposit bigint; v_journal bigint; v_method text;
  v_allocated numeric(14,2); v_credit_created numeric(14,2);
begin
  if new.reversed or new.journal_id is not null or coalesce(new.amount,0)<=0 then return new; end if;
  if exists (select 1 from public.finance_journals j where j.school_id=new.school_id and j.reference='PAYMENT:'||new.id::text) then return new; end if;
  v_ar := public.ensure_finance_account(new.school_id,'1100','Student Receivables','ASSET');
  v_deposit := public.ensure_finance_account(new.school_id,'2000','Student Fee Credits / Customer Deposits','LIABILITY');
  v_method := lower(coalesce(new.payment_method,new.method,'cash'));
  if v_method in ('bank','cheque','check') then v_cash := public.ensure_finance_account(new.school_id,'1010','Bank','ASSET');
  elsif v_method in ('mpesa','m-pesa','mobile money') then v_cash := public.ensure_finance_account(new.school_id,'1020','M-PESA','ASSET');
  else v_cash := public.ensure_finance_account(new.school_id,'1000','Cash on Hand','ASSET'); end if;
  select coalesce(sum(amount),0) into v_allocated from public.payment_allocations where payment_id=new.id and allocation_type='FEE';
  select coalesce(sum(amount),0) into v_credit_created from public.payment_allocations where payment_id=new.id and allocation_type='CREDIT';
  insert into public.finance_journals(journal_date,description,reference,status,school_id,journal_number)
  values(coalesce(new.paid_at::date,new.created_at::date,current_date),'Student fee payment '||coalesce(new.payment_number,new.id::text),'PAYMENT:'||new.id::text,'POSTED',new.school_id,'PAY-'||new.id::text)
  returning id into v_journal;
  insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description) values(v_journal,v_cash,new.amount,0,'Cash / bank received');
  if v_allocated>0 then
    insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description) values(v_journal,v_ar,0,v_allocated,'Student receivable settled');
  end if;
  if v_credit_created>0 then
    insert into public.finance_journal_entries(journal_id,account_id,debit,credit,description) values(v_journal,v_deposit,0,v_credit_created,'Unapplied student credit');
  end if;
  if abs(new.amount-v_allocated-v_credit_created)>0.005 then
    raise exception 'Payment % is not fully accounted for: amount %, allocated %, credit %',new.id,new.amount,v_allocated,v_credit_created;
  end if;
  update public.payments set journal_id=v_journal where id=new.id;
  return new;
end;
$$;

drop trigger if exists trg_post_finance_payment_journal on public.payments;
create constraint trigger trg_post_finance_payment_journal after insert on public.payments
deferrable initially deferred for each row execute function public.post_finance_payment_journal();

create or replace function public.finance_trial_balance(p_school_id integer)
returns table(account_id bigint,code text,name text,account_type text,debit numeric,credit numeric,balance numeric)
language sql stable as $$
  select coa.id,coa.code,coa.name,coa.account_type,
    coalesce(sum(fje.debit),0)::numeric,coalesce(sum(fje.credit),0)::numeric,
    case when upper(coa.account_type) in ('ASSET','EXPENSE') then (coalesce(sum(fje.debit),0)-coalesce(sum(fje.credit),0))::numeric
    else (coalesce(sum(fje.credit),0)-coalesce(sum(fje.debit),0))::numeric end
  from public.chart_of_accounts coa
  left join public.finance_journal_entries fje on fje.account_id=coa.id
  left join public.finance_journals fj on fj.id=fje.journal_id
  where coa.school_id=p_school_id and coalesce(coa.is_active,1)=1
    and (fje.id is null or (fj.school_id=p_school_id and upper(coalesce(fj.status,''))='POSTED'))
  group by coa.id,coa.code,coa.name,coa.account_type
  having coalesce(sum(fje.debit),0)<>0 or coalesce(sum(fje.credit),0)<>0
  order by coa.code,coa.id
$$;

create or replace function public.finance_balance_sheet(p_school_id integer)
returns json language plpgsql stable as $$
declare v_assets json;v_liabilities json;v_equity json;v_assets_total numeric;v_liabilities_total numeric;v_equity_total numeric;v_revenue numeric;v_expenses numeric;
begin
  select coalesce(json_agg(t order by t.code),'[]'::json),coalesce(sum(t.balance),0) into v_assets,v_assets_total from public.finance_trial_balance(p_school_id)t where upper(t.account_type)='ASSET';
  select coalesce(json_agg(t order by t.code),'[]'::json),coalesce(sum(t.balance),0) into v_liabilities,v_liabilities_total from public.finance_trial_balance(p_school_id)t where upper(t.account_type)='LIABILITY';
  select coalesce(json_agg(t order by t.code),'[]'::json),coalesce(sum(t.balance),0) into v_equity,v_equity_total from public.finance_trial_balance(p_school_id)t where upper(t.account_type)='EQUITY';
  select coalesce(sum(t.balance),0) into v_revenue from public.finance_trial_balance(p_school_id)t where upper(t.account_type)='REVENUE';
  select coalesce(sum(t.balance),0) into v_expenses from public.finance_trial_balance(p_school_id)t where upper(t.account_type)='EXPENSE';
  return json_build_object('assets',v_assets,'liabilities',v_liabilities,'equity',v_equity,'current_surplus_deficit',v_revenue-v_expenses,
    'totals',json_build_object('assets',v_assets_total,'liabilities',v_liabilities_total,'equity',v_equity_total,'net_assets',v_equity_total+v_revenue-v_expenses,
    'liabilities_and_net_assets',v_liabilities_total+v_equity_total+v_revenue-v_expenses,
    'balance_check',v_assets_total-(v_liabilities_total+v_equity_total+v_revenue-v_expenses)));
end;
$$;
