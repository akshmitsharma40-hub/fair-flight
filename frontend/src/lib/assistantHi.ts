/**
 * assistantHi.ts — Hindi voice/intent layer for the APIx assistant.
 *
 * A thin Hindi mirror of assistant.ts: same deterministic, grounded numbers
 * (scopeStats comes straight from the English engine), Hindi question
 * recognition and Hindi replies. Triggered only when the assistant is in
 * हिंदी mode, so the English intent path is byte-for-byte unchanged.
 *
 * Demo beat: "दिल्ली से मुंबई का भविष्यफल बताओ" → spoken Hindi answer while
 * the dashboard switches to DEL-BOM.
 */

import {
  respondTo,
  scopeStats,
  type AssistantContext,
  type AssistantReply,
} from "@/lib/assistant";
import { ROUTES, reindex, type Horizon, type RouteId } from "@/lib/series";

// ---------------------------------------------------------------------------
// Route / horizon / base-year extraction (Devanagari + Hinglish)
// ---------------------------------------------------------------------------

const HI_ROUTE_ALIASES: Array<{ id: RouteId; patterns: RegExp[] }> = [
  { id: "DEL-BOM", patterns: [/दिल्ली[^।?!.]{0,12}(मुंबई|मुम्बई)/, /delhi[^a-z]{0,6}mumbai/i, /del\s*-\s*bom/i] },
  { id: "DEL-BLR", patterns: [/दिल्ली[^।?!.]{0,12}(बेंगलुरु|बैंगलोर|बंगलोर)/, /delhi[^a-z]{0,6}(bengaluru|bangalore)/i, /del\s*-\s*blr/i] },
  { id: "BOM-BLR", patterns: [/(मुंबई|मुम्बई)[^।?!.]{0,12}(बेंगलुरु|बैंगलोर|बंगलोर)/, /mumbai[^a-z]{0,6}(bengaluru|bangalore)/i, /bom\s*-\s*blr/i] },
  { id: "BLR-HYD", patterns: [/(बेंगलुरु|बैंगलोर|बंगलोर)[^।?!.]{0,12}हैदराबाद/, /(bengaluru|bangalore)[^a-z]{0,6}hyderabad/i, /blr\s*-\s*hyd/i] },
  { id: "DEL-CCU", patterns: [/दिल्ली[^।?!.]{0,12}(कोलकाता|कलकत्ता)/, /delhi[^a-z]{0,6}(kolkata|calcutta)/i, /del\s*-\s*ccu/i] },
];

function hiExtractRoute(text: string): RouteId | null {
  for (const { id, patterns } of HI_ROUTE_ALIASES) {
    if (patterns.some((p) => p.test(text))) return id;
  }
  return null;
}

function hiExtractHorizon(text: string): Horizon | null {
  if (/सप्ताह|हफ्ता|हफ़्ता|week|7\s*-?\s*d/i.test(text)) return "7D";
  if (/महीना|महीने|मास|month|1\s*-?\s*m/i.test(text)) return "1M";
  if (/तिमाही|तीन\s*महीना|तीन\s*महीने|quarter|3\s*-?\s*m/i.test(text)) return "3M";
  if (/पूरा|सारा|इतिहास|all|history/i.test(text)) return "ALL";
  return null;
}

function hiExtractBaseYear(text: string): "2012" | "2024" | null {
  if (/2012/i.test(text)) return "2012";
  if (/2024/i.test(text)) return "2024";
  return null;
}

function hiRouteName(id: RouteId | "NATIONAL"): string {
  if (id === "NATIONAL") return "राष्ट्रीय समग्र";
  const route = ROUTES.find((r) => r.id === id);
  return route ? `${route.corridor} (${id})` : id;
}

// ---------------------------------------------------------------------------
// Hindi replies — numbers identical to the English engine's
// ---------------------------------------------------------------------------

function hiTrend(trendPct: number): string {
  if (trendPct > 5) return "लगातार तेजी से ऊपर";
  if (trendPct > 1) return "धीरे-धीरे ऊपर";
  if (trendPct < -5) return "तेज़ी से नीचे";
  if (trendPct < -1) return "धीरे-धीरे नीचे";
  return "लगभग सपाट";
}

function fmt(n: number): string {
  return n.toLocaleString("hi-IN", { maximumFractionDigits: 2 });
}

