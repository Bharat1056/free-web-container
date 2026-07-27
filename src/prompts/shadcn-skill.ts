export const SHADCN_SKILL_PROMPT = `
Shadcn/ui Grounding Rules:
- The sandbox already contains a shadcn project with components.json at /home/user/components.json.
- Use live shadcn CLI data instead of memory whenever you touch shadcn UI.
- Before writing UI that imports from "@/components/ui/*", first ground yourself with this workflow:
  1. Run \`terminal\` with \`cd /home/user && npx shadcn@latest info --json\`
  2. Check which components are already installed from that JSON output.
  3. If you need a component or block and are not certain of its API, run \`cd /home/user && npx shadcn@latest docs <component names>\`
  4. If you need to discover the right item, run \`cd /home/user && npx shadcn@latest search @shadcn -q "<query>"\`
  5. If a required component is missing, install it with \`cd /home/user && npx shadcn@latest add <component names> --yes\`
  6. Read the installed source files with \`readFiles\` before composing with them.
- Never guess shadcn props, variants, slots, or composition patterns.
- Never import a shadcn component unless it already exists in the project or you installed it with the CLI in this run.
- Before any \`createOrUpdateFiles\` call that imports from "@/components/ui/*", you MUST have run \`docs\` or \`readFiles\` for each imported shadcn component in that turn.

Shadcn/ui Composition Rules:
- Use existing components before custom markup.
- Compose, do not reinvent. Settings page = Tabs + Card + form controls. Dashboard = Sidebar + Card + Table/Chart.
- Use built-in variants before custom styling.
- Use semantic tokens like \`bg-background\`, \`text-foreground\`, \`text-muted-foreground\`, \`bg-primary\`. Avoid raw palette classes when a semantic token exists.
- Prefer \`gap-*\` over \`space-x-*\` / \`space-y-*\`.
- Use \`size-*\` when width and height are equal.
- Use \`truncate\` instead of manually composing text-ellipsis utilities.
- Use \`cn\` from "@/lib/utils" for conditional classes.
- Use \`Badge\`, \`Alert\`, \`Empty\`, \`Separator\`, and \`Skeleton\` instead of hand-rolled lookalikes.

Shadcn/ui Form and Structure Rules:
- For forms, prefer shadcn form primitives already present in the project.
- Option sets with a handful of choices should prefer \`ToggleGroup\` rather than manually styled button rows.
- Dialog, Sheet, and Drawer must include a title for accessibility.
- Use full Card composition: CardHeader, CardTitle, CardDescription, CardContent, and CardFooter where appropriate.
- TabsTrigger must live inside TabsList.
- Avatar should include AvatarFallback.
- Respect the actual project aliases, icon library, and installed components from \`shadcn info --json\`.

Useful shadcn CLI commands:
- \`cd /home/user && npx shadcn@latest info --json\`
- \`cd /home/user && npx shadcn@latest search @shadcn -q "sidebar"\`
- \`cd /home/user && npx shadcn@latest docs button dialog card\`
- \`cd /home/user && npx shadcn@latest add button dialog --yes\`
`;
