import { ActivitySidebar } from "@/components/ActivitySidebar";
import { MapCompassControl } from "@/components/MapCompassControl";
import { MapScene } from "@/components/MapScene";

export default function Home() {
  return (
    <main className="app-shell">
      <MapScene />
      <MapCompassControl />
      <ActivitySidebar />
    </main>
  );
}
