SELECT 'students_v2_count=' || count(*)::text FROM public.students_v2;
SELECT 'student_invoices_count=' || count(*)::text FROM public.student_invoices;
SELECT 'student_invoices_amount_total=' || COALESCE(sum(amount), 0)::numeric::text FROM public.student_invoices;
SELECT 'student_invoices_balance_total=' || COALESCE(sum(balance), 0)::numeric::text FROM public.student_invoices;
SELECT 'payments_count=' || count(*)::text FROM public.payments;
SELECT 'payments_amount_total=' || COALESCE(sum(amount), 0)::numeric::text FROM public.payments;
SELECT 'finance_receipts_count=' || count(*)::text FROM public.finance_receipts;
SELECT 'finance_receipts_amount_total=' || COALESCE(sum(amount), 0)::numeric::text FROM public.finance_receipts;
