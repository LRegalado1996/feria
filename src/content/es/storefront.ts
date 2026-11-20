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
    // Like the header's first link (FER-044).
    catalog: "Catálogo",
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
    // The dialog that asks before the order is sent (FER-050).
    confirm: {
      back: "Volver",
      confirm: "Confirmar pedido",
      description:
        "Revisá que esté todo bien: te escribimos a ese celular por WhatsApp.",
      name: "Nombre",
      phone: "Celular",
      title: "¿Confirmás el pedido?",
      total: "Total",
      units: "Unidades",
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
    closeFilters: "Cerrar los filtros",
    description: "Todos los artículos de {store}.",
    empty: {
      body: "Volvé pronto: la tienda está cargando su catálogo.",
      title: "Todavía no hay artículos",
    },
    filter: "Filtrar",
    // The button's whole name with filters chosen (FER-044): on screen it
    // reads "Filtrar (2)".
    filterCount: "Filtrar, {count} filtros elegidos",
    filterCountOne: "Filtrar, 1 filtro elegido",
    filteredDescription: "{selection}, en {store}.",
    loadFailed: "No pudimos cargar más artículos.",
    loadMore: "Cargar más",
    // Said to a screen reader as each page arrives (FER-044).
    loaded: "Se cargaron {count} artículos más; ya ves {total}.",
    loadedAll: "Ya están todos.",
    loadedOne: "Se cargó 1 artículo más; ya ves {total}.",
    loading: "Cargando…",
    noResults: {
      body: "Probá con otra búsqueda o quitá algún filtro.",
      clear: "Ver todo el catálogo",
      title: "No encontramos nada",
    },
    retry: "Probar de nuevo",
    searchResult: "«{q}»",
    showResults: "Ver resultados",
    sort: {
      // Before the current sort on its button: "Ordenar por: Más nuevos".
      label: "Ordenar por:",
      newest: "Más nuevos",
      // The store's own order, the default (FER-044): chosen, the button
      // names no sort and reads only the prompt.
      position: "Destacados",
      price_asc: "Precio: menor a mayor",
      price_desc: "Precio: mayor a menor",
      prompt: "Ordenar por",
    },
    title: "Catálogo",
  },
  home: {
    // The two rows the store curates by hand (FER-020).
    bestSellers: "Más vendidos",
    browse: "Ver el catálogo",
    featured: "Destacados",
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
    // The row under the band (FER-051): one category's articles, at random.
    orderAgain: "Hacé todos los pedidos que quieras",
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
  // A page of the store built from sections (FER-060).
  page: {
    // Its description for search engines when the admin wrote none.
    description: "{name} en {store}. Mirá los precios y hacé tu pedido online.",
    draft:
      "Borrador: la ves porque iniciaste sesión. El público todavía no la ve.",
    empty: "Esta página todavía no muestra nada.",
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
    cartCount: "Carrito, {count} unidades",
    cartCountOne: "Carrito, 1 unidad",
    cartEmpty: "Carrito, vacío",
    catalog: "Catálogo",
    closeMenu: "Cerrar el menú",
    // The first link of a group's list on the header's line (FER-044): the
    // group's own page.
    groupAll: "Ver todo",
    // The button beside a group in the phone's menu (FER-043).
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
    // The logo at the top of the phone menu, which leads home (FER-050).
    menuLogo: "{brand}, inicio",
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
    // Under the footer's logo, in Pepe's own words (Lucas, 2026-11-18,
    // FER-044). It stays code: the company settings (FER-014) do not edit it.
    story: {
      signature: "Pepe",
      text: "Hace más de 20 años que mi familia arma su puesto en la feria navideña. Empecé ayudando a mis padres y hace unos 10 años tengo el mío. Vendimos de todo: zapatos, ropa, juguetes, perfumes. Este año venimos con bijouterie y pistolas de burbujas: pasá por el puesto 86 o pedí desde acá.",
    },
    tiktok: "TikTok de {store}",
    whatsapp: "Escribinos por WhatsApp",
  },
};
