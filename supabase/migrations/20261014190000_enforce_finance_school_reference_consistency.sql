-- Enforce school ownership on finance writes, including calls made with the
-- service-role key. This migration does not backfill or rewrite historical data.
-- Existing rows are left untouched; only new writes and ownership-changing
-- updates are validated.

create or replace function public.enforce_finance_invoice_school_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Re-parenting an invoice after financial rows reference it can silently
  -- move existing balances across tenants. Require a separate reconciliation
  -- workflow instead of allowing an ownership-changing update in place.
  if tg_op = 'UPDATE'
     and (new.school_id is distinct from old.school_id
       or new.student_id is distinct from old.student_id
       or new.fee_structure_id is distinct from old.fee_structure_id)
     and (
       exists (select 1 from public.payments p where p.invoice_id = old.id)
       or exists (select 1 from public.student_invoice_items ii where ii.invoice_id = old.id)
       or exists (
         select 1
         from public.payment_allocations a
         where a.invoice_id = old.id
            or a.invoice_item_id in (
              select ii.id from public.student_invoice_items ii where ii.invoice_id = old.id
            )
       )
     ) then
    raise exception 'Invoice ownership cannot change while dependent finance rows exist';
  end if;

  if new.student_id is null or not exists (
    select 1
    from public.student_enrollments e
    where e.school_id = new.school_id
      and e.student_id = new.student_id
  ) then
    raise exception 'Invoice student must be enrolled in the invoice school';
  end if;

  if new.fee_structure_id is not null and not exists (
    select 1
    from public.fee_structures fs
    where fs.id = new.fee_structure_id
      and fs.school_id = new.school_id
  ) then
    raise exception 'Invoice fee structure must belong to the invoice school';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_finance_invoice_school_scope on public.student_invoices;
create trigger trg_enforce_finance_invoice_school_scope
before insert
on public.student_invoices
for each row execute function public.enforce_finance_invoice_school_scope();
drop trigger if exists trg_enforce_finance_invoice_school_scope_update on public.student_invoices;
create trigger trg_enforce_finance_invoice_school_scope_update
before update of school_id, student_id, fee_structure_id
on public.student_invoices
for each row execute function public.enforce_finance_invoice_school_scope();


create or replace function public.enforce_finance_payment_school_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Do not re-parent a payment with allocations or a receipt. Such changes
  -- require explicit accounting reconciliation rather than a tenant ID edit.
  if tg_op = 'UPDATE'
     and (new.school_id is distinct from old.school_id
       or new.student_id is distinct from old.student_id
       or new.invoice_id is distinct from old.invoice_id)
     and (
       exists (select 1 from public.payment_allocations a where a.payment_id = old.id)
       or exists (select 1 from public.finance_receipts r where r.payment_id = old.id)
     ) then
    raise exception 'Payment ownership cannot change while allocations or receipts exist';
  end if;

  if new.student_id is null or not exists (
    select 1
    from public.student_enrollments e
    where e.school_id = new.school_id
      and e.student_id = new.student_id
  ) then
    raise exception 'Payment student must be enrolled in the payment school';
  end if;

  if new.invoice_id is not null and not exists (
    select 1
    from public.student_invoices i
    where i.id = new.invoice_id
      and i.school_id = new.school_id
      and i.student_id = new.student_id
  ) then
    raise exception 'Payment invoice must belong to the payment student and school';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_finance_payment_school_scope on public.payments;
create trigger trg_enforce_finance_payment_school_scope
before insert
on public.payments
for each row execute function public.enforce_finance_payment_school_scope();
drop trigger if exists trg_enforce_finance_payment_school_scope_update on public.payments;
create trigger trg_enforce_finance_payment_school_scope_update
before update of school_id, student_id, invoice_id
on public.payments
for each row execute function public.enforce_finance_payment_school_scope();


create or replace function public.enforce_payment_allocation_school_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.payments p
    where p.id = new.payment_id and p.school_id = new.school_id
  ) then
    raise exception 'Allocation payment must belong to the allocation school';
  end if;

  if new.invoice_id is not null and not exists (
    select 1
    from public.student_invoices i
    join public.payments p on p.id = new.payment_id
    where i.id = new.invoice_id
      and i.school_id = new.school_id
      and p.school_id = new.school_id
      and i.student_id = p.student_id
  ) then
    raise exception 'Allocation invoice must belong to the payment student and school';
  end if;

  if new.invoice_item_id is not null and not exists (
    select 1 from public.student_invoice_items ii
    where ii.id = new.invoice_item_id
      and ii.school_id = new.school_id
      and ii.invoice_id = new.invoice_id
      and (new.vote_head_id is null or ii.vote_head_id = new.vote_head_id)
  ) then
    raise exception 'Allocation invoice item must belong to the allocation invoice and school';
  end if;

  if new.vote_head_id is not null and not exists (
    select 1 from public.finance_vote_heads vh
    where vh.id = new.vote_head_id and vh.school_id = new.school_id
  ) then
    raise exception 'Allocation vote head must belong to the allocation school';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_payment_allocation_school_scope on public.payment_allocations;
create trigger trg_enforce_payment_allocation_school_scope
before insert
on public.payment_allocations
for each row execute function public.enforce_payment_allocation_school_scope();
drop trigger if exists trg_enforce_payment_allocation_school_scope_update on public.payment_allocations;
create trigger trg_enforce_payment_allocation_school_scope_update
before update of school_id, payment_id, invoice_id, invoice_item_id, vote_head_id
on public.payment_allocations
for each row execute function public.enforce_payment_allocation_school_scope();


create or replace function public.enforce_finance_receipt_school_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.payments p
    where p.id = new.payment_id
      and p.school_id = new.school_id
      and p.student_id = new.student_id
  ) then
    raise exception 'Receipt payment and student must belong to the receipt school';
  end if;
  return new;
end;
$$;

-- Older worker-created schemas may predate the tenant column. The live
-- schema was verified to contain it; this idempotent guard documents the
-- required shape for environments where the migration is replayed.
alter table public.finance_receipts
  add column if not exists school_id integer;

drop trigger if exists trg_enforce_finance_receipt_school_scope on public.finance_receipts;
create trigger trg_enforce_finance_receipt_school_scope
before insert
on public.finance_receipts
for each row execute function public.enforce_finance_receipt_school_scope();
drop trigger if exists trg_enforce_finance_receipt_school_scope_update on public.finance_receipts;
create trigger trg_enforce_finance_receipt_school_scope_update
before update of school_id, payment_id, student_id
on public.finance_receipts
for each row execute function public.enforce_finance_receipt_school_scope();
