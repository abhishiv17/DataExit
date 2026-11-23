# Grievance contact research log

A contact counts as `verified: true` in `companies.csv` only if it was read on the company's **own** page. Third-party listings (complaint sites, aggregators, customer-care directories) never count.

Last checked: 24 Nov 2026. Scope: the 12 demo high-risk companies.

| Company | Directory value | Verified | Source / note |
| --- | --- | --- | --- |
| NoBroker | assist@nobroker.in (Puja, Vertical Head) | ✅ | nobroker.in/privacy §16 "Grievance Officer" |
| CARS24 | privacy@cars24.com | ✅ | cars24.com/privacy-policy |
| BankBazaar | privacy@bankbazaar.com (Grievance Officer Rajesh K M) | ✅ | bankbazaar.com/privacy-policy.html |
| CRED | grievanceofficer@cred.club + grievance form | ✅ | cred.club/legal/other-disclosures |
| Shaadi.com | grievance@peopleinteractive.in (Shairish Shaikh) | ✅ | shaadi.com/customer-relations/faq/tollfree. The address is obfuscated on the page and was decoded from it. A search snippet showed an older name/address, so the live page wins. |
| CaratLane | Privacy rights web form (OneTrust) | ✅ form only | "Exercise Your Rights" link on caratlane.com/privacy-policy |
| Kotak Mahindra Bank | Subject access request web form | ✅ form only | Linked from kotak.bank.in privacy notice. Grievance emails on kotak pages are obfuscated. |
| YES Bank | principal.nodalofficer@yes.bank.in | ❌ | Seen in a search snippet of the bank's complaint page; the page timed out on fetch. Re-check by hand. |
| Paisabazaar | servicehead@paisabazaar.com (Jyotsna Popli, Nodal GRO) | ❌ | Search snippet of the contact page; the site blocks automated fetch (403). Re-check by hand. |
| Yatra | — | ❌ | Policy page timed out. Third-party sites list grievanceofficer@yatra.com and dataprivacy@yatra.com: **unconfirmed, not used**. |
| Zoomcar | — | ❌ | Policy page renders client-side only. A third-party site lists grievance.officer@zoomcar.com: **unconfirmed, not used**. |
| Yulu | — | ❌ | Policy page renders client-side only. |

**Next:** open the ❌ rows in a normal browser and copy the contact from the official page, then set `verified=true`, `source` and `last_checked` in the CSV and run `npm run directory:build && npm run demo:seed`.

Unverified rows never become a draft's recipient. Until verified, test sends go to the sandbox inbox.
