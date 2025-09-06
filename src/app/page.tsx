import { caller } from "@/trpc/server";

export default async function Page() {
  const data = await caller.hello({ text: "Antonio server" });
  console.log(data.greeting);
  return <div className="font-bold">Hello World</div>;
}
