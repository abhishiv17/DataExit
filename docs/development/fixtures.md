# Fixture mailbox format

Used offline (`GMAIL_BACKEND=fixture`) and in tests. Person B's seeded demo inbox can also be exported in this format to `demo/seed-inbox/messages.json` for an offline demo.

```json
{
  "user_email": "priya.demo@example.com",
  "messages": [
    {
      "id": "m-swiggy-1",
      "thread_id": "optional, defaults to id",
      "from": "Swiggy <noreply@swiggy.in>",
      "to": "optional, defaults to user_email",
      "subject": "Welcome to Swiggy!",
      "date": "2019-03-10T10:00:00Z",
      "body": "optional; only read for reply classification",
      "list_unsubscribe": true
    }
  ]
}
```

Discovery matches subjects containing the phrases in `SIGNUP_SUBJECT_PHRASES` ([servers/discovery/src/ops.ts](../../servers/discovery/src/ops.ts)). Emails sent by the servers and injected replies are stored in `.data/fixture-mailbox.json`; calendar events in `.data/fixture-calendar.json`. Delete `.data/` to reset.

The test fixtures are in [tests/fixtures](../../tests/fixtures): `inbox.json` and a `companies.csv` with fake `.example` grievance contacts.
