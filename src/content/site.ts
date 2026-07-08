import type { SiteContent } from "./types";

export const site: SiteContent = {
  meta: {
    title: "Luka Krstić — creative developer",
    description:
      "I build, rescue and stand behind websites in the AI era. Webflow and code, from Belgrade, working with US/UK agencies.",
  },
  positioning: "I build, rescue and stand behind websites in the AI era.",
  services: [
    {
      key: "rescue",
      title: "AI-site rescue",
      blurb:
        "Sites started with AI tools and abandoned at 80%. I finish the last mile: broken links, forms, tracking, performance — and I stand behind the result.",
    },
    {
      key: "build",
      title: "Premium builds",
      blurb:
        "Webflow or code, built to be maintained. Semantic, fast, measured from day one.",
    },
    {
      key: "automation",
      title: "Automation & AI integrations",
      blurb:
        "Forms that reach inboxes, reports that write themselves, AI where it earns its keep — not where it demos well.",
    },
  ],
  agencies: {
    whiteLabel: "White-label by default. NDA-friendly. Your client never sees my name.",
    timezone: "Belgrade: UK +1h, US-East +6h — same-day overlap with both.",
    cadence: "Reply within one business day. No disappearing acts.",
    capacity: "Solo, deliberately. One or two agency engagements at a time.",
    mapping: "This site was built solo, end to end — the same discipline goes into your client work.",
  },
  cases: [
    {
      slug: "holimed",
      title: "Holimed Tim",
      role: "Build + rescue",
      year: "2020–2026",
      story: {
        broken:
          "Three of four homepage service cards led fresh visitors to a 404 — the links pointed at a dead www host.",
        did: "Repointed every card and button to the live host, cleaned staging leftovers and the malformed title tag.",
        result: "Every service reachable again; the clinic's site stopped leaking patients to error pages.",
      },
      url: "https://holimedtim.com",
      capture: "/cases/holimed.webp",
      tags: ["Webflow", "rescue", "healthcare"],
    },
    {
      slug: "cea",
      title: "CEA Medic",
      role: "Design + build",
      year: "2025",
      story: {
        broken: "A Belgrade clinic with no web presence for a modern diagnostics offer.",
        did: "Designed and shipped the full site on Webflow — structure, copy direction, visual system.",
        result: "Sold at a premium through referral; the clinic's primary digital storefront.",
      },
      url: "https://cea.rs",
      capture: "/cases/cea.webp",
      tags: ["Webflow", "build", "healthcare"],
    },
  ],
  about:
    "Luka Krstić. IT masters student and working developer in Belgrade. I ship with modern AI tooling and take responsibility for what it produces.",
  contact: {
    email: "lukakrstic2002@gmail.com",
    privacyNote: "Your name and email are used only to reply. No lists, no marketing.",
  },
};