function hiCurrentIndex(text: string, ctx: AssistantContext): AssistantReply {
  const route = hiExtractRoute(text) ?? null;
  const target = route ?? (ctx.scope === "NATIONAL" ? null : ctx.scope);
  if (!target) {
    const s = scopeStats("NATIONAL", ctx.baseYear);
    return {
      text: [
        `राष्ट्रीय एपीआईएक्स अभी **${fmt(s.latest)}** है (आधार ${ctx.baseYear}=100), ${s.latestDate} तक।`,
        `भारित टोकरी की औसत किराया ₹${fmt(s.avgFare)} है; दिन-दर-दिन बदलाव ${s.dodPct >= 0 ? "+" : ""}${fmt(s.dodPct)}% और रुझान ${hiTrend(s.trendPct)} है।`,
      ].join("\n\n"),
      chips: ["दिल्ली से मुंबई दिखाओ", "भविष्यवाणी बताओ", "सीपीआई से तुलना"],
      action: undefined,
    };
  }
  const s = scopeStats(target, ctx.baseYear);
  return {
    text: [
      `${hiRouteName(target)} का एपीआईएक्स **${fmt(s.latest)}** है (आधार ${ctx.baseYear}=100)।`,
      `किराया ₹${fmt(s.avgFare)}; दिन-दर-दिन ${s.dodPct >= 0 ? "+" : ""}${fmt(s.dodPct)}%; रुझान ${hiTrend(s.trendPct)}। यह गलियारा राष्ट्रीय टोकरी में ${s.weightPct}% डीजीसीए भार रखता है।`,
    ].join("\n\n"),
    chips: ["भविष्यवाणी बताओ", "सीपीआई से तुलना", "राष्ट्रीय दृश्य"],
    action: route && route !== ctx.scope ? { type: "setScope", value: route } : undefined,
  };
}

function hiForecast(text: string, ctx: AssistantContext): AssistantReply {
  const route = hiExtractRoute(text);
  const targetScope = route ?? ctx.scope;
  const action = route && route !== ctx.scope ? { type: "setScope" as const, value: route } : undefined;
  const stats = scopeStats(targetScope, ctx.baseYear);

  const forecast = ctx.forecast ?? null;
  if (!forecast || forecast.predictions.length === 0) {
    return {
      text: "फिलहाल फिट किया गया पूर्वानुमान उपलब्ध नहीं है — एआरआईएमए इंजन अभी तैयार हो रहा है। कुछ क्षण बाद फिर पूछें।",
      chips: ["वर्तमान एपीआईएक्स क्या है?", "किराया क्यों बढ़ा?"],
      action,
    };
  }

  const { order } = forecast.model;
  const last = forecast.predictions[forecast.predictions.length - 1];
  const re = reindex(last.point, ctx.baseYear);
  const lo = reindex(last.lower95, ctx.baseYear);
  const hi = reindex(last.upper95, ctx.baseYear);
  const drift = re - stats.latest;
  const direction = drift >= 0 ? "बढ़कर" : "घटकर";

  return {
    text: [
      `एआरआईएमए(${order.p},${order.d},${order.q}) अनुमान: ${hiRouteName(targetScope)} ${last.date} तक **${fmt(re)}** ${direction} जा सकता है (आधार ${ctx.baseYear}=100)।`,
      `आज के ${fmt(stats.latest)} से यह ${drift >= 0 ? "+" : ""}${fmt(drift)} अंक की चाल है; 95% अंतराल ${fmt(lo)} – ${fmt(hi)} है — ग्राफ़ का छायांकित बैंड।`,
      forecast.source === "backend"
        ? "मॉडल सर्वर-साइड पर, प्रकाशित श्रृंखला पर फिट किया गया है (हानन–रिसानेन, एआईसी-चयनित ऑर्डर)।"
        : "मॉडल ब्राउज़र में फिट किया गया है (बैकएंड ऑफ़लाइन) — कार्यप्रणाली वही है।",
    ].join("\n\n"),
    chips: ["वर्तमान एपीआईएक्स क्या है?", "किराया क्यों बढ़ा?", "सीपीआई से तुलना"],
    action,
  };
}

