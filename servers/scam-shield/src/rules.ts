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
    pattern: /(\botp\b|one[- ]time password|verification code|ओटीपी|ಒಟಿಪಿ)[\s\S]{0,60}(\bshare|\bsend|\btell|\bgive|\bforward|\bbata|\bbhej|\bde do|बताएं|बताएँ|बताइए|बताओ|भेजें|भेजो|ಹೇಳಿ|ಕಳುಹಿಸಿ|ಹಂಚಿಕೊಳ್ಳಿ)|\b(share|send|tell|bata|bhej)\w*[\s\S]{0,30}(\botp\b|ओटीपी|ಒಟಿಪಿ)/i,
    reason: { en: "It asks you to share an OTP. No bank, government office or company ever asks for your OTP.", hi: "इसमें OTP माँगा गया है। कोई बैंक, सरकारी दफ़्तर या कंपनी कभी OTP नहीं माँगती।" },
  },
  {
    id: "asks_pin",
    weight: 45,
    pattern: /(enter|daalo|dalein|dale|डालें|डालो)\s+(your\s+)?(upi\s+)?(pin|पिन)|(pin|पिन)\s*(daal|dal|enter|डालें|डालो|डाल)|pin (to|for) receiv|receive (money|payment|amount)[\s\S]{0,40}pin|पाने के लिए[\s\S]{0,40}(pin|पिन)|(PIN|ಪಿನ್)[\s\S]{0,30}(ಹಾಕಿ|ನಮೂದಿಸಿ|ಹೇಳಿ)/i,
    reason: { en: "It asks you to enter your UPI PIN. You never need a PIN to receive money; a PIN only sends money out.", hi: "इसमें UPI PIN डालने को कहा गया है। पैसे पाने के लिए PIN की ज़रूरत नहीं होती, PIN डालने से पैसे जाते हैं।" },
  },
  {
    id: "qr_to_receive",
    weight: 45,
    // "scan the QR" (English) or "QR स्कैन करें" (Hindi/Kannada word order), near a promise of money coming in.
    pattern: /((scan|स्कैन|ಸ್ಕ್ಯಾನ್)[\s\S]{0,40}(qr|क्यूआर|ಕ್ಯೂಆರ್|code)|(qr|क्यूआर|ಕ್ಯೂಆರ್)[\s\S]{0,15}(scan|स्कैन|ಸ್ಕ್ಯಾನ್))[\s\S]{0,60}(receive|get|claim|credit|refund|cashback|पाने|पैसे|ಪಡೆಯ|ಹಣ)|(receive|get|claim|credit|refund|cashback|पाने|ಪಡೆಯ)[\s\S]{0,60}((scan|स्कैन|ಸ್ಕ್ಯಾನ್)[\s\S]{0,40}(qr|क्यूआर|ಕ್ಯೂಆರ್|code)|(qr|क्यूआर|ಕ್ಯೂಆರ್)[\s\S]{0,15}(scan|स्कैन|ಸ್ಕ್ಯಾನ್))/i,
    reason: { en: "It asks you to scan a QR code to receive money. Scanning a QR code only ever sends money out of your account.", hi: "इसमें पैसे पाने के लिए QR स्कैन करने को कहा गया है। QR स्कैन करने से पैसे जाते हैं, आते नहीं।" },
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
    pattern: /(kyc|केवाईसी|pan|ಕೆವೈಸಿ)[\s\S]{0,60}(expire|expired|update|pending|block|suspend|band|बंद|अपडेट|ಮುಚ್ಚ|ನಿರ್ಬಂಧ|ನವೀಕರಿಸಿ)/i,
    reason: { en: "It threatens that your account will be blocked unless you update KYC through a link. Banks do not do this by SMS or WhatsApp.", hi: "इसमें KYC अपडेट न करने पर खाता बंद होने की धमकी है। बैंक ऐसा SMS या WhatsApp से नहीं करते।" },
  },
  {
    id: "block_threat",
    weight: 20,
    pattern: /(account|card|sim|connection|electricity|bijli|बिजली|खाता|सिम|ಖಾತೆ|ಸಿಮ್|ವಿದ್ಯುತ್)[\s\S]{0,50}(block|suspend|disconnect|deactivat|cut off|band ho|kat ja|kaat|बंद हो|कट|ಮುಚ್ಚ|ಕಡಿತ|ಸ್ಥಗಿತ)/i,
    reason: { en: "It threatens to cut off your account, SIM or electricity to rush you.", hi: "इसमें खाता, सिम या बिजली काटने की धमकी देकर जल्दबाज़ी कराई जा रही है।" },
  },
  {
    id: "authority_threat",
    weight: 35,
    pattern: /(\bcbi\b|police|customs|narcotics|\bncb\b|\bed\b officer|enforcement directorate|\btrai\b|cyber cell|digital arrest|arrest warrant|court notice|पुलिस|गिरफ़्तार|गिरफ्तार|सीबीआई|डिजिटल अरेस्ट|ಪೊಲೀಸ್|ಡಿಜಿಟಲ್ ಬಂಧನ|ಬಂಧನ ವಾರಂಟ್)/i,
    reason: { en: "It claims to be police, CBI, customs or a court. Officials never demand money or video calls on WhatsApp; 'digital arrest' does not exist.", hi: "यह पुलिस, CBI, कस्टम या कोर्ट होने का दावा करता है। अधिकारी WhatsApp पर पैसे या वीडियो कॉल नहीं माँगते; 'डिजिटल अरेस्ट' जैसा कुछ नहीं होता।" },
  },
  {
    id: "parcel_drugs",
    weight: 25,
    pattern: /(parcel|courier|package|fedex|dhl|पार्सल|कूरियर|ಪಾರ್ಸೆಲ್)[\s\S]{0,60}(drugs|narcotic|illegal|seized|contraband|passports?|ड्रग्स|नशीले|ज़ब्त|ಮಾದಕ)/i,
    reason: { en: "It says a parcel in your name holds drugs or illegal items. This is the opening line of the 'digital arrest' scam.", hi: "इसमें कहा गया है कि आपके नाम के पार्सल में ड्रग्स या ग़ैरक़ानूनी सामान है। यह 'डिजिटल अरेस्ट' स्कैम की शुरुआत होती है।" },
  },
  {
    id: "video_call",
    weight: 20,
    pattern: /(join|stay on|come on|be on|connect (to|on))[\s\S]{0,20}(video call|skype|zoom)|(video call|वीडियो कॉल|ವೀಡಿಯೊ ಕರೆ)[\s\S]{0,20}(now|immediately|पर (रहें|आएं|जुड़ें)|ಸೇರಿ)/i,
    reason: { en: "It wants you on a video call. Police and courts never question or arrest anyone over a video call.", hi: "इसमें वीडियो कॉल पर आने को कहा गया है। पुलिस या कोर्ट वीडियो कॉल पर पूछताछ या गिरफ़्तारी नहीं करते।" },
  },
  {
    id: "secrecy",
    weight: 25,
    // Not bare "don't tell anyone": genuine OTP SMS say that about the OTP itself.
    pattern: /(do not|don't|dont|never) (tell|inform|call|contact) (your )?(family|bank|relatives|friends|husband|wife|son|daughter|parents)|(do not|don't|dont) (tell|inform) (anyone|anybody) (about|of) (this|it|the case|the call)|keep (this|it|the (call|case|matter)) (a )?(secret|confidential)|(परिवार|घरवालों|घर वालों|बैंक) को (मत|न|ना|कुछ न)|इस बारे में किसी को (भी )?(मत|न|ना)|ಕುಟುಂಬಕ್ಕೆ ಹೇಳಬೇಡಿ|ಮನೆಯವರಿಗೆ ಹೇಳಬೇಡಿ|ಈ ಬಗ್ಗೆ ಯಾರಿಗೂ ಹೇಳಬೇಡಿ/i,
    reason: { en: "It tells you to keep it secret from your family or bank. Scammers isolate you so no one can stop the payment.", hi: "इसमें परिवार या बैंक को न बताने को कहा गया है। ठग आपको अकेला करते हैं ताकि कोई भुगतान न रोक सके।" },
  },
  {
    id: "prize",
    weight: 25,
    pattern: /(lottery|lucky draw|you (have )?won|winner|prize|jackpot|kbc|inaam|इनाम|लॉटरी|जीत)/i,
    reason: { en: "It says you won a prize or lottery you never entered.", hi: "इसमें ऐसी लॉटरी या इनाम जीतने की बात है जिसमें आपने हिस्सा ही नहीं लिया।" },
  },
  {
    id: "fee_to_claim",
    weight: 35,
    pattern: /(pay|deposit|transfer|send|jama|bharo|भरें|जमा कर|ಪಾವತಿಸಿ)[\s\S]{0,40}(fee|charge|tax|gst|शुल्क|फीस|ಶುಲ್ಕ)[\s\S]{0,40}(claim|receive|release|get|unlock|पाने|ಪಡೆಯ)|(claim|receive|release|पाने के लिए)[\s\S]{0,40}(pay|deposit|भरें|जमा)[\s\S]{0,20}(fee|charge|शुल्क|फीस)/i,
    reason: { en: "It asks you to pay a fee before you get money. Real prizes and refunds never charge you first.", hi: "इसमें पैसा मिलने से पहले फीस माँगी गई है। असली इनाम या रिफ़ंड में पहले पैसे नहीं लिए जाते।" },
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
    pattern: /(work from home|part[- ]?time job|ghar baithe|घर बैठे|daily (income|earning)|earn ₹?\s?\d[\d,]*\s*(per|daily|\/day|a day)|ದಿನಕ್ಕೆ[\s\S]{0,35}(ರೂಪಾಯಿ|ಗಳಿಸಿ)|ಕೆಲಸ[\s\S]{0,50}(ಮುಂಗಡ|ಹಣ ಕಳುಹಿಸಿ)|ಮೊದಲು ಹಣ ಕಳುಹಿಸಿ)/i,
    reason: { en: "It offers easy money for simple tasks. These 'task jobs' later ask you to pay a deposit.", hi: "इसमें आसान काम के बदले पैसे का लालच है। ऐसी 'टास्क जॉब' बाद में जमा राशि माँगती हैं।" },
  },
  {
    id: "task_scam",
    weight: 30,
    pattern: /(like (youtube |insta(gram)? )?(videos?|posts?|reels?)|like (and|&) (earn|subscribe)|youtube (like|task)|telegram task|prepaid task|review task|rate (hotels|products|movies|restaurants)|वीडियो लाइक|ವೀಡಿಯೊ ಲೈಕ್)/i,
    reason: { en: "It pays you to like videos or rate products. These task scams pay a little at first, then ask for a large deposit.", hi: "इसमें वीडियो लाइक या रेटिंग के बदले पैसे का लालच है। ये पहले थोड़ा देकर फिर बड़ी रकम जमा करवाते हैं।" },
  },
  {
    id: "call_number",
    weight: 15,
    pattern: /(call|contact|कॉल करें|फ़ोन करें|फोन करें|ಕರೆ ಮಾಡಿ)[\s\S]{0,40}(\d[\dX]{7,}\d|\d{5}\s?\d{5})|(\d[\dX]{7,}\d|\d{5}\s?\d{5})[\s\S]{0,20}(पर (कॉल|फ़ोन|फोन) करें|ಗೆ ಕರೆ)/i,
    reason: { en: "It asks you to call a number given in the message. Call only the number on the official website, your bill or your card.", hi: "इसमें मैसेज में दिए नंबर पर कॉल करने को कहा गया है। सिर्फ़ आधिकारिक वेबसाइट, बिल या कार्ड पर दिए नंबर पर कॉल करें।" },
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
    pattern: /(urgent|immediately|within 24 hours|today only|last (chance|date)|turant|abhi|jaldi|तुरंत|अभी|आज ही|ತಕ್ಷಣ|ಈಗಲೇ|ಇಂದೇ)/i,
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

/**
 * A genuine OTP SMS warns "do not share it with anyone". That warning is removed before the OTP rule runs, so a real
 * OTP message is not flagged for "OTP … share". Not removed when the message makes an exception ("except our agent").
 */
export const DONT_SHARE_NOTICE = /((do not|don't|dont|never|not to)\s+(share|tell|disclose|give|forward)( (it|this( otp| code)?|the (otp|code)|your (otp|code)|otp|code))?( (with|to) (anyone|anybody|any ?one|others))?|किसी (को|से) (भी )?(न|ना|मत) (बताएं|बताएँ|बताइए|बताओ|बताना|शेयर करें)|share (na|mat) kar\w*|ಯಾರೊಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ|ಯಾರಿಗೂ ಹೇಳಬೇಡಿ|ಹಂಚಿಕೊಳ್ಳಬೇಡಿ)/gi;
export const SHARE_EXCEPTION = /\b(except|other than|apart from|only (with|to))\b|सिर्फ़|सिर्फ|केवल|के अलावा|ಹೊರತು|ಮಾತ್ರ/i;

/** Chat-app invite links used to move job and investment scams off SMS. */
export const CHAT_INVITE_HOSTS = ["t.me", "telegram.me", "chat.whatsapp.com", "wa.me"];

export const URL_SHORTENERS =["bit.ly", "tinyurl.com", "cutt.ly", "rb.gy", "t.ly", "is.gd", "shorturl.at", "tiny.cc", "ow.ly", "goo.su"];
export const RISKY_TLDS = [".xyz", ".top", ".click", ".online", ".site", ".info", ".live", ".buzz", ".shop", ".icu", ".vip", ".cc", ".tk"];

export const AFTER_FRAUD = /(paise kat gaye|paisa kat gaya|money (was )?(debited|deducted|lost|gone)|lost (₹|rs|money)|पैसे कट गए|पैसे चले गए|fraud ho gaya|ठगी|scammed|i (paid|sent) (them|him|her)|ಹಣ ಕಳೆದುಕೊಂಡೆ|ಹಣ ಕಳುಹಿಸಿದೆ|ಹಣ ಕಡಿತವಾಯಿತು|ವಂಚನೆಗೆ ಒಳಗಾದೆ)/i;
