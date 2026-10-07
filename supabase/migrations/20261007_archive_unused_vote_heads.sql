-- Legacy/example vote heads are not part of the application defaults.
-- Preserve any referenced historical configuration, but deactivate unreferenced
-- vote heads so a school starts from its own configured categories.
update public.finance_vote_heads v
set status='INACTIVE',
    updated_at=now()
where not exists (
  select 1 from public.fee_structure_items fsi where fsi.vote_head_id=v.id
)
and not exists (
  select 1 from public.student_invoice_items sii where sii.vote_head_id=v.id
)
and not exists (
  select 1 from public.payment_allocations pa where pa.vote_head_id=v.id
);
