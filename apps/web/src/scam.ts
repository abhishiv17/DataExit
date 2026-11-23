// Mock of the check_scam tool (Person A owns the real one; in production the agent reads the
// message and decides). Rules here only drive the demo. Output shape is in docs/contract.md.
// Ground rule 5: every reply says the bot never asks for OTP, PIN or Aadhaar.

export type Verdict = "scam" | "suspicious" | "no_signals";
export interface Bi { hi: string; en: string }
export interface ScamSignal { id: string; label: Bi; strong: boolean }
export interface ScamCheck { verdict: Verdict; signals: ScamSignal[]; summary: Bi; nextSteps: Bi[]; neverAsk: Bi }

export const NEVER_ASK: Bi = {
  hi: "याद रखें: मैं कभी आपका OTP, PIN या आधार नंबर नहीं माँगूँगा।",
  en: "Remember: I will never ask for your OTP, PIN or Aadhaar number.",
};

const SAFE_OTP_NOTICE = /(do not|don't|never)\s+share|किसी (को|से) (भी )?(न|ना|मत)|share (na|mat)/i;

const RULES: Array<{ id: string; re: RegExp; strong: boolean; label: Bi }> = [
  { id: "asks_otp", strong: true, re: /(share|send|tell|बताओ|बताएं|बताएँ|बताइए|भेजें|भेजो|bhejo|batao).{0,40}(otp|pin|ओटीपी|पिन)|(otp|pin|ओटीपी|पिन).{0,40}(share|send|tell|बताओ|बताएं|बताएँ|बताइए|भेजें|भेजो|bhejo|batao)/i,
    label: { hi: "OTP या PIN माँगा जा रहा है", en: "Asks for an OTP or PIN" } },
  { id: "upi_pin_to_receive", strong: true, re: /(scan|स्कैन).{0,40}(qr|क्यूआर)|pin.{0,30}(receive|पाने)|पाने के लिए.{0,30}(पिन|pin)/i,
    label: { hi: "पैसे पाने के लिए QR/PIN — पैसे पाने के लिए कभी PIN नहीं लगता", en: "QR or PIN to receive money. Receiving money never needs a PIN" } },
  { id: "account_block", strong: true, re: /kyc|केवाईसी|(account|खाता).{0,40}(block|blocked|suspend|band|बंद)/i,
    label: { hi: "खाता बंद होने का डर / KYC अपडेट", en: "Threat to block your account / KYC update" } },
  { id: "power_cut", strong: true, re: /(electricity|bijli|बिजली).{0,80}(disconnect|cut|कट|काट)/i,
    label: { hi: "बिजली कटने की धमकी", en: "Threat to cut your electricity" } },
  { id: "prize", strong: true, re: /lottery|lucky draw|you won|winner|prize|इनाम|लॉटरी|kbc|जीत/i,
    label: { hi: "इनाम या लॉटरी का लालच", en: "Prize or lottery bait" } },
  { id: "fee_to_claim", strong: true, re: /(processing|registration|claim).{0,20}fee|शुल्क|फीस/i,
    label: { hi: "पैसा पाने से पहले फीस माँगी", en: "Asks for a fee before paying you" } },
  { id: "authority_threat", strong: true, re: /\bcbi\b|police|पुलिस|customs|narcotics|digital arrest|डिजिटल अरेस्ट|warrant|वारंट/i,
    label: { hi: "पुलिस/CBI बनकर डराना ('डिजिटल अरेस्ट')", en: "Pretends to be police/CBI ('digital arrest')" } },
  { id: "secrecy", strong: true, re: /(do not|don't) tell|किसी को (मत|न) बताना|परिवार को (मत|न)/i,
    label: { hi: "किसी को न बताने को कहा", en: "Tells you to keep it secret" } },
  { id: "easy_money_job", strong: true, re: /part.?time|work from home|like (youtube )?videos|earn.{0,20}daily|रोज़? ?कमाएं|रोज़ ₹/i,
    label: { hi: "घर बैठे आसान कमाई का लालच", en: "Easy work-from-home money" } },
  { id: "instant_loan", strong: true, re: /(loan|लोन).{0,60}(approved|instant|without|बिना|तुरंत)/i,
    label: { hi: "बिना काग़ज़ तुरंत लोन", en: "Instant loan with no documents" } },
  { id: "scheme_bait", strong: true, re: /(pm.?kisan|किसान|ration|राशन|योजना|scheme|subsidy|सब्सिडी).{0,80}(otp|ओटीपी|link|लिंक|fee|शुल्क)/i,
    label: { hi: "सरकारी योजना के नाम पर OTP/लिंक", en: "Government scheme used as bait" } },
  { id: "remote_app", strong: true, re: /anydesk|teamviewer|quicksupport|screen ?share|\.apk/i,
    label: { hi: "ऐप डाउनलोड या स्क्रीन शेयर करवाना", en: "Asks you to install an app or share your screen" } },
  { id: "urgency", strong: false, re: /urgent|immediately|turant|तुरंत|आज रात|today|tonight|24 hours/i,
    label: { hi: "जल्दबाज़ी करवाना", en: "Pushes you to hurry" } },
  { id: "link", strong: false, re: /https?:\/\/|bit\.ly|tinyurl|t\.me\/|www\./i,
    label: { hi: "अनजान लिंक", en: "Unknown link" } },
  { id: "call_number", strong: false, re: /(call|कॉल).{0,40}\d{5}|\d{5}.{0,40}(call|कॉल)/i,
    label: { hi: "किसी नंबर पर कॉल करने को कहा", en: "Asks you to call a number" } },
];

export function checkScam(text: string): ScamCheck {
  const signals = RULES.filter((r) => r.re.test(text))
    .filter((r) => !(r.id === "asks_otp" && SAFE_OTP_NOTICE.test(text)))
    .map(({ id, label, strong }) => ({ id, label, strong }));
  const verdict: Verdict = signals.some((s) => s.strong) ? "scam" : signals.length ? "suspicious" : "no_signals";
  const has = (id: string) => signals.some((s) => s.id === id);

  const summary: Bi =
    verdict === "scam" ? { hi: "यह धोखा (स्कैम) है। इसका जवाब न दें।", en: "This is a scam. Do not respond to it." }
    : verdict === "suspicious" ? { hi: "यह संदिग्ध लगता है। सावधान रहें।", en: "This looks suspicious. Be careful." }
    : { hi: "मुझे इसमें धोखे के संकेत नहीं मिले। फिर भी OTP या PIN किसी को न बताएँ।", en: "I found no scam signs. Still, never share your OTP or PIN." };

  const nextSteps: Bi[] = [];
  if (verdict !== "no_signals") {
    nextSteps.push({ hi: "लिंक न खोलें, जवाब न दें, दिए गए नंबर पर कॉल न करें।", en: "Don't open links, reply, or call the number given." });
    if (has("authority_threat")) nextSteps.push({ hi: "पुलिस या CBI वीडियो कॉल पर गिरफ़्तार नहीं करती। कॉल काट दें और परिवार को बताएँ।", en: "Police and CBI never arrest anyone on a video call. Hang up and tell your family." });
    if (has("upi_pin_to_receive")) nextSteps.push({ hi: "पैसे पाने के लिए कभी QR स्कैन या PIN डालने की ज़रूरत नहीं होती।", en: "You never scan a QR code or enter a PIN to receive money." });
    if (has("account_block")) nextSteps.push({ hi: "शक हो तो अपनी बैंक शाखा जाएँ या कार्ड के पीछे लिखे नंबर पर कॉल करें।", en: "If unsure, visit your branch or call the number on the back of your card." });
    if (has("instant_loan")) nextSteps.push({ hi: "लोन ऐप को फ़ोटो या कॉन्टैक्ट की अनुमति न दें। जाँचें कि ऋणदाता RBI से पंजीकृत है।", en: "Don't give loan apps access to photos or contacts. Check the lender is RBI-registered." });
    nextSteps.push({ hi: "Sanchar Saathi के 'चक्षु' में इस मैसेज/कॉल की शिकायत करें और नंबर ब्लॉक करें।", en: "Report the message or call on Sanchar Saathi's Chakshu and block the number." });
  }
  nextSteps.push({ hi: "पैसे कट गए हों तो तुरंत 1930 पर कॉल करें।", en: "If money was taken, call 1930 right away." });

  return { verdict, signals, summary, nextSteps, neverAsk: NEVER_ASK };
}

export const AFTER_FRAUD: Bi[] = [
  { hi: "अभी 1930 (राष्ट्रीय साइबर अपराध हेल्पलाइन) पर कॉल करें। जितनी जल्दी, पैसा रुकने की उतनी उम्मीद।", en: "Call 1930 (national cybercrime helpline) now. The sooner you call, the better the chance of stopping the money." },
  { hi: "बैंक के फ्रॉड नंबर पर कॉल करके कार्ड/UPI बंद करवाएँ।", en: "Call your bank's fraud line and block your card / UPI." },
  { hi: "cybercrime.gov.in पर शिकायत दर्ज करें। Data Exit शिकायत का मसौदा बना देगा, आप ख़ुद जमा करें।", en: "File a complaint at cybercrime.gov.in. Data Exit drafts it; you submit it yourself." },
  { hi: "मैसेज, कॉल लॉग और भुगतान के स्क्रीनशॉट सँभालकर रखें। कुछ भी डिलीट न करें।", en: "Keep screenshots of messages, call logs and payments. Don't delete anything." },
];

export const SIM_CHECK: Bi[] = [
  { hi: "sancharsaathi.gov.in खोलें या Sanchar Saathi ऐप लें (सरकारी सेवा)।", en: "Open sancharsaathi.gov.in or the Sanchar Saathi app (a government service)." },
  { hi: "'आपके नाम पर मोबाइल कनेक्शन जानें' चुनें और अपना नंबर डालें।", en: "Choose 'Know mobile connections in your name' and enter your number." },
  { hi: "OTP सिर्फ़ उसी सरकारी साइट पर ख़ुद डालें। किसी व्यक्ति को न बताएँ।", en: "Type the OTP only into that government site yourself. Never tell it to a person." },
  { hi: "जो नंबर आपका नहीं है, उस पर 'मेरा नहीं है' चुनकर रिपोर्ट करें।", en: "Mark any number that isn't yours as 'Not mine' to report it." },
];

export const LOAN_APP_CLEANUP: Bi[] = [
  { hi: "फ़ोन की Settings → Apps → लोन ऐप → Permissions में जाकर Contacts, Photos, Camera, SMS बंद करें।", en: "Settings → Apps → the loan app → Permissions: turn off Contacts, Photos, Camera and SMS." },
  { hi: "चल रहा लोन न हो तो ऐप हटा दें। लोन हो तो भुगतान की रसीदें सँभालकर रखें।", en: "No running loan? Uninstall the app. If you have one, keep every repayment receipt." },
  { hi: "Data Exit आपकी तरफ़ से डेटा इस्तेमाल की सहमति वापस लेने का संदेश बनाएगा (आप मंज़ूरी देंगे)।", en: "Data Exit drafts a consent-withdrawal message for you to approve." },
  { hi: "धमकी या ब्लैकमेल हो तो पैसे न दें: 1930 पर कॉल करें और sachet.rbi.org.in पर शिकायत करें।", en: "Threats or blackmail? Don't pay. Call 1930 and complain at sachet.rbi.org.in." },
];

/** Fictional sample messages for the demo. */
export const SAMPLES: Array<{ label: Bi; text: string }> = [
  { label: { hi: "बैंक KYC", en: "Bank KYC" }, text: "प्रिय ग्राहक, आपका बैंक खाता आज रात बंद हो जाएगा। तुरंत KYC अपडेट करें: http://bit.ly/kyc-upd8" },
  { label: { hi: "बिजली बिल", en: "Electricity bill" }, text: "प्रिय उपभोक्ता, आपका पिछला बिल अपडेट नहीं हुआ है। आज रात 9:30 बजे बिजली कट जाएगी। तुरंत बिजली अधिकारी को 98XXXXX412 पर कॉल करें।" },
  { label: { hi: "किसान योजना", en: "Farmer scheme" }, text: "PM Kisan की अगली किस्त पाने के लिए आपके मोबाइल पर आया OTP इस नंबर पर बताएं।" },
  { label: { hi: "QR कैशबैक", en: "QR cashback" }, text: "आपको ₹2,000 कैशबैक मिला है। पैसे पाने के लिए QR स्कैन करें और UPI पिन डालें।" },
  { label: { hi: "डिजिटल अरेस्ट", en: "Digital arrest" }, text: "This is Mumbai Police Cyber Cell. A parcel in your name has drugs. You are under digital arrest. Join the video call now and do not tell your family." },
  { label: { hi: "लॉटरी", en: "Lottery" }, text: "Congratulations! You won ₹25,00,000 in the KBC lucky draw. Pay ₹5,000 processing fee to claim." },
  { label: { hi: "घर बैठे काम", en: "Part-time job" }, text: "Part time job! Like YouTube videos and earn ₹3000 daily. Join: t.me/earn_daily_job" },
  { label: { hi: "असली OTP", en: "Real OTP SMS" }, text: "482913 is your OTP to log in. Do not share it with anyone. It is valid for 10 minutes." },
];
