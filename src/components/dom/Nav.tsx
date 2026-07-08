import { site } from "@/content/site";

const ITEMS = [
  { href: "#work", label: "Work" },
  { href: "#services", label: "Services" },
  { href: "#contact", label: "Contact" },
];

export function Nav() {
  return (
    <nav
      aria-label="Main"
      style={{
        position: "sticky", top: 16, zIndex: 10, display: "flex", gap: 20,
        flexWrap: "wrap", rowGap: 8,
        justifyContent: "flex-end", padding: "8px 24px",
      }}
    >
      <span className="mono" style={{ marginRight: "auto" }}>{site.meta.title}</span>
      {ITEMS.map((i) => (
        <a key={i.href} href={i.href} className="mono">{i.label}</a>
      ))}
    </nav>
  );
}
