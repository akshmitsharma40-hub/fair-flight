/**
 * i18n.ts — English/Hindi chrome dictionary for the dashboard masthead,
 * controls, section headers, KPI labels, legends, and footers. Chart bodies
 * stay bilingual-neutral (numbers, route codes, and tick labels are already
 * Latin); only authored copy is translated so the institutional look is
 * preserved. Consumed via the LangContext provider (App.tsx) + useT() hook.
 */

import { createContext, useCallback, useContext } from "react";

export type Lang = "en" | "hi";

const STRINGS = {
  en: {
    // Masthead + header actions
    mastheadTitle: "FAIR FLIGHT",
    mastheadSub: "National Airfare Price Index (APIx) · Real-time Laspeyres for CPI augmentation · MoSPI/RBI · COICOP-2018 Division 07 · Base Year 2024=100",
    commands: "Commands",
    refresh: "Refresh",
    downloadCsv: "Download CSV",
    bulletin: "Bulletin PDF",
    liveApi: "Live API",
    embeddedSnapshot: "Embedded snapshot",
    // Ribbons + footer
    experimentalRibbon: "Experimental series — not for official citation",
    ghActionsRibbon: "Daily publication via GitHub Actions · 05:30 IST",
    footerMethod: "Method: fixed-basket Laspeyres",
    footerRouteWeights: "Route weights",
    footerWindowWeights: "Window weights",
    footerSeriesDate: "Series date",
    footerPoC: "Proof-of-concept for MoSPI e-Sankhyiki integration",
    // Controls
    indexBase: "Index Base",
    horizon: "Horizon",
    sector: "Sector",
    national: "National Aggregate (Weighted)",
    nationalHint: "Laspeyres 5-corridor",
    baseCurrentHint: "Current MoSPI mandate",
    baseLegacyHint: "Legacy series (×1.18 re-index)",
    weightLabel: "w",
    // KPI strip
    kpiCurrent: "Current APIx",
    kpiApixShort: "APIx",
    kpiDod: "DoD Shift",
    kpiBaseYear: "Base Year",
    kpiWindowTrend: "Window Trend",
    kpiBasketWeight: "DGCA Basket Weight",
    kpiBasket: "Basket",
    kpiVsCpi: "vs CPI",
    kpiAvgFare: "Avg fare",
    kpiIsolatedView: "isolated corridor view",
    kpiFirmingDod: "Fares firming day-over-day",
    kpiSofteningDod: "Fares softening day-over-day",
    kpiCorridorFirming: "Corridor firming day-over-day",
    kpiCorridorSoftening: "Corridor softening day-over-day",
    kpiMospiAnchor: "MoSPI anchor",
    kpiCoicopDiv: "COICOP-2018 Div",
    kpiReindexed: "Re-indexed ×1.18",
    kpiPeak: "Peak",
    kpiTrough: "Trough",
    kpiCorridors: "corridors",
    kpiOfNationalBasket: "of national basket",
    // Index chart
    chartTitle: "APIx Time Series",
    chartSub: "Laspeyres index, Base",
    chartEventAnnotated: "event-annotated",
    chartProjection7d: "7-day projection · 95% band",
    chartForward: "7-day forward forecast",
    legendObserved: "Observed",
    legendForecast: "Forecast",
    legendBand: "95% band",
    legendEvents: "Macro events",
    chartFootAic: "projection · AIC-selected · shaded 95% prediction band",
    chartFootPlain: "7-day forward projection · shaded 95% prediction band",
    ttForecast: "Forecast",
    ttApix: "APIx",
    ttInterval: "95% interval",
    ttOfficialCpi: "Official CPI",
    ttBasket: "Weighted basket",
    ttDod: "DoD shift",
    // Airline contribution
    airlinesTitle: "Airline Contribution",
    airlinesSub: "Market-share weighted fare movement",
    airlinesTopMover: "Top mover",
    airlinesShare: "share",
    airlinesFareMove: "Fare movement:",
    airlinesMarketShare: "market share",
    airlinesFoot: "Shares: DGCA seat-capacity proxy · movements scaled from the active slice trend",
    airlinesCarriers: "carriers under watch",
    // Corridor map
    mapTitle: "Corridor Network",
    mapSub: "Arc thickness = DGCA traffic weight · color = day-over-day heat · click to isolate",
    mapOfCorridors: "of 5 corridors",
    mapHot: "hot > +2%",
    mapWarm: "warm > +0.5%",
    mapSteady: "steady",
    mapCool: "cool ≤ −1%",
    mapClickHint: "Click a corridor (or again to clear)",
    mapProjectionHint: "GC-arc projection, not to survey scale",
    // Policy simulator
    policyTitle: "Policy Simulator",
    policySub: "Scenario shocks fed through the ARIMA path · CPI pass-through",
    policyReset: "Reset",
    policyAtfShock: "ATF price shock",
    policyDemand: "Demand shift",
    policyGst: "GST / levy change",
    policyApixDelta: "APIx Δ",
    policyCpiPass: "CPI pass-through",
    policyFareMult: "Fare multiplier",
    policyPresetAtf: "ATF +15%",
    policyPresetFestive: "Festive demand +8%",
    policyPresetGst: "GST +2pp",
    policyPresetCombined: "Combined shock",
    policyPresetRelief: "Relief: ATF −10%",
    policyFoot: "Headline CPI pass-through = ΔAPIx% × airfare weight (0.61% of CPI-2024 basket)",
    policyNotified: "Notified",
    // Sector heatmap
    heatTitle: "Sector Heatmap",
    heatSub: "Day-over-day fare heat by corridor × booking window · click a row to isolate the sector",
    // Research + alerts + playground
    researchTitle: "Model Research",
    researchSub: "Walk-forward accuracy · weekly seasonality · index-family comparison",
    alertsTitle: "Alert Center",
    alertsSub: "DoD move beyond ±3% · APIx level beyond ±15% of par",
    playgroundTitle: "Institutional API Playground",
    playgroundSub: "e-Sankhyiki-style endpoints · COICOP-2018 tagged responses",
    // Time travel
    backToLive: "Back to live",
    shareView: "Share view",
    linkCopied: "Link copied",
    today: "today",
    tour: "Guided tour",
    live: "Live",
    timeTravel: "Time travel",
    routesMonitored: "Routes Monitored",
    decomposition: "Fare Decomposition",
    decompSub: "Base fare vs taxes & fees (GST, UDF, PSF, fuel surcharge) · weighted window average",
    telemetry: "Scraper Telemetry",
    baseYearLabel: "Base Year",
    currentIndex: "Current APIx",
    timeSeries: "APIx Time Series",
    corridorNetwork: "Corridor Network",
    policySimulator: "Policy Simulator",
    research: "Model Research",
    alerts: "Alert Center",
  },
  hi: {
    mastheadTitle: "फेयर फ्लाइट",
    mastheadSub: "राष्ट्रीय हवाई किराया सूचकांक (एपीआईएक्स) · सीपीआई संवर्धन हेतु वास्तविक-समय लास्पेयर्स सूचकांक · मोआंसपी/आरबीआई · सीओआईसीओपी-2018 विभाग 07 · आधार वर्ष 2024=100",
    commands: "कमांड्स",
    refresh: "रिफ्रेश",
    downloadCsv: "सीएसवी डाउनलोड",
    bulletin: "बुलेटिन पीडीएफ",
    liveApi: "लाइव एपीआई",
    embeddedSnapshot: "एम्बेडेड स्नैपशॉट",
    experimentalRibbon: "प्रयोगात्मक श्रृंखला — आधिकारिक उद्धरण हेतु नहीं",
    ghActionsRibbon: "GitHub Actions द्वारा दैनिक प्रकाशन · 05:30 IST",
    footerMethod: "विधि: निश्चित-टोकरी लास्पेयर्स",
    footerRouteWeights: "मार्ग भार",
    footerWindowWeights: "अवधि भार",
    footerSeriesDate: "श्रृंखला तिथि",
    footerPoC: "मोआंसपी ई-संख्यिकी एकीकरण हेतु प्रारूप-प्रदर्शन",
    indexBase: "सूचकांक आधार",
    horizon: "समय-सीमा",
    sector: "क्षेत्र",
    national: "राष्ट्रीय समुच्चय (भारित)",
    nationalHint: "लास्पेयर्स 5-गलियारा",
    baseCurrentHint: "वर्तमान मोआंसपी जनादेश",
    baseLegacyHint: "विरासत श्रृंखला (×1.18 पुनः-सूचकांकन)",
    weightLabel: "भार",
    kpiCurrent: "वर्तमान एपीआईएक्स",
    kpiApixShort: "एपीआईएक्स",
    kpiDod: "दिन-आधारित बदलाव",
    kpiBaseYear: "आधार वर्ष",
    kpiWindowTrend: "विंडो रुझान",
    kpiBasketWeight: "डीजीसीए टोकरी भार",
    kpiBasket: "टोकरी",
    kpiVsCpi: "बनाम सीपीआई",
    kpiAvgFare: "औसत किराया",
    kpiIsolatedView: "अलग किया गया गलियारा दृश्य",
    kpiFirmingDod: "किराया दिन-दर-दिन मज़बूत",
    kpiSofteningDod: "किराया दिन-दर-दिन कमज़ोर",
    kpiCorridorFirming: "गलियारा दिन-दर-दिन मज़बूत",
    kpiCorridorSoftening: "गलियारा दिन-दर-दिन कमज़ोर",
    kpiMospiAnchor: "मोआंसपी एंकर",
    kpiCoicopDiv: "कोआईसीओपी-2018 विभाग",
    kpiReindexed: "पुनः-सूचकांकन ×1.18",
    kpiPeak: "उच्चतम",
    kpiTrough: "निम्नतम",
    kpiCorridors: "गलियारे",
    kpiOfNationalBasket: "राष्ट्रीय टोकरी का",
    chartTitle: "एपीआईएक्स समय श्रृंखला",
    chartSub: "लास्पेयर्स सूचकांक, आधार",
    chartEventAnnotated: "घटना-अंकित",
    chartProjection7d: "7-दिन अनुमान · 95% बैंड",
    chartForward: "7-दिन अग्रिम पूर्वानुमान",
    legendObserved: "प्रेक्षित",
    legendForecast: "पूर्वानुमान",
    legendBand: "95% बैंड",
    legendEvents: "समष्टि घटनाएँ",
    chartFootAic: "अनुमान · एआईसी-चयनित · छायांकित 95% पूर्वानुमान बैंड",
    chartFootPlain: "7-दिन अग्रिम अनुमान · छायांकित 95% पूर्वानुमान बैंड",
    ttForecast: "पूर्वानुमान",
    ttApix: "एपीआईएक्स",
    ttInterval: "95% अंतराल",
    ttOfficialCpi: "आधिकारिक सीपीआई",
    ttBasket: "भारित टोकरी",
    ttDod: "दिन-आधारित बदलाव",
    airlinesTitle: "एयरलाइन योगदान",
    airlinesSub: "बाज़ार-हिस्सा भारित किराया बदलाव",
    airlinesTopMover: "शीर्ष स्थानांतरक",
    airlinesShare: "हिस्सा",
    airlinesFareMove: "किराया बदलाव:",
    airlinesMarketShare: "बाज़ार हिस्सा",
    airlinesFoot: "हिस्से: डीजीसीए सीट-क्षमता प्रॉक्सी · सक्रिय स्लाइस रुझान से स्केल किए गए बदलाव",
    airlinesCarriers: "वाहक निगरानी में",
    mapTitle: "गलियारा नेटवर्क",
    mapSub: "चाप मोटाई = डीजीसीए यातायात भार · रंग = दिन-आधारित गर्मी · अलग करने हेतु क्लिक करें",
    mapOfCorridors: "में से 5 गलियारे",
    mapHot: "गर्म > +2%",
    mapWarm: "ऊष्ण > +0.5%",
    mapSteady: "स्थिर",
    mapCool: "ठंडा ≤ −1%",
    mapClickHint: "गलियारे पर क्लिक करें (फिर से करने पर साफ़)",
    mapProjectionHint: "GC-चाप प्रक्षेपण, सर्वेक्षण पैमाने पर नहीं",
    policyTitle: "नीति सिम्युलेटर",
    policySub: "एआरआईएमए पथ से गुज़रने वाले परिदृश्य-झटके · सीपीआई पारगमन",
    policyReset: "रीसेट",
    policyAtfShock: "एटीएफ मूल्य झटका",
    policyDemand: "मांग बदलाव",
    policyGst: "जीएसटी / उपकर बदलाव",
    policyApixDelta: "एपीआईएक्स Δ",
    policyCpiPass: "सीपीआई पारगमन",
    policyFareMult: "किराया गुणक",
    policyPresetAtf: "एटीएफ +15%",
    policyPresetFestive: "त्योहारी मांग +8%",
    policyPresetGst: "जीएसटी +2pp",
    policyPresetCombined: "संयुक्त झटका",
    policyPresetRelief: "राहत: एटीएफ −10%",
    policyFoot: "सीपीआई पारगमन = Δएपीआईएक्स% × हवाई किराया भार (सीपीआई-2024 टोकरी का 0.61%)",
    policyNotified: "अधिसूचित",
    heatTitle: "क्षेत्र हीटमैप",
    heatSub: "गलियारा × बुकिंग अवधि के अनुसार दिन-आधारित किराया गर्मी · क्षेत्र अलग करने हेतु पंक्ति पर क्लिक करें",
    researchTitle: "मॉडल अनुसंधान",
    researchSub: "वॉक-फॉरवर्ड सटीकता · साप्ताहिक मौसमी विभिन्नता · सूचकांक-परिवार तुलना",
    alertsTitle: "अलर्ट केंद्र",
    alertsSub: "±3% से अधिक दिन-आधारित चाल · समतल से ±15% बाहर एपीआईएक्स",
    playgroundTitle: "संस्थागत एपीआई प्लेग्राउंड",
    playgroundSub: "ई-संख्यिकी-शैली एंडपॉइंट · सीओआईसीओपी-2018 टैग किए गए उत्तर",
    backToLive: "लाइव पर लौटें",
    shareView: "व्यू साझा करें",
    linkCopied: "लिंक कॉपी हुआ",
    today: "आज",
    tour: "निर्देशित यात्रा",
    live: "लाइव",
    timeTravel: "समय यात्रा",
    routesMonitored: "मानिटर किए गए मार्ग",
    decomposition: "किराया वियोजन",
    decompSub: "आधार किराया बनाम कर व शुल्क (जीएसटी, यूडीएफ, पीएसएफ, ईंधन उपचार्ज) · भारित अवधि औसत",
    telemetry: "स्क्रैपर टेलीमेट्री",
    baseYearLabel: "आधार वर्ष",
    currentIndex: "वर्तमान एपीआईएक्स",
    timeSeries: "एपीआईएक्स समय श्रृंखला",
    corridorNetwork: "गलियारा नेटवर्क",
    policySimulator: "नीति सिम्युलेटर",
    research: "मॉडल अनुसंधान",
    alerts: "अलर्ट केंद्र",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["en"];

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[lang][key] ?? STRINGS.en[key];
}

/* ------------------------------------------------------------------------- */
/* Language context — App provides { lang, setLang }; components use useT(). */
/* ------------------------------------------------------------------------- */

export interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const LangContext = createContext<LangContextValue>({ lang: "en", setLang: () => {} });

export function useLang(): LangContextValue {
  return useContext(LangContext);
}

/** Bound translator for the active language: const tr = useT(); tr("kpiDod") */
export function useT(): (key: StringKey) => string {
  const { lang } = useLang();
  return useCallback((key: StringKey) => t(lang, key), [lang]);
}

const STORAGE_KEY = "apix-lang";

export function readLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "hi") return stored;
  } catch {
    // private mode — default below
  }
  return "en";
}

export function writeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // non-fatal
  }
}
