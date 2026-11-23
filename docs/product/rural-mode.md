# Rural mode (social-impact extension)

> "City users need to take back their data. Village users need to stop losing their savings. The same agent does both."

## Research findings

- Home Ministry: cybercrime up to 400% since 2021; rural and semi-urban areas are the new epicentre. Over 70% of cases are financial fraud (phishing, OTP theft, UPI scams, fake investments).
- Digital welfare verification creates openings: scammers impersonate scheme or census officials to take OTPs.
- Small losses can be a lifetime's savings.
- 1 in 5 UPI users faced fraud in 3 years; 51% didn't report it.
- Illegal loan apps use contacts and photos for blackmail; MeitY blocked 87 in July 2026, and more keep appearing.
- About 5 lakh Common Service Centres reach Gram Panchayat level, run by trusted village-level entrepreneurs (VLEs).
- Sanchar Saathi (government) shows all SIMs issued in your name and lets you report unknown ones; Chakshu reports fraud calls and SMS. Available in Hindi and 21 regional languages.

## The shift

Rural users mostly have a phone number, WhatsApp, Aadhaar and a bank account, not many email signups. Their data leaks through **SIMs in their name, loan-app permissions and photocopied documents**.

## Features

| # | Feature | Notes |
| --- | --- | --- |
| 1 | **"Is this a scam?"** on WhatsApp by voice | Forward a message, screenshot or voice note; get a local-language voice reply. The daily hook. |
| 2 | SIM check | Guide through Sanchar Saathi SIM list and Chakshu reporting (guided; no direct API). |
| 3 | Loan-app clean-up | Revoke permissions, send DPDP consent withdrawal, report the app. |
| 4 | After a fraud | Call **1930**, draft the cybercrime.gov.in complaint, give the bank's fraud contact. Speed matters. |
| 5 | Assisted mode | VLEs, bank mitras or SHG leaders help, with the person's consent, nothing stored on the helper's device, and a helper action log. |
| 6 | Family guardian mode | Children in the city get alerts and can approve actions for parents in the village. |

## Design rules

- Voice first, local language, few taps.
- WhatsApp or missed-call line, not a new app.
- **The bot never asks for OTP, PIN or Aadhaar, and says so every time.**
- Works on shared phones and weak networks.

## Scope for the hackathon

Only feature 1 ("Is this a scam?") if time allows. Everything else is future scope.
