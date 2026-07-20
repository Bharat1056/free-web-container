import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  codeAgentFunction,
  handleGenerationCancelled,
  handleGenerationFailed,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    codeAgentFunction,
    handleGenerationFailed,
    handleGenerationCancelled,
  ],
});
