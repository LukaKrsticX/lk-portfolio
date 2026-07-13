export interface CaseStudy {
  readonly slug: string;
  readonly title: string;
  readonly role: string;
  readonly year: string;
  readonly story: { readonly broken: string; readonly did: string; readonly result: string };
  readonly url: string;
  readonly capture: string;
  readonly tags: readonly string[];
}

export interface Service {
  readonly key: "rescue" | "build" | "automation";
  readonly title: string;
  readonly blurb: string;
}

export interface FormCopy {
  readonly nameLabel: string;
  readonly emailLabel: string;
  readonly messageLabel: string;
  readonly submitLabel: string;
  readonly sending: string;
  readonly success: string;
  readonly failure: string;
  readonly required: string;
  readonly invalidEmail: string;
  readonly messageMin: string;
}

export interface SiteContent {
  readonly meta: { readonly title: string; readonly description: string };
  readonly agenciesMeta: { readonly title: string; readonly description: string };
  readonly positioning: string;
  readonly services: readonly Service[];
  readonly agencies: {
    readonly whiteLabel: string;
    readonly timezone: string;
    readonly cadence: string;
    readonly capacity: string;
    readonly mapping: string;
    readonly stack: string;
    readonly turnaround: string;
    readonly handoff: string;
  };
  readonly cases: readonly CaseStudy[];
  readonly about: string;
  readonly form: FormCopy;
  readonly contact: { readonly email: string; readonly privacyNote: string; readonly bookingUrl?: string };
}
