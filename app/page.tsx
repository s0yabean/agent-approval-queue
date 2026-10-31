import QueueApp from "@/components/QueueApp";
import { listDrafts } from "@/lib/queue";

export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    return <QueueApp initialItems={await listDrafts()} />;
  } catch (error) {
    return (
      <main className="fatal">
        <h1>Queue store unavailable</h1>
        <p>{error instanceof Error ? error.message : String(error)}</p>
      </main>
    );
  }
}
