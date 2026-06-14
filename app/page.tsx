import { ActivitySidebar } from "@/components/ActivitySidebar";
import { MapScene } from "@/components/MapScene";

export default function Home() {
  return (
    <main className="app-shell">
      <MapScene />
      <ActivitySidebar />
    </main>
  );
}
