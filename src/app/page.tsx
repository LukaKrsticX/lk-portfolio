import { Nav } from "@/components/dom/Nav";
import { Sections } from "@/components/dom/Sections";
import { VirtualScroll } from "@/components/dom/VirtualScroll";
import { Experience } from "@/components/Experience";

export default function Home() {
  return (
    <>
      <Experience />
      {/* Nav is position:sticky — it MUST stay outside #vs-root, whose transform would
          break sticky. In virtual mode the body never scrolls, so Nav pins at its layout
          position; only #vs-root (the Sections content) rides the translate3d. */}
      <Nav />
      <div id="vs-root">
        <Sections />
      </div>
      <VirtualScroll />
    </>
  );
}