function hiCompareCpi(_text: string, ctx: AssistantContext): AssistantReply {
  const s = scopeStats(ctx.scope, ctx.baseYear);
  const cpi = reindex(ctx.cpiBenchmark, ctx.baseYear);
  const gap = s.latest - cpi;
  return {
    text: [
      `${ctx.scope === "NATIONAL" ? "राष्ट्रीय" : hiRouteName(ctx.scope)} एपीआईएक्स **${fmt(s.latest)}** है, जबकि आधिकारिक सीपीआई बेंचमार्क ${fmt(cpi)} है (आधार ${ctx.baseYear}=100)।`,
      gap >= 0
        ? `हवाई किराया सीपीआई संदर्भ रेखा से ${fmt(gap)} अंक ऊपर चल रहा है — डायनामिक प्राइसिंग समग्र परिवहन महंगाई से तेज़ है।`
        : `हवाई किराया सीपीआई संदर्भ रेखा से ${fmt(Math.abs(gap))} अंक नीचे है — क्षेत्र के लिए असामान्य रूप से सौम्य दौर।`,
      `सीपीआई डिविजन 07 (परिवहन) महीने में एक बार, देरी से प्रकाशित होता है; एपीआईएक्स रोज़ अपडेट होता है — ठीक वही अंतर भरने के लिए बना है।`,
    ].join("\n\n"),
    chips: ["वर्तमान एपीआईएक्स क्या है?", "भविष्यवाणी बताओ", "2012 आधार पर जाओ"],
  };
}

function hiEvents(_text: string, ctx: AssistantContext): AssistantReply {
  const s = scopeStats(ctx.scope, ctx.baseYear);
  return {
    text: [
      `${ctx.scope === "NATIONAL" ? "राष्ट्रीय" : hiRouteName(ctx.scope)} का हालिया रुझान: ${hiTrend(s.trendPct)} (${s.trendPct >= 0 ? "+" : ""}${fmt(s.trendPct)}%)।`,
      `ग्राफ़ पर अंकित घटनाएँ — स्वतंत्रता दिवस (15 अगस्त), कॉर्पोरेट टेक समिट (3 सितंबर), एटीएफ ईंधन वृद्धि (16 जुलाई) — हर एक घटती हुई 4-दिन की मांग-झटका डालती है। त्योहार एंकर हर साल लौटते हैं।`,
      `अवधि का उच्चतम: **${fmt(s.peak.value)}** (${s.peak.date}); निम्नतम: ${fmt(s.trough.value)} (${s.trough.date})।`,
    ].join("\n\n"),
    chips: ["भविष्यवाणी बताओ", "7 दिन का दृश्य", "वर्तमान एपीआईएक्स क्या है?"],
  };
}

function hiBaseYear(text: string, ctx: AssistantContext): AssistantReply {
  const target = hiExtractBaseYear(text) ?? (ctx.baseYear === "2024" ? "2012" : "2024");
  const s = scopeStats(ctx.scope, target);
  const factor = target === "2012" ? "× 1.18 पुनः-सूचकांकन" : "÷ 1.18 (2024 जनादेश पर वापस)";
  return {
    text: [
      `आधार **${target}=100** पर स्विच किया (${factor})।`,
      `इस पैमाने पर ${ctx.scope === "NATIONAL" ? "राष्ट्रीय" : hiRouteName(ctx.scope)} एपीआईएक्स **${fmt(s.latest)}** पढ़ता है।`,
      `मोएसपीआई का सीपीआई जनादेश कोआईसीओपी-2018 के अंतर्गत आधार वर्ष 2024=100 पर है; 2012 दृश्य पुरानी श्रृंखला की तुलना के लिए रखा गया है।`,
    ].join("\n\n"),
    chips: ["2024 आधार पर जाओ", "सीपीआई से तुलना", "भविष्यवाणी बताओ"],
    action: { type: "setBaseYear", value: target },
  };
}

function hiSetHorizon(text: string, _ctx: AssistantContext): AssistantReply {
  const target = hiExtractHorizon(text);
  if (!target) {
    return {
      text: "मैं समय-सीमा 7D, 1M, 3M या पूरा इतिहास में बदल सकता हूँ — कौन सा चाहेंगे?",
      chips: ["7 दिन का दृश्य", "1 महीने का दृश्य", "पूरा इतिहास"],
    };
  }
  const labels: Record<Horizon, string> = {
    "7D": "7 दिन",
    "1M": "1 महीना",
    "3M": "3 महीने",
    ALL: "पूरा 180-दिन का इतिहास",
  };
  return {
    text: `समय-सीमा **${labels[target]}** पर स्विच कर दिया। ग्राफ़, केपीआई पट्टी और विंडो रुझान इसी स्लाइस पर फिर से गणना करेंगे।`,
    chips: ["वर्तमान एपीआईएक्स क्या है?", "भविष्यवाणी बताओ", "सीपीआई से तुलना"],
    action: { type: "setHorizon", value: target },
  };
}

