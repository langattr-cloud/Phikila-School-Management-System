# KCB / M-PESA SMS payment ingestion

Phikila can receive KCB payment SMS notifications forwarded by an Android SMS-gateway app. The backend does **not** read the phone inbox itself; the phone/gateway must forward messages to the webhook below.

## Safety and posting policy

1. The Android gateway sends the sender and original SMS over HTTPS.
2. The endpoint checks a shared bearer-style token, allowed SMS sender, configured school ID and configured KCB account number.
3. The backend parses the amount, account reference, admission number after `#`, transaction date and M-PESA reference.
4. The original SMS is stored in the payment inbox. A matching student is labelled `UNVERIFIED`; unknown admission numbers are labelled `UNMATCHED`.
5. **Do not post based on SMS alone.** A finance administrator must compare the reference/amount against KCB's trusted transaction record, then call the verification-and-post endpoint with the bank verification reference.
6. Posting creates the existing Phikila payment, invoice allocations, receipt and balanced journal in one database transaction. Multiple invoices are paid oldest first. A duplicate reference is not posted again.
7. Unmatched, unverified, duplicate, and verified-but-unallocated transactions remain auditable. When a verified amount exceeds all current outstanding invoices, it is held for finance review rather than silently discarded or treated as fully allocated.

## Render environment variables

Set these server-side variables on the backend Render service. Never put the token in frontend code or in the Android app's publicly distributed configuration if the gateway supports a secure secret store.

- `PAYMENT_SMS_GATEWAY_TOKEN`: long, random secret shared with the gateway.
- `PAYMENT_SMS_SCHOOL_ID`: numeric Phikila `school_id` for the school using this phone.
- `PAYMENT_SMS_SCHOOL_ACCOUNT`: KCB school account identifier that appears before `#`, e.g. `8112631`.
- `PAYMENT_SMS_ALLOWED_SENDERS`: comma-separated exact sender IDs/names as the Android gateway reports them, e.g. `BANK`. Configure the exact sender value displayed by the Android SMS app; for your described notification, use `BANK` if that is the displayed sender.

After setting variables, redeploy/restart the Render service.

## Android gateway webhook

Configure the Android SMS-forwarding app to send only messages from the configured SMS sender to:

`POST https://phikila-school-management-system.onrender.com/api/v1/finance/payment-inbox/sms-gateway`

Headers:

```http
Content-Type: application/json
X-Payment-Gateway-Token: <PAYMENT_SMS_GATEWAY_TOKEN>
```

Body:

```json
{
  "sender": "BANK",
  "message": "Ksh 4000.00 sent to KCB account CHEPSEON COMPLEX PRIMARY SCHOOL 8112631#3454 has been received on 07/10/2026 at 01:49 PM. M-PESA Ref UJ7AS90AE4."
}
```

The example uses `BANK` based on your description. Confirm it matches the sender label shown in the Android SMS inbox exactly; the message body itself must contain the KCB account notification. Do not include the token in the message body. The webhook is idempotent for repeated delivery of the same reference and returns the existing inbox item for a matching retry.

## Review and posting

1. Open Finance → Payment Matcher → Payment Inbox (or use the authenticated finance API `GET /api/v1/finance/payment-inbox?status=UNVERIFIED`) and identify the inbox record.
2. Verify that the exact reference and amount exist in KCB's trusted transaction record.
3. An administrator calls:

`POST /api/v1/finance/payment-inbox/{inbox_id}/verify-and-post`

with a normal Phikila authenticated admin session and JSON body:

```json
{
  "verification_reference": "KCB transaction/search reference used to confirm the credit",
  "verification_notes": "Confirmed in KCB transaction listing"
}
```

The endpoint returns the inbox item with status `POSTED` on success. It is safe to retry a request for an already-posted item. If the student has no open invoice or the payment exceeds their total outstanding balance, the payment is left in `VERIFIED_UNALLOCATED` for finance review.

## Verification before production use

- Test with a small real payment and confirm it appears once in the inbox.
- Confirm the admission number after `#` maps to the correct student in the correct school.
- Verify that wrong tokens, unknown senders, wrong account numbers, malformed SMS and repeated references are rejected or safely deduplicated.
- Verify the resulting invoice balances, payment allocations, receipt and journal.
- Configure a reconciliation routine to compare all inbox references with KCB statements and investigate missing, reversed or unmatched items.


## Statement reconciliation

A finance administrator can reconcile a KCB statement batch through the authenticated endpoint `POST /api/v1/finance/payment-inbox/reconcile`. Supply a unique statement reference and the transactions exported from the trusted bank statement:

```json
{
  "statement_reference": "KCB-STATEMENT-2026-10-07",
  "transactions": [
    {
      "reference": "UJ7AS90AE4",
      "amount": 4000.00,
      "transaction_date": "2026-10-07T13:49:00+03:00"
    }
  ]
}
```

The response identifies statement references with no SMS, amount mismatches, SMS records absent from the supplied statement, and amount matches. Each outcome is persisted in the audit log and appended to the relevant inbox notes. This is a statement-comparison endpoint, not a direct KCB API integration; the statement data must come from a trusted export. Reconciliation matches are evidence for finance review and do not silently post previously unverified payments.


## Uploading and reconciling KCB statements (CSV, Excel, PDF)

Finance admins can upload a statement from **Finance → Payment Matcher → KCB Bank Statement Reconciliation**. Supported file types are:

- CSV (.csv)
- Excel (.xlsx or .xlsm)
- Text-based PDF (.pdf)

The preview step reads the file and displays the detected transaction reference, credit amount and date. Review this preview before clicking **Reconcile against SMS inbox**. Reconciliation compares references and amounts, reports exceptions, and records an audit trail. Uploading or previewing a statement does not post a student payment.

For accurate matching, use a statement with clear column headings such as Transaction Date, Narration/Reference, and Credit. If the statement only has an Amount column and does not distinguish credits from debits, Phikila rejects it rather than guessing. Debit rows are not treated as receipts. KCB statement narration should contain the actual M-PESA transaction reference (for example, `UJ7AS90AE4`); confirm this in the preview.

PDF support depends on extractable text or tables. Scanned/image-only PDFs are not currently supported by this importer; export those statements from KCB to CSV/Excel or use a text-based PDF. The upload limit is 15 MB. If KCB changes its statement layout and the preview does not identify columns correctly, do not reconcile the file; export to CSV/Excel or request an importer adjustment for that layout.

Reconciliation only compares bank rows against SMS inbox records. It does not silently post unverified payments; use the finance verification-and-post workflow for payment posting.
