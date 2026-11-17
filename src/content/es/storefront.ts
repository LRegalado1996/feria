export const storefront = {
  article: {
    // The moss band between the article and its suggestions, for the
    // holidays: decoration, hidden from screen readers.
    bandGreeting: "¡Felices Fiestas!",
    bandPause: "Pausar la animación",
    addedCapped:
      "Agregamos {added}: con ellos tenés {max}, el máximo por pedido.",
    addToCart: "Agregar al carrito",
    askWhatsapp: "Consultar por WhatsApp",
    askWhatsappText: "¡Hola! Te escribo por «{title}»: {url}",
    breadcrumb: "Ruta",
    catalog: "Todos los artículos",
    decrease: "Una unidad menos",
    gallery: "Fotos de {title}",
    galleryNext: "Foto siguiente",
    galleryPosition: "Foto {current} de {total}",
    galleryRestart: "Volver a la primera foto",
    home: "Inicio",
    increase: "Una unidad más",
    quantity: "Cantidad",
    related: "También te puede gustar",
    unavailable: "Agotado por ahora",
    unavailableBody:
      "No lo podés agregar al carrito ahora. Escribinos y te avisamos cuando vuelva.",
    zoom: "Ampliar la foto",
    zoomClose: "Cerrar la foto ampliada",
  },
  articleCard: {
    badgeNew: "Nuevo",
    noImage: "Sin foto",
    unavailable: "Agotado",
  },
  banner: {
    shopNow: "Comprar ahora",
  },
  cart: {
    // The empty cart's way on, in the panel and on the checkout page.
    browse: "Ver el catálogo",
    checkout: {
      name: "Tu nombre",
      nameRequired: "Escribí tu nombre.",
      nameTooLong: "El nombre puede tener hasta 80 letras.",
      note: "Nota para la tienda (opcional)",
      notePlaceholder: "Por ejemplo, a qué hora te queda bien.",
      noteTooLong: "La nota puede tener hasta 500 letras.",
      phone: "Tu celular",
      phoneHint: "Te escriben por WhatsApp para coordinar la entrega.",
      phoneInvalid: "Escribí un celular, por ejemplo 099 123 456.",
      submit: "Hacer el pedido",
      submitting: "Enviando el pedido…",
      title: "Tus datos",
    },
    decrease: "Una unidad menos de {title}",
    empty: "Tu carrito está vacío.",
    errors: {
      blocked:
        "Quitá los artículos que ya no se pueden comprar para hacer el pedido.",
      changed:
        "Algo cambió en tu carrito mientras lo mirabas. Revisalo y volvé a enviar.",
      failed: "No pudimos enviar el pedido. Probá de nuevo.",
      refresh: "No pudimos traer los precios de ahora.",
      refused:
        "No pudimos aceptar este pedido. Si sigue pasando, escribile a la tienda.",
      retry: "Probar de nuevo",
      tooMany:
        "Ya hiciste varios pedidos en poco tiempo. Probá de nuevo en {minutes} min.",
    },
    flags: {
      goneTitle: "Artículo que ya no está a la venta",
      priceChanged: "El precio cambió: antes {before}.",
      unavailable: "Agotado por ahora.",
    },
    increase: "Una unidad más de {title}",
    loading: "Trayendo los precios de ahora…",
    // The checkout page (FER-045): the order's summary, then the form.
    page: {
      edit: "Editar el carrito",
      lineQuantity: "{quantity} × {price}",
      summary: "Resumen",
      title: "Tu pedido",
    },
    // The side panel that adding and the header's cart open (FER-045).
    panel: {
      added: "Agregaste {title} al carrito.",
      close: "Cerrar",
      keepShopping: "Seguir comprando",
      placeOrder: "Hacer el pedido",
      // The title's name for a screen reader, which hears the units.
      units: "Tu carrito, {count} unidades",
      unitsOne: "Tu carrito, 1 unidad",
    },
    quantity: "Cantidad de {title}",
    remove: "Quitar {title}",
    removed: "Quitaste {title} del carrito.",
    subtotal: "Total",
    title: "Tu carrito",
    unitPrice: "{price} c/u",
  },
  catalog: {
    addFailed: "No pudimos agregarlo. Probá de nuevo.",
    added: "Agregado al carrito.",
    atMax: "Ya tenés {max} de este artículo, el máximo por pedido.",
    cartFull: "El carrito ya tiene {max} artículos distintos, el máximo.",
    categories: "Categorías",
    allCategories: "Todas",
    breadcrumb: "Ruta",
    // A category's and a group's page, when the admin wrote no text of
    // their own (FER-043).
    categoryDescription:
      "Comprá {name} en {store}. Mirá los precios y hacé tu pedido online.",
    groupDescription:
      "Comprá {name} en {store}: {categories}. Mirá los precios y hacé tu pedido online.",
    home: "Inicio",
    clear: "Limpiar",
    clearAll: "Limpiar todo",
    closeFilters: "Cerrar los filtros",
    description: "Todos los artículos de {store}.",
    empty: {
      body: "Volvé pronto: la tienda está cargando su catálogo.",
      title: "Todavía no hay artículos",
    },
    filter: "Filtrar",
    filteredDescription: "{selection}, en {store}.",
    loadFailed: "No pudimos cargar más artículos.",
    loadMore: "Cargar más",
    loading: "Cargando…",
    noResults: {
      body: "Probá con otra búsqueda o quitá algún filtro.",
      clear: "Ver todo el catálogo",
      title: "No encontramos nada",
    },
    remove: "Quitar: {name}",
    retry: "Probar de nuevo",
    searchResult: "«{q}»",
    selected: "Filtros elegidos",
    share: "Compartir",
    shareCopied: "Enlace copiado.",
    shareFailed: "No pudimos copiar el enlace.",
    showResults: "Ver resultados",
    sort: {
      // Before the current sort on its button: "Ordenar por: Más nuevos".
      label: "Ordenar por:",
      newest: "Más nuevos",
      price_asc: "Precio: menor a mayor",
      price_desc: "Precio: mayor a menor",
    },
    title: "Todos los artículos",
  },
  home: {
    browse: "Ver el catálogo",
  },
  cover: {
    goTo: "Ver la portada {current}",
    label: "Portada",
    pause: "Pausar la portada",
  },
  marquee: {
    pause: "Pausar la banda en movimiento",
  },
  order: {
    code: "Tu código de pedido",
    contactStore: "Escribirle a la tienda",
    contactStoreText: "¡Hola! Hice el pedido {code}.",
    items: "Lo que pediste",
    keepShopping: "Seguir mirando la tienda",
    next: "La tienda te va a escribir al {phone} para coordinar el pago y la entrega. Guardá este enlace: acá ves cómo va tu pedido.",
    note: "Tu nota",
    received: "¡Recibimos tu pedido!",
    status: "Estado",
    statuses: {
      delivered: "Entregado",
      packed: "Preparado: listo para entregar",
      received: "Recibido: la tienda lo va a preparar",
      undeliverable: "No se pudo entregar: la tienda te va a escribir",
    },
    title: "Pedido {code}",
    total: "Total",
  },
  price: {
    previous: "Antes {price}",
  },
  row: {
    next: "Ver más de {title}",
    restart: "Volver al principio de {title}",
    viewAll: "Ver todo",
    viewAllOf: "Ver todo: {title}",
  },
  shell: {
    // The bar above the header until FER-020 lets the store write its own.
    // The short one is for a phone, where the whole one would not fit.
    announcement: {
      full: "Te esperamos en la Feria Paseo Prado del 5 de diciembre al 5 de enero, puesto 86",
      short: "Feria Paseo Prado · Puesto 86",
    },
    cartCount: "Carrito, {count} unidades",
    cartCountOne: "Carrito, 1 unidad",
    cartEmpty: "Carrito, vacío",
    catalog: "Todos los artículos",
    closeMenu: "Cerrar el menú",
    // The button beside a group in the header (FER-043).
    groupToggle: "{name}: sus categorías",
    copyright: "© {store}",
    credit: "Hecho por Lucas Regalado",
    error: {
      body: "Algo falló al mostrar esta página. Probá de nuevo; si sigue pasando, escribinos.",
      retry: "Probar de nuevo",
      title: "No pudimos mostrar esta página",
    },
    follow: "Seguinos",
    footer: "Pie de la tienda",
    help: "Ayuda",
    home: "Inicio",
    howToOrder:
      "Elegí lo que te guste, agregalo al carrito y dejá tu nombre: te escribimos para coordinar la entrega.",
    instagram: "Instagram de {store}",
    logo: "{brand}, ir al inicio",
    menu: "Menú",
    navigation: "Secciones de la tienda",
    newTab: "(se abre en otra pestaña)",
    notFound: {
      back: "Volver al inicio de la tienda",
      body: "Puede que el enlace sea viejo o que ese artículo ya no esté.",
      title: "No encontramos esta página",
    },
    search: "Buscar en la tienda",
    searchClose: "Cerrar la búsqueda",
    searchField: "Buscar artículos",
    searchPlaceholder: "Buscá lo que quieras",
    searchSubmit: "Buscar",
    shop: "Tienda",
    skipToContent: "Saltar al contenido",
    tiktok: "TikTok de {store}",
    whatsapp: "Escribinos por WhatsApp",
  },
};
