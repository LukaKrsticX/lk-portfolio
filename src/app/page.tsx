import { Nav } from "@/components/dom/Nav";
import { Sections } from "@/components/dom/Sections";
import { SmoothScroll } from "@/components/dom/SmoothScroll";
import { Experience } from "@/components/Experience";

export default function Home() {
  return (
    <>
      <Experience />
      <Nav />
      <Sections />
      <SmoothScroll />
    </>
  );
}
