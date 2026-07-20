import { z } from "zod/v3"; // LangChain structured output expects Zod 3 shapes (project uses Zod 4).

export const DecisionSchema = z.object({
  route: z
    .enum(["ENHANCE", "CODE"])
    .describe(
      "ENHANCE for new websites or major features; CODE for modifications and fixes",
    ),
  reason: z
    .string()
    .min(5)
    .max(200)
    .describe("Brief justification for the routing decision"),
});

export const WebsiteDesignSpecSchema = z.object({
  goal: z
    .string()
    .min(20)
    .max(400)
    .describe("Primary user or business goal for the website"),
  sections: z
    .array(
      z.object({
        name: z.string().min(2).describe("Section or page area name"),
        requirements: z
          .array(z.string().min(8))
          .min(2)
          .describe("Concrete UI/UX requirements for this section"),
      }),
    )
    .min(4)
    .max(12)
    .describe("Page sections with actionable design requirements"),
  uxPrinciples: z
    .array(z.string().min(5))
    .min(2)
    .max(8)
    .describe("UX principles guiding the design"),
  accessibility: z
    .array(z.string().min(5))
    .min(1)
    .max(6)
    .describe("Accessibility requirements"),
  responsive: z
    .array(z.string().min(5))
    .min(1)
    .max(6)
    .describe("Responsive and mobile requirements"),
  performance: z
    .array(z.string().min(5))
    .min(1)
    .max(6)
    .optional()
    .describe("Performance and loading requirements"),
});

export type DecisionResult = z.infer<typeof DecisionSchema>;
export type WebsiteDesignSpec = z.infer<typeof WebsiteDesignSpecSchema>;

export const EditIntentSchema = z.object({
  instruction: z
    .string()
    .min(10)
    .max(2000)
    .describe(
      "One concrete coding instruction for the existing project (1–4 sentences, no design specs or bullet lists)",
    ),
});

export type EditIntentResult = z.infer<typeof EditIntentSchema>;

export const MessageIntentSchema = z.object({
  intent: z
    .enum(["CONTINUATION", "INSTRUCTION"])
    .describe(
      "CONTINUATION when the user only wants to resume/retry/finish without a new request; INSTRUCTION when they give a concrete build or edit request",
    ),
  reason: z
    .string()
    .min(5)
    .max(200)
    .describe("Brief justification for the classification"),
});

export const EffectivePromptSchema = z.object({
  effectivePrompt: z
    .string()
    .min(3)
    .max(4000)
    .describe(
      "The substantive user prompt to run the build pipeline with — either the latest message or the resolved task from history",
    ),
  reason: z
    .string()
    .min(5)
    .max(200)
    .describe("Brief explanation of how the effective prompt was chosen"),
});

export type MessageIntentResult = z.infer<typeof MessageIntentSchema>;
export type EffectivePromptResult = z.infer<typeof EffectivePromptSchema>;
