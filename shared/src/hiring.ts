export const stages = [
  "applied",
  "screening",
  "interview",
  "final_interview",
  "offer",
  "hired",
  "rejected",
] as const;
export type Stage = (typeof stages)[number];
export const stageLabel = (value: string) =>
  ({
    applied: "Applied",
    screening: "Screening",
    interview: "Interview",
    final_interview: "Final interview",
    offer: "Offer",
    hired: "Hired",
    rejected: "Not selected",
    withdrawn: "Withdrawn",
  })[value] || value;
export const nextStages = (current: string) =>
  ["hired", "rejected"].includes(current)
    ? []
    : stages.filter(
        (stage) =>
          stage === "rejected" ||
          stages.indexOf(stage) > stages.indexOf(current as Stage),
      );
export const MAX_CV_BYTES = 5 * 1024 * 1024;
