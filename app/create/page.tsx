import type { Metadata } from "next";
import { CreateFlow } from "@/components/create/CreateFlow";

export const metadata: Metadata = { title: "Create a Word Hug" };

export default function CreatePage() {
  return (
    <main className="min-h-dvh">
      <CreateFlow />
    </main>
  );
}