function hiScopeSwitch(text: string, ctx: AssistantContext): AssistantReply {
  const route = hiExtractRoute(text);
  if (!route) {
    return {
      text: `मैं पाँच डीजीसीए गलियारों में से कोई भी अलग कर सकता हूँ: ${ROUTES.map((r) => r.id).join(", ")}। जैसे कहें "दिल्ली से मुंबई दिखाओ"।`,
      chips: ["दिल्ली से मुंबई दिखाओ", "दिल्ली से कोलकाता दिखाओ", "राष्ट्रीय दृश्य"],
    };
  }
  const s = scopeStats(route, ctx.baseYear);
  const nationalFirst = ctx.scope !== route;
  return {
    text: [
      `**${hiRouteName(route)}** अलग कर दिया।`,
      `गलियारा एपीआईएक्स: **${fmt(s.latest)}** (आधार ${ctx.baseYear}=100), दिन-दर-दिन ${s.dodPct >= 0 ? "+" : ""}${fmt(s.dodPct)}%, टोकरी भार ${s.weightPct}%।`,
      ...(nationalFirst ? ["अब हर ग्राफ़, केपीआई पट्टी और पूर्वानुमान इसी गलियारे का अनुसरण करेगा।"] : []),
    ].join("\n\n"),
    chips: ["भविष्यवाणी बताओ", "राष्ट्रीय दृश्य", "वर्तमान एपीआईएक्स क्या है?"],
    action: { type: "setScope", value: route },
  };
}

function hiNational(_text: string, _ctx: AssistantContext): AssistantReply {
  return {
    text: "**राष्ट्रीय समग्र (भारित)** दृश्य पुनः स्थापित — पाँचों गलियारों का निश्चित-टोकरी लास्पेयर्स सूचकांक, डीजीसीए भार 35/25/20/10/10 और बुकिंग-अवधि भार 15/35/50 के साथ।",
    chips: ["वर्तमान एपीआईएक्स क्या है?", "भविष्यवाणी बताओ", "सीपीआई से तुलना"],
    action: { type: "setScope", value: "NATIONAL" },
  };
}

function hiHeatmap(_text: string, _ctx: AssistantContext): AssistantReply {
  const ranked = ROUTES.map((r) => {
    const s = scopeStats(r.id, "2024");
    return { id: r.id, dod: s.dodPct };
  }).sort((a, b) => b.dod - a.dod);
  const hottest = ranked[0];
  const coolest = ranked[ranked.length - 1];
  return {
    text: [
      "गलियारा गर्मी क्रम (दिन-दर-दिन, नवीनतम):",
      ...ranked.map((r, i) => `${i + 1}. **${r.id}** — ${r.dod >= 0 ? "+" : ""}${fmt(r.dod)}%`),
      `सबसे गर्म: ${hottest.id}; सबसे ठंडा: ${coolest.id}।`,
    ].join("\n"),
    chips: [`${hottest.id} दिखाओ`, `${coolest.id} दिखाओ`, "राष्ट्रीय दृश्य"],
  };
}

function hiMethodology(_text: string, _ctx: AssistantContext): AssistantReply {
  return {
    text: [
      "एपीआईएक्स एक **निश्चित-टोकरी लास्पेयर्स सूचकांक** है, आधार वर्ष 2024=100 पर (मोएसपीआई जनादेश, कोआईसीओपी-2018 डिविजन 07 → उपवर्ग 07.3.1.2, हवाई यात्री परिवहन)।",
      "टोकरी = Σ (डीजीसीए गलियारा भार × बुकिंग-अवधि भार × औसत देखा गया किराया)। गलियारा भार: DEL-BOM 35%, DEL-BLR 25%, BOM-BLR 20%, BLR-HYD 10%, DEL-CCU 10%। अवधि भार: T+15 50%, T+7 35%, T+1 15%।",
      "पूर्वानुमान एआरआईएमए(p,1,q) है — ऑर्डर एआईसी से चुना जाता है, हानन–रिसानेन विधि से आकलन, 95% भविष्यवाणी बैंड के साथ।",
    ].join("\n\n"),
    chips: ["वर्तमान एपीआईएक्स क्या है?", "भविष्यवाणी बताओ", "सीपीआई से तुलना"],
  };
}

