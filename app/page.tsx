import { ActivitySidebar } from "@/components/ActivitySidebar";
import { MapScene } from "@/components/MapScene";

export default function Home() {
  return (
    <main className="app-shell">
      <MapScene />
      <div className="title-lockup">
        <span>OSRS Map Prototype</span>
        <h1>The Observatory</h1>
      </div>
      <ActivitySidebar />
    </main>
  );
}
