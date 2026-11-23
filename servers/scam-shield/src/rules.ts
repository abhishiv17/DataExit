// Red-flag rules for messages forwarded by rural users (SMS, WhatsApp text, OCR of screenshots, voice-note transcripts).
// Includes common Hinglish and Hindi phrasings. Weights add up to a 0-100 score.

export interface Flag {
  id: string;
  weight: number;
  pattern: RegExp;
  reason: { en: string; hi: string };
}

export const FLAGS: Flag[] = [
  {
    id: "asks_otp",
    weight: 45,
    // No \b around Devanagari: JS word boundaries are ASCII-only.
    pattern: /(\botp\b|one[- ]time password|verification code|ओटीपी)[\s\S]{0,60}(\bshare|\bsend|\btell|\bgive|\bforward|\bbata|\bbhej|\bde do|बताएं|बताएँ|बताइए|बताओ|भेजें|भेजो)|\b(share|send|tell|bata|bhej)\w*[\s\S]{0,30}(\botp\b|ओटीपी)/i,
    reason: { en: "It asks you to share an OTP. No bank, government office or company ever asks for your OTP.", hi: "इसमें OTP माँगा गया है। कोई बैंक, सरकारी दफ़्तर या कंपनी कभी OTP नहीं माँगती।" },
  },
  {
    id: "asks_pin",
    weight: 45,
    pattern: /(enter|daalo|dalein|dale|डालें|डालो)\s+(your\s+)?(upi\s+)?pin|pin\s+(daal|dal|enter)|pin (to|for) receiv|receive (money|payment|amount)[\s\S]{0,40}pin/i,
    reason: { en: "It asks you to enter your UPI PIN. You never need a PIN to receive money; a PIN only sends money out.", hi: "इसमें UPI PIN डालने को कहा गया है। पैसे पाने के लिए PIN की ज़रूरत नहीं होती, PIN डालने से पैसे जाते हैं।" },
  },
  {
    id: "asks_aadhaar_or_card",
    weight: 30,
    pattern: /(send|share|bhej|upload)\w*[\s\S]{0,40}(aadhaa?r|आधार|pan card|card number|cvv|atm pin|net ?banking password)/i,
    reason: { en: "It asks for Aadhaar, card or banking details over a message.", hi: "इसमें मैसेज पर आधार, कार्ड या बैंक की जानकारी माँगी गई है।" },
  },
  {
    id: "kyc_threat",
    weight: 30,
    pattern: /(kyc|केवाईसी|pan)[\s\S]{0,60}(expire|expired|update|pending|block|suspend|band|बंद|अपडेट)/i,
    reason: { en: "It threatens that your account will be blocked unless you update KYC through a link. Banks do not do this by SMS or WhatsApp.", hi: "इसमें KYC अपडेट न करने पर खाता बंद होने की धमकी है। बैंक ऐसा SMS या WhatsApp से नहीं करते।" },
  },
  {
    id: "block_threat",
    weight: 20,
    pattern: /(account|card|sim|connection|electricity|bijli|बिजली|खाता|सिम)[\s\S]{0,50}(block|suspend|disconnect|deactivat|band ho|बंद हो|कट)/i,
    reason: { en: "It threatens to cut off your account, SIM or electricity to rush you.", hi: "इसमें खाता, सिम या बिजली काटने की धमकी देकर जल्दबाज़ी कराई जा रही है।" },
  },
  {
    id: "authority_threat",
    weight: 35,
    pattern: /(cbi|police|customs|narcotics|\bncb\b|\bed\b officer|enforcement directorate|trai|cyber cell|digital arrest|arrest warrant|court notice|पुलिस|गिरफ़्तार|parcel[\s\S]{0,40}(seized|drugs|illegal))/i,
    reason: { en: "It claims to be police, CBI, customs or a court. Officials never demand money or video calls on WhatsApp; 'digital arrest' does not exist.", hi: "यह पुलिस, CBI, कस्टम या कोर्ट होने का दावा करता है। अधिकारी WhatsApp पर पैसे या वीडियो कॉल नहीं माँगते; 'डिजिटल अरेस्ट' जैसा कुछ नहीं होता।" },
  },
  {
    id: "prize",
    weight: 25,
    pattern: /(lottery|lucky draw|you (have )?won|winner|prize|jackpot|kbc|inaam|इनाम|लॉटरी|जीत)/i,
    reason: { en: "It says you won a prize or lottery you never entered.", hi: "इसमें ऐसी लॉटरी या इनाम जीतने की बात है जिसमें आपने हिस्सा ही नहीं लिया।" },
  },
  {
    id: "remote_access",
    weight: 40,
    pattern: /(anydesk|teamviewer|quick ?support|rustdesk|screen ?shar|\.apk\b|install (this|the) app|download (this|the) app)/i,
    reason: { en: "It asks you to install an app or share your screen. That gives a stranger control of your phone.", hi: "इसमें ऐप डाउनलोड करने या स्क्रीन शेयर करने को कहा गया है। इससे अजनबी आपके फ़ोन पर कब्ज़ा कर सकता है।" },
  },
  {
    id: "job_task",
    weight: 25,
    pattern: /(work from home|part[- ]time job|ghar baithe|घर बैठे|daily (income|earning)|earn ₹?\s?\d[\d,]*\s*(per|daily|\/day|a day)|like (and|&) (earn|subscribe)|youtube (like|task)|telegram task|prepaid task)/i,
    reason: { en: "It offers easy money for simple tasks. These 'task jobs' later ask you to pay a deposit.", hi: "इसमें आसान काम के बदले पैसे का लालच है। ऐसी 'टास्क जॉब' बाद में जमा राशि माँगती हैं।" },
  },
  {
    id: "loan_fee",
    weight: 25,
    pattern: /(instant|pre[- ]?approved|guaranteed)\s+loan|loan (approved|sanctioned)[\s\S]{0,60}(fee|charge|pay|processing)/i,
    reason: { en: "It offers an instant loan, often from illegal loan apps that misuse your contacts and photos.", hi: "इसमें तुरंत लोन का ऑफ़र है। ऐसे ग़ैरक़ानूनी लोन ऐप आपके कॉन्टैक्ट और फ़ोटो का ग़लत इस्तेमाल करते हैं।" },
  },
  {
    id: "investment",
    weight: 20,
    pattern: /(guaranteed (return|profit)|double (your )?money|paisa double|पैसा डबल|\d{2,3}% (return|profit|monthly)|stock tips|crypto (investment|trading)|ipo allotment)/i,
    reason: { en: "It promises guaranteed or very high returns. Real investments never guarantee profit.", hi: "इसमें पक्के या बहुत ज़्यादा मुनाफ़े का वादा है। असली निवेश में मुनाफ़े की गारंटी नहीं होती।" },
  },
  {
    id: "scheme_impersonation",
    weight: 25,
    pattern: /(pm[- ]?kisan|ayushman|ration card|census|जनगणना|gas subsidy|scholarship|e-?kyc|aadhaa?r (update|link)|pension|ujjwala|jan dhan)[\s\S]{0,80}(link|click|otp|fee|payment|update karo|apply now)/i,
    reason: { en: "It uses a government scheme's name to get you to click a link or share an OTP. Schemes are handled at your CSC, bank or official website.", hi: "इसमें सरकारी योजना का नाम लेकर लिंक या OTP माँगा गया है। योजनाओं का काम CSC, बैंक या सरकारी वेबसाइट पर होता है।" },
  },
  {
    id: "wrong_transfer",
    weight: 25,
    pattern: /(sent|transferred|bhej diye|भेज दिए)[\s\S]{0,40}(by mistake|galti se|गलती से|wrongly)|(refund|wapas)[\s\S]{0,30}(collect request|request bheji|approve)/i,
    reason: { en: "Someone claims they sent you money by mistake. Check your bank app yourself; do not approve any request they send.", hi: "कोई कह रहा है कि उसने गलती से पैसे भेज दिए। अपने बैंक ऐप में ख़ुद जाँचें; उनकी भेजी कोई रिक्वेस्ट मंज़ूर न करें।" },
  },
  {
    id: "urgency",
    weight: 10,
    pattern: /(urgent|immediately|within 24 hours|today only|last (chance|date)|turant|abhi|jaldi|तुरंत|अभी|आज ही)/i,
    reason: { en: "It pushes you to act immediately.", hi: "इसमें तुरंत कुछ करने का दबाव है।" },
  },
];

