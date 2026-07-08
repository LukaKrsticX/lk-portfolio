export interface CaseStudy {
  slug: string;
  title: string;
  role: string;
  year: string;
  story: { broken: string; did: string; result: string };
  url: string;
  capture: string;
  tags: string[];
}

export interface Service {
  key: "rescue" | "build" | "automation";
  title: string;
  blurb: string;
}

export interface SiteContent {
  meta: { title: string; description: string };
  positioning: string;
  services: Service[];
  agencies: {
    whiteLabel: string;
    timezone: string;
    cadence: string;
    capacity: string;
    mapping: string;
  };
  cases: CaseStudy[];
  about: string;
  contact: { email: string; privacyNote: string };
}
