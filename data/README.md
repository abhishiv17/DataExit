# data (owned by Person B)

`companies.csv` is the Company Directory dataset. The `company-directory` server loads it at start-up (or from Postgres after `npm run db:seed-directory`).

## Columns

| Column | Required | Format |
| --- | --- | --- |
| `id` | yes | lowercase slug, unique (`hdfc-bank`) |
| `legal_name` | yes | registered entity name |
| `brands` | | `|`-separated brand names (`Zomato|Blinkit`). Brands under one legal entity share one row: that is how duplicates merge. |
| `domains` | yes | `|`-separated sender domains. Subdomains match automatically (`mailer.swiggy.in` → `swiggy.in`). |
| `sms_sender_ids` | | `|`-separated header without prefix/suffix (`HDFCBK`, not `VM-HDFCBK-S`) |
| `grievance_email` | | from the company's own privacy policy or grievance page. **Never guessed.** |
| `data_categories` | | `|`-separated: `contact device behavioural transaction location communications inferred financial gov_id health biometric children`. Empty → sector defaults. |
| `sensitivity` | | `low`, `med` or `high`. Empty → computed from categories. |
| `retention_rule` | | `|`-separated: `RBI_KYC PMLA SEBI TELECOM INSURANCE MEDICAL TAX`. All except `TAX` turn erasure into restrict-use. |
| `sector` | | `ecommerce food_delivery quick_commerce social bank fintech broker insurance telecom health travel edtech gaming utility entertainment government other`. `bank insurance government health` force full review. |
| `grievance_verified` | | `true` once someone checked the contact against the source |
| `grievance_source` | | URL where the contact was found |
| `support_email` | | fallback recipient when there is no grievance email |

The loader logs a warning for unknown categories, sectors or retention rules. Run `npm run directory:check` to validate the file.