/** Official domains of brands scammers imitate. A link mentioning the brand but not on these domains is a lookalike. */
export const OFFICIAL_DOMAINS: Record<string, string[]> = {
  sbi: ["sbi.co.in", "onlinesbi.sbi", "sbi"],
  hdfc: ["hdfcbank.com", "hdfc.com"],
  icici: ["icicibank.com"],
  axis: ["axisbank.com"],
  kotak: ["kotak.com"],
  paytm: ["paytm.com"],
  phonepe: ["phonepe.com"],
  npci: ["npci.org.in"],
  uidai: ["uidai.gov.in"],
  aadhaar: ["uidai.gov.in"],
  epfo: ["epfindia.gov.in"],
  incometax: ["incometax.gov.in"],
  irctc: ["irctc.co.in"],
  indiapost: ["indiapost.gov.in"],
  pmkisan: ["pmkisan.gov.in"],
};

export const URL_SHORTENERS = ["bit.ly", "tinyurl.com", "cutt.ly", "rb.gy", "t.ly", "is.gd", "shorturl.at", "tiny.cc", "ow.ly", "goo.su"];
export const RISKY_TLDS = [".xyz", ".top", ".click", ".online", ".site", ".info", ".live", ".buzz", ".shop", ".icu", ".vip", ".cc", ".tk"];

export const AFTER_FRAUD = /(paise kat gaye|paisa kat gaya|money (was )?(debited|deducted|lost|gone)|lost (₹|rs|money)|पैसे कट गए|पैसे चले गए|fraud ho gaya|ठगी|scammed|i (paid|sent) (them|him|her))/i;
