# Sources for every number we quote

Checked 24 Nov 2026. If a number appears on the website, in the README, the PPT or the video, it must be in this table. If you can't find a source, don't say it.

## Problem statistics

| Claim (as we say it) | Where we use it | Source | Notes |
| --- | --- | --- | --- |
| **69%** of Indians don't know they can take back consent they gave to a company | Site, README, PPT slide 2, video | PwC India, *How aware and prepared are Indian consumers and businesses to navigate the new era of digital privacy*, Oct 2024 (3,233 consumers, 186 organisations). [PwC press release](https://www.pwc.in/press-releases/2024/only-16-consumers-in-india-understand-the-digital-personal-data-protection-dpdp-act-only-9-indian-organisations-report-a-comprehensive-understanding-of-the-act-pwc-india-survey.html), [Business Standard](https://business-standard.com/industry/news/consumers-express-concern-over-data-breaches-says-pwc-india-survey-124102200854_1.html) | Same survey: only **16%** know about the DPDP Act; **56%** don't know their data rights. A different "69%" in some coverage (feel data is unsafe) is a separate figure. Don't mix them up. |
| **1 in 5** families with a UPI user hit by UPI fraud in the last 3 years; **51%** never complained | Site, README, PPT slide 2, video | LocalCircles, Jun 2025: 32,000+ responses from 365 districts, Mar–Jun 2025. [Business Standard](https://www.business-standard.com/finance/news/upi-transaction-fraud-india-survey-one-in-five-users-hit-localcircles-125062601141_1.html), [LocalCircles](https://www.localcircles.com/a/press/page/upi-fraud-complaint), [NewsMeter](https://newsmeter.in/data-stories/51-percent-of-upi-fraud-victims-never-filed-a-complaint-localcircles-survey-750856) | Base is *families with a UPI user*, not all families. |
| **₹4,058 crore** lost to "digital arrest" scams since 2022 | Site, README, PPT slide 2, video | Government data, 2022 to May 2026: ₹4,057.7 crore, ~2.98 lakh complaints. [The420.in](https://the420.in/digital-arrest-cyber-fraud-losses/) | Earlier official figures it builds on: ₹1,935 crore in 2024 alone ([Inc42](https://inc42.com/buzz/indians-lost-inr-1935-cr-to-digital-arrest-scams-in-2024-govt)) and ₹2,576 crore from 2022 to Feb 2025 (Parliament reply). Say "since 2022", never "in 2024". |
| **400%** rise in cybercrime since 2021 | PPT slide 2 only | Home Ministry (as cited in the deck) | **Not re-verified.** Not used on the site. If asked, quote the verified figure instead: ₹22,845 crore lost to cyber fraud in 2024, up 206% on 2023 ([Scroll](https://scroll.in/latest/1084796/indians-lost-rs-22845-crore-to-cyber-fraud-in-2024-a-206-rise-from-previous-year-centre)). |
| "Seniors are the prime targets" | PPT slide 2 only | — | **Not verified.** Removed from the site. Avoid saying it in the pitch. |

## Market size (PPT slide 8)

| Claim | Source | Notes |
| --- | --- | --- |
| 958M internet users, 548M rural | IAMAI–Kantar, Internet in India report 2025 (as cited in the deck) | Not re-checked today. |
| 5.01 lakh Common Service Centres | CSC SPV / MeitY (as cited in the deck) | Not re-checked today. |

## Law and dates

| Claim | Source |
| --- | --- |
| DPDP Rules notified **13 Nov 2025**; most obligations, including data-principal rights, apply **18 months later (13 May 2027)** | [PIB document](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf), [Bar & Bench](https://www.barandbench.com/view-point/meity-notifies-final-digital-personal-data-protection-rules-2025), [Hogan Lovells](https://www.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force-). Some firms count to 14 May 2027; we use 13 May. Rules 1, 2, 17–21 (Data Protection Board) took effect on notification; Rule 4 (Consent Managers) after 1 year. |
| Before 13 May 2027 our requests are **policy-based (courtesy)** requests | Follows from the above. Every template says so. |
| Banks must keep KYC records (RBI KYC Directions, PMLA) | See [../legal/dpdp-act.md](../legal/dpdp-act.md). This is why erase becomes restrict-use for banks. |
| 1930 is the national cyber-fraud helpline; cybercrime.gov.in is the portal; Sanchar Saathi "Chakshu" reports fraud calls/SMS | Government of India (MHA I4C, DoT). Used in `check_scam` replies. |

## Our own numbers (from the code, re-counted 24 Nov 2026)

| Number | How to check |
| --- | --- |
| 5 MCP servers, 23 tools | `servers/*/src/tools.ts` (discovery 3, company-directory 4, request-engine 7, tracker 8, scam-shield 1) |
| 16 automated tests, all passing | `npm test` |
| 290 Indian companies in the directory, 7 verified grievance contacts | `servers/company-directory/data/companies.csv` |
| Demo inbox: 656 messages → 214 companies, 61 unused 3+ years, 12 high-risk and dormant | `npm run demo:seed`; deterministic |

## Competitors (PPT slide 6)

See [../product/competitors.md](../product/competitors.md). Mine and Permission Slip are built on GDPR / US law; truConsent and similar tools serve companies; Sanchar Saathi and Truecaller block and report but don't file data-rights requests.
