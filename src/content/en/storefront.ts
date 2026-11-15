import type { Dictionary } from "@/content/es";

export const storefront: Dictionary["storefront"] = {
  articleCard: {
    badgeNew: "New",
    badgeSale: "Price drop",
    noImage: "No photo",
  },
  marquee: {
    pause: "Pause the moving band",
  },
  price: {
    previous: "Was {price}",
  },
  shell: {
    cartCount: "Cart, {count} items",
    cartCountOne: "Cart, 1 item",
    cartEmpty: "Cart, empty",
    catalog: "Catalog",
    closeMenu: "Close the menu",
    credit: "Made by Lucas Regalado",
    error: {
      body: "Something failed while showing this page. Try again; if it keeps happening, write to us.",
      retry: "Try again",
      title: "We could not show this page",
    },
    footer: "Store footer",
    home: "Home",
    instagram: "{store} on Instagram",
    menu: "Menu",
    navigation: "Store sections",
    newTab: "(opens in a new tab)",
    notFound: {
      back: "Back to the store's home",
      body: "The link may be old, or that article may be gone.",
      title: "We could not find this page",
    },
    search: "Search the store",
    searchPlaceholder: "Search…",
    searchSubmit: "Search",
    skipToContent: "Skip to content",
    tiktok: "{store} on TikTok",
    whatsapp: "Write to us on WhatsApp",
  },
  slider: {
    next: "Next",
    position: "{current} / {total}",
    previous: "Previous",
  },
};
