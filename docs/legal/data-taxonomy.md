# Data taxonomy

Used to tag each company in the data map with an estimated data profile and sensitivity. Code: [`packages/shared/src/sensitivity.ts`](../../packages/shared/src/sensitivity.ts).

## Three layers

1. **Given**: what you gave (contact, ID).
2. **Observed**: what they recorded (orders, clicks, location, device).
3. **Inferred**: what they derived (interest and credit profiles).

## Sensitivity ladder (low → high)

| Level | Category | Key |
| --- | --- | --- |
| 1 | Contact and identity basics | `contact` |
| 2 | Device / technical | `device` |
| 3 | Behavioural | `behavioural` |
| 4 | Transaction | `transaction` |
| 5 | Location | `location` |
| 6 | Communications / content | `communications` |
| 7 | Financial | `financial` |
| 8 | Government ID (Aadhaar, PAN, KYC video) | `government_id` |
| 9 | Health | `health` |
| 10 | Biometric | `biometric` |
| 11 | Children's data | `children` |
| 12 | Inferred profiles | `inferred_profile` |

A company's sensitivity score is the highest level among its categories.

## By company type

| Type | Risk | Typical data | Erasable? |
| --- | --- | --- | --- |
| Food delivery / e-commerce | Medium | contact, transaction, location | Yes |
| Social media | High | communications, behavioural, inferred; spread across partners | Yes |
| Banks, fintech, brokers | Highest | financial, government ID | **No: must keep KYC** → restrict use |
| Telecoms | High | government ID, location | **No: licence retention** → restrict use |
| Health apps | Very high | health | Partly; medical records rules |
| Travel | High | passport, travel history | Mostly |
| Ed-tech / gaming | High | children's data | Yes |
| Free utility apps | Medium | device, ad-tracking | Yes |

Processors, ad networks, "Sign in with Google" and backups also hold copies.
