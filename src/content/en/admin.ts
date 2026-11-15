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
      cancelled: "Move cancelled: “{name}” stayed where it was.",
      down: "Move down: {name}",
      drag: "Drag to reorder: {name}",
      instructions:
        "To reorder with the keyboard, press space on the handle, move it with the arrow keys and press space again to drop it, or Escape to cancel.",
      moved: "“{name}” is now in place {position} of {total}.",
      over: "“{name}” is over “{over}”.",
      picked: "Picked up “{name}”.",
      stayed: "“{name}” stayed where it was.",
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
  filters: {
    add: {
      pending: "Adding…",
      submit: "Add filter",
      title: "New filter",
    },
    addValue: {
      pending: "Adding…",
      submit: "Add value",
      title: "New value of “{name}”",
    },
    count: "{count} articles",
    countOne: "1 article",
    delete: {
      action: "Delete filter: {name}",
      confirm: "Delete filter",
      description:
        "“{name}” will be deleted with all its values, and they will be taken off the articles that carry them. This cannot be undone.",
      title: "Delete the filter?",
    },
    deleteValue: {
      action: "Delete value: {name}",
      confirm: "Delete value",
      inUse:
        "“{name}” is on {count}. It will be taken off those articles. This cannot be undone.",
      unused: "“{name}” will be deleted. This cannot be undone.",
      title: "Delete the value?",
    },
    description:
      "Filters help your customers find what they want, by color for example. Each filter has its own link: /your-store/products?color=dorado.",
    edit: {
      action: "Rename filter: {name}",
      cancel: "Cancel",
      pending: "Saving…",
      submit: "Save",
      valueAction: "Edit value: {name}",
    },
    empty: "No filters yet. Add the first one above, Color for example.",
    emptyValues: "This filter has no values yet.",
    errors: {
      duplicate: "There is already one with that name here.",
      generic: "We could not save the change. Try again.",
      load: "We could not load the filters.",
      nameRequired: "Write the name in Spanish.",
      nameTooLong: "Use up to 60 characters.",
    },
    fields: {
      nameEn: "Name in English (optional)",
      nameEnHint: "Left empty, the Spanish name shows in English.",
      nameEs: "Name in Spanish",
      swatch: "Swatch color",
      swatchAdd: "Add a swatch color",
      swatchHint: "A dot of this color shows beside the name.",
      swatchRemove: "Remove color",
    },
    list: "The store's filters",
    move: {
      down: "Move down: {name}",
      moved: "“{name}” is now in place {position} of {total}.",
      up: "Move up: {name}",
    },
    title: "Filters",
    toasts: {
      created: "Filter added.",
      deleted: "Filter deleted.",
      renamed: "Filter renamed.",
      valueCreated: "Value added.",
      valueDeleted: "Value deleted.",
      valueDeletedFrom: "Value deleted: taken off {count}.",
      valueUpdated: "Value saved.",
    },
    values: "Values of “{name}”",
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
    filters: "Filters",
    home: "Home",
    orders: "Orders",
    products: "Articles",
    settings: "Settings",
    users: "Users",
  },
};
