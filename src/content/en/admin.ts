import type { Dictionary } from "@/content/es";

export const admin: Dictionary["admin"] = {
  categories: {
    add: {
      pending: "Adding…",
      submit: "Add",
      title: "New category",
    },
    count: "{count} articles",
    countOne: "1 article",
    delete: {
      action: "Delete: {name}",
      confirm: "Delete category",
      description: "“{name}” will be deleted. This cannot be undone.",
      moveLabel: "Move its articles to",
      movePlaceholder: "Choose a category",
      moveRequired: "Choose which category its articles move to.",
      onlyOne:
        "It is the only category and it has articles. Add another one to move them to before deleting it.",
      title: "Delete the category?",
      withArticles:
        "“{name}” has {count}. Choose where they move before deleting it.",
    },
    description:
      "The order of this list is the order of the home's sliders and the catalog's filter.",
    edit: {
      action: "Rename: {name}",
      cancel: "Cancel",
      pending: "Saving…",
      submit: "Save",
    },
    empty: "No categories yet. Add the first one above.",
    errors: {
      duplicate: "This store already has a category with that name.",
      generic: "We could not save the change. Try again.",
      load: "We could not load the categories.",
      nameRequired: "Write the name in Spanish.",
      nameTooLong: "Use up to 60 characters.",
    },
    fields: {
      nameEn: "Name in English (optional)",
      nameEnHint: "Left empty, the Spanish name shows in English.",
      nameEs: "Name in Spanish",
    },
    list: "The store's categories",
    move: {
      down: "Move down: {name}",
      drag: "Drag to reorder: {name}",
      moved: "“{name}” is now in place {position} of {total}.",
      up: "Move up: {name}",
    },
    title: "Categories",
    toasts: {
      created: "Category added.",
      deleted: "Category deleted.",
      renamed: "Category renamed.",
    },
  },
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
