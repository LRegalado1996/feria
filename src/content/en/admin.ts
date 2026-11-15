import type { Dictionary } from "@/content/es";

export const admin: Dictionary["admin"] = {
  comingSoon: {
    body: "This section is still being built. It will show up here in a coming version.",
    title: "Coming soon",
  },
  landing: {
    inactive: "Inactive",
    noStoresBody:
      "Your account is not in any store yet. Ask whoever gave you access to add you to one.",
    noStoresTitle: "You don't have a store yet",
    pickBody:
      "You can work on more than one store. Which one do you want to open?",
    pickTitle: "Choose a store",
  },
  metadata: {
    title: "Admin",
  },
  platformSections: {
    metrics: "Metrics",
    stores: "Stores",
    users: "Users",
  },
  shell: {
    navigation: "Admin sections",
    platform: "Platform",
    platformNavigation: "Platform sections",
    skipToContent: "Skip to content",
    storeSwitcher: "Switch store: {store}",
    stores: "Stores",
  },
  signIn: {
    subtitle: "Sign in with the email and password you were given.",
    title: "Your store's admin",
  },
  storeSections: {
    categories: "Categories",
    home: "Home",
    orders: "Orders",
    products: "Articles",
    settings: "Settings",
    users: "Users",
  },
};