function hiGreeting(_text: string, ctx: AssistantContext): AssistantReply {
  return {
    text: `नमस्ते! मैं एपीआईएक्स विश्लेषक सहायक हूँ। मैं लाइव डैशबोर्ड स्थिति से उत्तर देता हूँ — सूचकांक स्तर, एआरआईएमए अनुमान, गलियारा गर्मी, कार्यप्रणाली — और नियंत्रण भी चला सकता हूँ (कहें "दिल्ली से मुंबई दिखाओ" या "2012 आधार पर जाओ")। अभी ${ctx.scope === "NATIONAL" ? "राष्ट्रीय" : hiRouteName(ctx.scope)} दृश्य है, आधार ${ctx.baseYear}=100।`,
    chips: ["वर्तमान एपीआईएक्स क्या है?", "दिल्ली से मुंबई भविष्यवाणी", "सीपीआई से तुलना"],
  };
}

function hiFallback(_text: string, _ctx: AssistantContext): AssistantReply {
  return {
    text: "मैं लाइव एपीआईएक्स डैशबोर्ड से उत्तर देता हूँ — वर्तमान सूचकांक, एआरआईएमए पूर्वानुमान, कोई गलियारा (जैसे \"दिल्ली से मुंबई दिखाओ\"), आधार-वर्ष टॉगल, हीटमैप क्रम, या कार्यप्रणाली के बारे में पूछें।",
    chips: ["वर्तमान एपीआईएक्स क्या है?", "दिल्ली से मुंबई दिखाओ", "कार्यप्रणाली बताओ"],
  };
}

// ---------------------------------------------------------------------------
// Hindi intent router — order matters, mirrors the English engine
// ---------------------------------------------------------------------------

const HI_INTENTS: Array<{ patterns: RegExp[]; handler: (text: string, ctx: AssistantContext) => AssistantReply }> = [
  { patterns: [/नमस्ते|नमस्कार|हैलो|हेलो|मदद|क्या बता सकते/], handler: hiGreeting },
  { patterns: [/भविष्यवाणी|भविष्यफल|पूर्वानुमान|अनुमान|कल का|अगले?\s*(हफ्ता|सप्ताह)|forecast|project/i], handler: hiForecast },
  { patterns: [/सीपीआई|तुलना|बेंचमार्क|के मुकाबले|cpi/i], handler: hiCompareCpi },
  { patterns: [/क्यों|किसलिए|बढ़ा|गिरा|घटा|एटीएफ|ईंधन|त्योहार|दिवाली|समिट|spike|fuel/i], handler: hiEvents },
  { patterns: [/2012|2024|आधार वर्ष|आधार पर|री-?इंडेक्स|बेस/], handler: hiBaseYear },
  { patterns: [/7\s*दिन|सप्ताह|हफ्ता|हफ़्ता|महीना|महीने|तिमाही|पूरा इतिहास|समय-?सीमा|horizon|week|month/i], handler: hiSetHorizon },
  { patterns: [/राष्ट्रीय|समग्र|सभी गलियारे|national/i], handler: hiNational },
  { patterns: [/हीटमैप|गर्म|ठंडा|क्रम|सबसे तेज़|ranking|hot/i], handler: hiHeatmap },
  { patterns: [/लास्पेयर्स|कार्यप्रणाली|कैसे (गणना|निकाल)|टोकरी|कोआईसीओपी|सूत्र|methodolog|laspeyres|basket/i], handler: hiMethodology },
  { patterns: [/वर्तमान|अभी|अभी का|आज का|कितना है|क्या है|current|latest/i], handler: hiCurrentIndex },
  { patterns: [/दिखाओ|अलग करो|स्विच|जाओ|दृश्य|show|isolate/i], handler: hiScopeSwitch },
];

/**
 * Hindi entry point. Tries the Hindi intent engine first; if nothing matches
 * (e.g. an English phrase typed while in हिंदी mode), falls back to the
 * English engine so the assistant is never speechless.
 */
export function respondToHindi(message: string, ctx: AssistantContext): AssistantReply {
  const normalized = message.trim();
  for (const intent of HI_INTENTS) {
    if (intent.patterns.some((p) => p.test(normalized))) {
      return intent.handler(normalized, ctx);
    }
  }
  // No Hindi intent matched — if the text is actually English, route there.
  if (/[\u0900-\u097F]/.test(normalized)) return hiFallback(normalized, ctx);
  return respondTo(normalized, ctx);
}

/** True when the text contains Devanagari — used to pick the reply language. */
export function isDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}
