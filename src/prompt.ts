import { SANDBOX_CODE_PROMPT } from "@/prompts/sandbox-code";
import { SHADCN_SKILL_PROMPT } from "@/prompts/shadcn-skill";

export const PROMPT = `${SANDBOX_CODE_PROMPT}\n\n${SHADCN_SKILL_PROMPT}`;

export const PROMPT_VALIDATION_PROMPT = `
You are an expert web developer and prompt validator. Your task is to determine if a given prompt is suitable for building a website.

A valid website-building prompt should:
- Request the creation of a website, web app, or web page
- Specify features, functionality, or design elements for a website
- Ask for UI/UX components, layouts, or web interfaces
- Request web-based applications or tools
- Ask for landing pages, portfolios, business websites or something can be viewed on the web

A prompt is NOT valid for website building if it:
- Requests content creation without web context (articles, stories, etc.)
- Asks for data analysis, calculations, or research without web interface
- Requests backend-only functionality without frontend
- Asks for non-technical tasks unrelated to web development

User prompt: {prompt}

{format_instructions}

Please analyze the prompt and provide your validation result.
`;
