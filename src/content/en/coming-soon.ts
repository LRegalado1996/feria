import type { Dictionary } from "@/content/es";

export const comingSoon: Dictionary["comingSoon"] = {
  bubbles: "LR Market: make bubbles",
  countdown: {
    many: "days until the fair",
    one: "day until the fair",
  },
  eyebrow: "Christmas fair · December 5 to January 5",
  lead: "Jewelry and bubble guns. We are setting up the store: follow us and find out when it opens.",
  manage: {
    back: "Back to Settings",
    confirm: {
      confirm: "Yes, publish",
      description:
        "While it is published, the public sees nothing of the store: every address leads to this page. You will still see the store because you are signed in.",
      title: "Publish the coming-soon page?",
    },
    countdown: "Countdown",
    countdownHint: "Left empty, it counts to December 5, when the fair opens.",
    description:
      "The page the public sees while the store is closed: the line over the headline, the headline, the text, the band and the countdown. The logo stays as it is, and the social links are the ones in Settings.",
    errors: {
      dateInvalid: "Pick a day between 2026 and 2100.",
      eyebrowTooLong: "Use up to 80 characters.",
      headlineTooLong: "Use up to 50 characters.",
      headlineTooManyLines: "Use up to 2 lines.",
      leadTooLong: "Use up to 240 characters.",
      load: "We could not load the coming-soon page.",
      marqueeTooLong: "Use up to 120 characters.",
      marqueeTooManyLines: "Use up to 4 phrases.",
      publish:
        "We could not change the page's state. It is as it was: try again.",
      save: "We could not save the texts. What you wrote is still here: try again.",
    },
    fields: {
      countdownTo: "Count the days until",
      eyebrowEn: "Line over the headline, in English",
      eyebrowEs: "Line over the headline, in Spanish",
      eyebrowHint:
        "The fair and its dates: if you change the countdown, make it say the same.",
      headlineEn: "Headline in English",
      headlineEs: "Headline in Spanish",
      headlineHint:
        "Up to 2 lines: each one is a line of the headline, and the second is highlighted.",
      leadEn: "Text under the headline, in English",
      leadEs: "Text under the headline, in Spanish",
      marqueeEn: "Moving band, in English",
      marqueeEs: "Moving band, in Spanish",
      marqueeHint:
        "One phrase per line, up to 4. It always starts with the store's name.",
    },
    pending: "Saving…",
    preview: "View the page",
    saved: "Texts saved.",
    status: {
      delay: "The change reaches the whole public within a few seconds.",
      heading: "State",
      publish: "Publish the page",
      published: "Published",
      publishedHint:
        "The store is closed to the public: every address leads to this page. You still see it while signed in.",
      publishedToast: "Page published: the store is closed to the public.",
      publishing: "Publishing…",
      unpublish: "Open the store",
      unpublished: "Not published",
      unpublishedHint:
        "The store is open: the public sees all of it and this page does not show.",
      unpublishedToast: "The store is open to the public.",
      unpublishing: "Opening…",
    },
    submit: "Save texts",
    texts: { en: "Texts in English", es: "Texts in Spanish" },
    textsHint:
      "Leave a text empty and the page says the usual one, the one you see in grey.",
    title: "Coming soon",
  },
  marquee: {
    dates: "Dec 5 to Jan 5",
    fair: "Christmas fair",
    products: "Jewelry and bubble guns",
  },
  metaDescription:
    "LR Market opens soon: jewelry and bubble guns, at the Christmas fair from December 5 to January 5 and online.",
  metaTitle: "Opening soon · LR Market",
  previewNotice: {
    link: "Manage the coming-soon page",
    message:
      "The store is closed to the public. You see it because you are signed in.",
    short: "Store closed.",
  },
  settingsCard: {
    description:
      "The page the public sees while the store is closed, and the button to publish it or open the store.",
    link: "Manage the coming-soon page",
    title: "Coming soon",
  },
  social: {
    instagram: "Follow us on Instagram",
    tiktok: "Follow us on TikTok",
  },
  title: { lineOne: "Opening", lineTwo: "soon" },
};
