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
- `PAYMENT_SMS_ALLOWED_SENDERS`: comma-separated exact sender IDs/names as the Android gateway reports them, e.g. `KCB`. Configure the real sender value observed on the phone.

After setting variables, redeploy/restart the Render service.

## Android gateway webhook

Configure the Android SMS-forwarding app to send only messages from the configured KCB sender to:

`POST https://phikila-school-management-system.onrender.com/api/v1/finance/payment-inbox/sms-gateway`

Headers:

```http
Content-Type: application/json
X-Payment-Gateway-Token: <PAYMENT_SMS_GATEWAY_TOKEN>
```

Body:

```json
{
  "sender": "KCB",
  "message": "Ksh 4000.00 sent to KCB account CHEPSEON COMPLEX PRIMARY SCHOOL 8112631#3454 has been received on 07/10/2026 at 01:49 PM. M-PESA Ref UJ7AS90AE4."
}
```

The example sender is illustrative; use the exact sender ID delivered by the phone. Do not include the token in the message body. The webhook is idempotent for repeated delivery of the same reference and returns the existing inbox item for a matching retry.

## Review and posting

1. Open Finance → Payment Inbox (or use the authenticated finance API `GET /api/v1/finance/payment-inbox?status=UNVERIFIED`) and identify the inbox record.
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
