// Results of clinical concern, shown on the final results screen with a pointer to support (FR8).
//
//  Only questionnaires with a validated cut-off raise one: ISI 15 or more (moderate or severe insomnia),
//  LSNS-6 below 12 (risk of social isolation), AUDIT-C 4 or more (hazardous drinking), and current
//  smoking. The PSS-10 has no formal clinical cut-off, so stress never raises one. The wording keeps the
//  screen a wellbeing screen: it says what the answers suggest and where to get help, never a diagnosis.

export type ConcernId = "insomnia" | "isolation" | "hazardousDrinking" | "smoking";

export const CONCERN_TEXT: Record<ConcernId, string> = {
  insomnia:
    "Your sleep answers suggest moderate or severe insomnia. If poor sleep is affecting your days, please speak to a doctor.",
  isolation:
    "Your answers suggest you may be at risk of social isolation. Staying in touch with people matters for health, and a doctor can point you to local support.",
  hazardousDrinking:
    "Your answers suggest drinking at a level that can harm health. Cutting down has real benefits, and a doctor can help you do it.",
  smoking:
    "You currently smoke. Stopping is one of the biggest things you can do for your health, and a doctor or a quit service can help.",
};

export const CONCERN_ORDER: ConcernId[] = ["insomnia", "isolation", "hazardousDrinking", "smoking"];
