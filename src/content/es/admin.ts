export const admin = {
  categories: {
    add: {
      pending: "Agregando…",
      submit: "Agregar",
      title: "Nueva categoría",
    },
    count: "{count} artículos",
    countOne: "1 artículo",
    delete: {
      action: "Eliminar: {name}",
      confirm: "Eliminar categoría",
      description: "Se va a eliminar «{name}». No se puede deshacer.",
      moveLabel: "Mover sus artículos a",
      movePlaceholder: "Elegí una categoría",
      moveRequired: "Elegí a qué categoría pasan sus artículos.",
      onlyOne:
        "Es la única categoría y tiene artículos. Creá otra para moverlos antes de eliminarla.",
      title: "¿Eliminar la categoría?",
      withArticles:
        "«{name}» tiene {count}. Elegí a qué categoría pasan antes de eliminarla.",
    },
    description:
      "El orden de esta lista es el de los carruseles del inicio y el del filtro del catálogo.",
    edit: {
      action: "Renombrar: {name}",
      cancel: "Cancelar",
      pending: "Guardando…",
      submit: "Guardar",
    },
    empty: "Todavía no hay categorías. Agregá la primera arriba.",
    errors: {
      duplicate: "Ya hay una categoría con ese nombre en esta tienda.",
      generic: "No pudimos guardar el cambio. Probá de nuevo.",
      load: "No pudimos cargar las categorías.",
      nameRequired: "Escribí el nombre en español.",
      nameTooLong: "Usá hasta 60 caracteres.",
      altTooLong: "Usá hasta 200 caracteres.",
      descriptionTooLong: "Usá hasta 160 caracteres.",
      titleTooLong: "Usá hasta 70 caracteres.",
    },
    fields: {
      nameEn: "Nombre en inglés (opcional)",
      nameEnHint:
        "Si lo dejás vacío, en inglés se muestra el nombre en español.",
      nameEs: "Nombre en español",
    },
    list: "Categorías de la tienda",
    move: {
      cancelled: "Movimiento cancelado: «{name}» quedó donde estaba.",
      down: "Bajar: {name}",
      drag: "Arrastrar para ordenar: {name}",
      instructions:
        "Para ordenar con el teclado, apretá espacio en la manija, movela con las flechas y apretá espacio de nuevo para dejarla, o Escape para cancelar.",
      moved: "«{name}» quedó en el lugar {position} de {total}.",
      over: "«{name}» está sobre «{over}».",
      picked: "Tomaste «{name}».",
      stayed: "«{name}» quedó donde estaba.",
      up: "Subir: {name}",
    },
    // A category's page in the store: its group, its texts for search
    // engines and its cover (FER-043).
    page: {
      action: "Página y grupo: {name}",
      cancel: "Cancelar",
      cover: "Portada",
      coverAltEn: "Descripción de la portada en inglés",
      coverAltEs: "Descripción de la portada en español",
      coverComputer: "Foto para computadora",
      coverHint:
        "Se ve a todo lo ancho arriba de la página, con el título encima. Sin foto, la página muestra solo el título. Se guarda con «Guardar».",
      coverPhone: "Foto para celular (opcional)",
      coverPhoneHint:
        "Cuadrada queda mejor. Si no subís una, el celular muestra la de computadora.",
      coverPhoneNeedsComputer: "Primero elegí la foto para computadora.",
      englishNeedsName:
        "Para escribir los textos en inglés, primero ponele un nombre en inglés a la categoría.",
      group: "Grupo",
      groupHint:
        "Un grupo junta categorías en el menú de la tienda, como Bijouterie con Cadenas y Anillos. Su página muestra todos sus artículos.",
      groupIsGroup:
        "Esta categoría es un grupo: tiene categorías adentro, así que no puede entrar en otro.",
      groupNone: "Sin grupo",
      holds: "Grupo de {count} categorías",
      holdsOne: "Grupo de 1 categoría",
      inGroup: "En {group}",
      pending: "Guardando…",
      seoDescriptionEn: "Descripción para buscadores en inglés",
      seoDescriptionEs: "Descripción para buscadores en español",
      seoHint:
        "Si los dejás vacíos, se escriben solos con el nombre de la categoría y el de la tienda.",
      seoTitleEn: "Título para buscadores en inglés",
      seoTitleEs: "Título para buscadores en español",
      showInHeader: "Mostrar en el encabezado",
      showInHeaderHint:
        "Si la desmarcás, deja de aparecer en el menú de la tienda, pero su página sigue abierta.",
      showInHeaderInGroup:
        "Una categoría de un grupo siempre aparece en el menú de su grupo.",
      submit: "Guardar la página",
      title: "Página de «{name}»",
    },
    title: "Categorías",
    toasts: {
      created: "Categoría agregada.",
      deleted: "Categoría eliminada.",
      pageSaved: "Página guardada.",
      renamed: "Categoría renombrada.",
    },
  },
  comingSoon: {
    body: "Esta sección todavía se está construyendo. Va a aparecer acá en una próxima versión.",
    title: "Próximamente",
  },
  filters: {
    add: {
      pending: "Agregando…",
      submit: "Agregar filtro",
      title: "Nuevo filtro",
    },
    addValue: {
      pending: "Agregando…",
      submit: "Agregar valor",
      title: "Nuevo valor de «{name}»",
    },
    count: "{count} artículos",
    countOne: "1 artículo",
    delete: {
      action: "Eliminar filtro: {name}",
      confirm: "Eliminar filtro",
      description:
        "Se va a eliminar «{name}» con todos sus valores, y se les quitan a los artículos que los tienen. No se puede deshacer.",
      title: "¿Eliminar el filtro?",
    },
    deleteValue: {
      action: "Eliminar valor: {name}",
      confirm: "Eliminar valor",
      inUse:
        "«{name}» está en {count}. Se les va a quitar a esos artículos. No se puede deshacer.",
      unused: "Se va a eliminar «{name}». No se puede deshacer.",
      title: "¿Eliminar el valor?",
    },
    description:
      "Con los filtros tus clientes encuentran lo que buscan, por ejemplo por color. Cada filtro tiene su propio enlace: /productos?color=dorado.",
    edit: {
      action: "Renombrar filtro: {name}",
      cancel: "Cancelar",
      pending: "Guardando…",
      submit: "Guardar",
      valueAction: "Editar valor: {name}",
    },
    empty:
      "Todavía no hay filtros. Agregá el primero arriba, por ejemplo Color.",
    emptyValues: "Este filtro todavía no tiene valores.",
    errors: {
      duplicate: "Ya hay uno con ese nombre acá.",
      generic: "No pudimos guardar el cambio. Probá de nuevo.",
      load: "No pudimos cargar los filtros.",
      nameRequired: "Escribí el nombre en español.",
      nameTooLong: "Usá hasta 60 caracteres.",
    },
    fields: {
      nameEn: "Nombre en inglés (opcional)",
      nameEnHint:
        "Si lo dejás vacío, en inglés se muestra el nombre en español.",
      nameEs: "Nombre en español",
      swatch: "Color de muestra",
      swatchAdd: "Agregar color de muestra",
      swatchHint: "Un punto de este color aparece al lado del nombre.",
      swatchRemove: "Quitar color",
    },
    list: "Filtros de la tienda",
    move: {
      down: "Bajar: {name}",
      moved: "«{name}» quedó en el lugar {position} de {total}.",
      up: "Subir: {name}",
    },
    title: "Filtros",
    toasts: {
      created: "Filtro agregado.",
      deleted: "Filtro eliminado.",
      renamed: "Filtro renombrado.",
      valueCreated: "Valor agregado.",
      valueDeleted: "Valor eliminado.",
      valueDeletedFrom: "Valor eliminado: se quitó de {count}.",
      valueUpdated: "Valor guardado.",
    },
    values: "Valores de «{name}»",
  },
  imageUpload: {
    cancel: "Cancelar",
    cancelled: "Subida cancelada.",
    choose: "Elegir foto",
    // An action's name with the field's, so two uploaders on one screen
    // read apart ("Elegir foto: Foto para computadora").
    named: "{action}: {label}",
    errors: {
      failed: "No se pudo subir la foto. Revisá la conexión y reintentá.",
      notConfigured: "La subida de fotos no está configurada en este servidor.",
      tooLarge:
        "La foto sigue siendo demasiado pesada después de reducirla. Probá con otra.",
      unreadable:
        "No pudimos leer esta foto. Probá con una en JPEG, PNG o WebP.",
    },
    hint: "JPEG, PNG o WebP. La achicamos antes de subirla para que viaje rápido.",
    preparing: "Preparando la foto…",
    preview: "Vista previa: {label}",
    progress: "Progreso de la subida: {label}",
    remove: "Quitar foto",
    removed: "Foto quitada.",
    replace: "Cambiar foto",
    retry: "Reintentar",
    uploaded: "Foto subida.",
    uploading: "Subiendo la foto… {percent}",
  },
  metadata: {
    title: "Panel",
  },
  orders: {
    actions: {
      backToPacked: "Volver a preparado",
      backToReceived: "Volver a recibido",
      label: "Cambiar el estado del pedido",
      markDelivered: "Marcar entregado",
      markPacked: "Marcar preparado",
      markUndeliverable: "No se pudo entregar",
      pending: "Guardando…",
    },
    arrived: "Llegó el pedido {code}",
    arrivedMany: "Llegaron {count} pedidos: {codes}",
    columns: {
      code: "Pedido",
      customer: "Cliente",
      placed: "Cuándo",
      status: "Estado",
      total: "Total",
    },
    detail: {
      back: "Volver a pedidos",
      contact: "Contacto",
      // The shopper's own page of the order (FER-051), to send it again.
      copyLink: "Copiar el enlace del pedido",
      copyLinkCopied: "Copiamos el enlace del pedido.",
      copyLinkField: "Enlace del pedido",
      copyLinkManual:
        "No pudimos copiarlo: seleccioná el enlace y copialo a mano.",
      history: "Historial",
      historyFormer: "Alguien que ya no está en el equipo",
      historyPlaced: "Pedido hecho",
      items: "Artículos",
      itemLine: "{quantity} × {title}",
      note: "Nota del cliente",
      phone: "Teléfono",
      placed: "Hecho {time} · {date}",
      status: "Estado",
      title: "Pedido {code}",
      total: "Total",
      whatsapp: "Abrir chat de WhatsApp",
      // In the customer's language, the one they ordered in, whatever the
      // admin's: the text goes to them.
      whatsappText: {
        en: "Hi {name}, I'm writing about your order {code}.",
        es: "Hola {name}, te escribo por tu pedido {code}.",
      },
    },
    description:
      "Los pedidos nuevos aparecen solos mientras tengas esta pantalla abierta.",
    empty: {
      all: "Todavía no hay pedidos. Cuando alguien compre en la tienda, aparece acá.",
      delivered: "Todavía no hay pedidos entregados.",
      packed: "No hay pedidos preparados esperando la entrega.",
      received: "No hay pedidos sin preparar.",
      search: "Ningún pedido coincide con «{q}».",
      undeliverable: "No hay pedidos que no se pudieron entregar.",
    },
    errors: {
      change: "No pudimos cambiar el estado. Probá de nuevo.",
      conflict: "Alguien ya cambió este pedido; lo actualizamos.",
      load: "No pudimos cargar los pedidos.",
      loadMore: "No pudimos cargar más pedidos.",
      order: "No pudimos cargar el pedido.",
      refresh:
        "No pudimos actualizar los pedidos: esta es la última lista que leímos.",
    },
    list: "Pedidos de la tienda",
    loadMore: "Cargar más",
    loadingMore: "Cargando…",
    new: "Nuevo",
    pendingBadge: "{label}, {count} sin preparar",
    pendingBadgeOne: "{label}, 1 sin preparar",
    phoneVerified: "Teléfono confirmado: {answer}",
    phoneVerifiedNo: "No",
    phoneVerifiedYes: "Sí",
    search: "Buscar pedidos",
    searchPlaceholder: "Código, nombre o teléfono",
    sound: "Sonido cuando llega un pedido",
    soundHint: "Tocá la pantalla para activar el sonido",
    statuses: {
      delivered: "Entregado",
      packed: "Preparado",
      received: "Recibido",
      undeliverable: "No se pudo entregar",
    },
    // The stepper's circles as buttons (FER-051): each says what it does, or
    // why it cannot; its tooltip says the same.
    stepper: {
      back: "Volver a {status}",
      blocked: "{status}: antes tiene que pasar por Preparado",
      confirm: {
        back: "Sí, volver a {status}",
        backTitle: "¿Volver el pedido a {status}?",
        description:
          "El pedido {code} pasa a «{status}» y el cliente lo ve en la página de su pedido.",
        forward: "Sí, pasar a {status}",
        forwardTitle: "¿Pasar el pedido a {status}?",
      },
      current: "{status}: es el estado actual",
      forward: "Pasar a {status}",
      pending: "Guardando: {status}",
    },
    tab: "{label} ({count})",
    tabAll: "Todos",
    tabs: "Filtrar por estado",
    title: "Pedidos",
    undeliverable: {
      confirm: "Sí, no se pudo entregar",
      description:
        "El pedido {code} pasa a «No se pudo entregar» y el cliente lo ve en la página de su pedido. Si te equivocaste, podés volver a «Preparado».",
      title: "¿No se pudo entregar el pedido?",
    },
  },
  // The company's settings (FER-014): what the store says about itself and
  // how a shopper reaches it.
  // The home's curation (FER-020).
  home: {
    announcement: {
      errors: {
        dateInvalid: "Elegí una fecha del calendario.",
        endBeforeStart: "El último día va igual o después del primero.",
        linkInvalid:
          "Escribí una página de la tienda, como /productos, o un enlace completo que empiece con https://",
        linkTooLong: "El enlace es demasiado largo.",
        save: "No pudimos guardar el anuncio. Lo que escribiste sigue acá: probá de nuevo.",
        shortNeedsText: "Escribí primero el texto en inglés.",
        shortTooLong: "Usá hasta 40 caracteres.",
        textRequired: "Escribí el texto del anuncio.",
        textTooLong: "Usá hasta 120 caracteres.",
      },
      fields: {
        daysHint:
          "Opcional. Los dos días cuentan; fuera de esas fechas el anuncio no se muestra, sin que tengas que tocar nada.",
        endsOn: "Hasta",
        isActive: "Mostrar el anuncio",
        linkHint:
          "Opcional. Una página de la tienda, como /productos, o un enlace completo que empiece con https://",
        linkUrl: "Enlace",
        shortHint:
          "Lo que se ve en un celular, donde el texto entero no entra en una línea. Si la dejás vacía, el celular muestra el texto entero.",
        shortTextEn: "Versión corta en inglés",
        shortTextEs: "Versión corta en español",
        startsOn: "Desde",
        textEn: "Texto en inglés",
        textEs: "Texto en español",
      },
      hint: "La línea verde arriba de todo, en cada página de la tienda.",
      pending: "Guardando…",
      saved: "Anuncio guardado.",
      submit: "Guardar anuncio",
      title: "Anuncio",
    },
    bannerForm: {
      cancel: "Cancelar",
      close: "Cerrar",
      created: "Banner agregado.",
      createTitle: "Nuevo banner",
      description:
        "Una foto grande con su título y un botón, en la portada o entre dos filas.",
      editTitle: "Editar banner",
      errors: {
        coverFull:
          "La portada ya tiene {max} banners: sacá uno de la portada o poné este entre filas.",
        articleRequired: "Elegí el artículo.",
        categoryRequired: "Elegí la categoría.",
        ctaNeedsTitle: "Escribí primero el título en inglés.",
        ctaTooLong: "Usá hasta 24 caracteres.",
        dateInvalid: "Elegí una fecha del calendario.",
        endBeforeStart: "El último día va igual o después del primero.",
        imageRequired: "Elegí la foto para computadora.",
        linkInvalid:
          "Escribí una página de la tienda, como /productos, o un enlace completo que empiece con https://",
        linkTooLong: "El enlace es demasiado largo.",
        save: "No pudimos guardar el banner. Lo que escribiste sigue acá: probá de nuevo.",
        titleRequired: "Escribí el título.",
        titleTooLong: "Usá hasta 60 caracteres.",
      },
      fields: {
        choose: "Elegí…",
        cropComputer: "En una computadora",
        cropHint:
          "La foto llena todo el ancho y se recorta para que entre: así queda en cada pantalla.",
        cropPhone: "En un celular",
        cropTitle: "Cómo se recorta",
        ctaHint: "Si lo dejás vacío, el botón dice «Comprar ahora».",
        ctaLabelEn: "Botón en inglés",
        ctaLabelEs: "Botón en español",
        daysHint:
          "Opcional. Los dos días cuentan; fuera de esas fechas el banner no se muestra, sin que tengas que tocar nada.",
        endsOn: "Hasta",
        image: "Foto para computadora",
        imageHint:
          "Apaisada, como mínimo de 1600 px de ancho. JPEG, PNG o WebP.",
        imagePhone: "Foto para celular",
        imagePhoneHint:
          "Opcional. Vertical; si no hay, el celular recorta la de computadora.",
        imagePhoneNeedsComputer: "Primero elegí la foto para computadora.",
        isActive: "Mostrar el banner",
        linkCategoryId: "Categoría",
        linkKind: "Lleva a",
        linkKinds: {
          category: "Una categoría",
          none: "Ningún lado",
          product: "Un artículo",
          url: "Una dirección",
        },
        linkProductId: "Artículo",
        linkUrl: "Dirección",
        linkUrlHint:
          "Una página de la tienda, como /productos, o un enlace completo que empiece con https://",
        placement: "Dónde va",
        placements: { cover: "En la portada", rows: "Entre dos filas" },
        rowsFirst: "Antes de la primera fila",
        rowsIndex: "Después de",
        startsOn: "Desde",
        titleEn: "Título en inglés",
        titleEs: "Título en español",
      },
      pending: "Guardando…",
      saved: "Banner guardado.",
      submit: "Guardar banner",
      waitUpload: "Esperá a que termine de subir la foto.",
    },
    banners: {
      add: "Nuevo banner",
      delete: "Borrar banner: {title}",
      deleteConfirm: "Borrar",
      deleted: "Banner borrado.",
      deleteDescription:
        "Se borran «{title}» y sus fotos. No se puede deshacer.",
      deletePending: "Borrando…",
      deleteTitle: "¿Borrar el banner?",
      edit: "Editar banner: {title}",
      empty:
        "Todavía no hay banners. Agregá uno para la portada o para ir entre dos filas.",
      errors: {
        delete: "No pudimos borrar el banner. Probá de nuevo.",
      },
      hint: "Fotos grandes con un título y un botón. Van en la portada, el carrusel de arriba de todo, o entre dos filas de artículos.",
      linkUnpublished:
        "El artículo al que lleva no está publicado: el banner se muestra sin enlace.",
      notOnPage: "No está en esta página",
      placements: { cover: "Portada", rows: "Entre filas" },
      title: "Banners",
    },
    description:
      "Lo que muestra la home de la tienda: el anuncio de arriba, los banners con fotos y el orden de las filas de artículos.",
    errors: {
      load: "No pudimos cargar la página.",
    },
    layout: {
      addBlock: "Agregar bloque",
      addBlockLabel: "Bloque para agregar",
      addBlockNone: "No hay más bloques para agregar.",
      add: "Agregar",
      addArticle: "Artículo para agregar",
      bannerRow: "Banner: {title}",
      bestSellers: "Más vendidos",
      bestSellersHint:
        "Elegí y ordená hasta 10 artículos. Los elegís vos: no salen de los pedidos.",
      categoryEmpty: "Sin artículos publicados: no aparece",
      cover: "Portada",
      coverEmpty: "No hay banners en la portada.",
      coverHint: "El orden en que pasan los banners del carrusel de arriba.",
      down: "Bajar: {name}",
      errors: {
        featuredCount: "Elegí ninguno, o de 2 a 4 artículos destacados.",
        save: "No pudimos guardar el orden. Tus cambios siguen acá: probá de nuevo.",
        repeated:
          "Hay una fila o un banner repetido. Recargá la página para ver el orden guardado.",
      },
      featured: "Destacados",
      featuredHint: "Elegí de 2 a 4 artículos, o ninguno.",
      full: "Ya hay {max}: quitá uno para agregar otro.",
      hint: "Debajo de la portada, de arriba hacia abajo: las categorías, los más vendidos, los destacados, los banners entre filas y las vidrieras.",
      none: "Ninguno todavía.",
      pending: "Guardando…",
      remove: "Quitar: {name}",
      rows: "Filas",
      rowsHint: "Una fila sin artículos para mostrar no aparece en la tienda.",
      sharedList: "Esta lista es la misma en todas las páginas.",
      saved: "Orden guardado.",
      spotlightRow: "Vidriera: {name}",
      submit: "Guardar orden",
      title: "Orden de la página",
      untitled: "Sin título",
      up: "Subir: {name}",
      warnings: {
        unavailable:
          "Está agotado: no aparece en la tienda hasta que vuelva a estar disponible.",
        unpublished: "No está publicado: no aparece en la tienda.",
      },
    },
    preview: {
      coverMore: "Y {count} más en la portada.",
      empty: "Con lo que elegiste, esta página todavía no muestra nada.",
      hint: "Así se ve esta página con lo que elegiste, antes de guardar: muestra lo que hoy aparece en la tienda.",
      title: "Vista previa",
    },
    spotlightForm: {
      cancel: "Cancelar",
      close: "Cerrar",
      created: "Vidriera agregada.",
      createTitle: "Nueva vidriera",
      description:
        "Un artículo grande en un bloque oscuro entre las filas, con su foto, su nombre, su precio y el botón para agregarlo al carrito.",
      editTitle: "Editar vidriera",
      errors: {
        articleRequired: "Elegí el artículo.",
        labelTooLong: "Usá hasta 24 caracteres.",
        phraseTooLong: "Usá hasta 140 caracteres.",
        save: "No pudimos guardar la vidriera. Lo que escribiste sigue acá: probá de nuevo.",
      },
      fields: {
        choose: "Elegí…",
        labelEn: "Etiqueta en inglés",
        labelEs: "Etiqueta en español",
        labelHint:
          "Opcional. La píldora verde arriba del nombre, como «Nuevo».",
        phraseEn: "Frase en inglés",
        phraseEs: "Frase en español",
        phraseHint: "Opcional. Una línea corta debajo del precio.",
        productHint:
          "Su foto, su nombre y su precio son los del artículo. Si no está publicado o está agotado, la vidriera no aparece en la tienda.",
        productId: "Artículo",
        rowsFirst: "Arriba de todo, debajo de la portada",
        rowsIndex: "Después de",
      },
      pending: "Guardando…",
      saved: "Vidriera guardada.",
      submit: "Guardar vidriera",
    },
    spotlights: {
      add: "Nueva vidriera",
      delete: "Borrar vidriera: {name}",
      deleteConfirm: "Borrar",
      deleted: "Vidriera borrada.",
      deleteDescription:
        "Se borra la vidriera de «{name}». El artículo sigue como está.",
      deletePending: "Borrando…",
      deleteTitle: "¿Borrar la vidriera?",
      edit: "Editar vidriera: {name}",
      empty:
        "Todavía no hay vidrieras. Agregá una para destacar un artículo al bajar por la página.",
      errors: {
        delete: "No pudimos borrar la vidriera. Probá de nuevo.",
      },
      hint: "Un artículo grande, en un bloque oscuro entre las filas, que se ve al bajar y se agrega al carrito con un toque.",
      onPage: "En esta página",
      title: "Vidrieras",
    },
    status: {
      ended: "Terminó",
      off: "Apagado",
      scheduled: "Programado",
      showing: "Se muestra",
    },
  },
  pages: {
    add: "Nueva página",
    delete: "Borrar: {name}",
    deleteConfirm: "Borrar",
    deleted: "Página borrada.",
    deleteDescription:
      "Se borra «{name}» con sus bloques. Los banners, las vidrieras y los artículos siguen como están.",
    deletePending: "Borrando…",
    deleteTitle: "¿Borrar la página?",
    description:
      "Cada página tiene su dirección y se arma con los mismos bloques que la home: portada, filas, banners y vidrieras. La home es la que se ve en «/».",
    draft: "Borrador",
    draftCannotBeHome: "Publicala para poder usarla como home.",
    edit: "Editar: {name}",
    empty: "Todavía no hay páginas.",
    errors: {
      delete: "No pudimos borrar la página. Probá de nuevo.",
      load: "No pudimos cargar las páginas.",
      setHome: "No pudimos cambiar la home. Probá de nuevo.",
    },
    form: {
      cancel: "Cancelar",
      close: "Cerrar",
      created: "Página creada.",
      createTitle: "Nueva página",
      description:
        "Su nombre, su dirección y cómo la ven los buscadores. Los bloques se agregan después, en su editor.",
      editTitle: "Ajustes de la página",
      errors: {
        nameRequired: "Escribí el nombre.",
        nameTooLong: "Usá hasta 60 caracteres.",
        save: "No pudimos guardar la página. Lo que escribiste sigue acá: probá de nuevo.",
        seoDescriptionTooLong: "Usá hasta 160 caracteres.",
        seoTitleTooLong: "Usá hasta 70 caracteres.",
        slugInvalid:
          "Usá letras minúsculas, números y guiones, y una dirección que la tienda no use.",
        slugTaken: "Ya hay una página o una categoría en esa dirección.",
      },
      fields: {
        homeNoHeader: "La home no va en el encabezado: el logo ya lleva ahí.",
        homeStaysPublished:
          "Es la home: sigue publicada. Para despublicarla, elegí otra home primero.",
        isPublished: "Publicada",
        isPublishedHint:
          "Sin publicar, solo la ves vos, con la sesión iniciada.",
        nameEn: "Nombre en inglés",
        nameEs: "Nombre en español",
        seoDescriptionEn: "Descripción para buscadores en inglés",
        seoDescriptionEs: "Descripción para buscadores en español",
        seoHint: "Opcional: si los dejás vacíos, se arman con el nombre.",
        seoTitleEn: "Título para buscadores en inglés",
        seoTitleEs: "Título para buscadores en español",
        showInHeaderHint:
          "Va después de «Catálogo», antes de las categorías, en la computadora y en el menú del celular.",
        showInHeader: "Mostrar en el encabezado",
        slug: "Dirección",
        slugHint:
          "La página queda en /{slug}, y en inglés en /en/{slug}. Minúsculas, números y guiones.",
      },
      pending: "Guardando…",
      saved: "Ajustes guardados.",
      submitCreate: "Crear página",
      submitEdit: "Guardar ajustes",
    },
    homeCannotBeDeleted:
      "Esta página es la home: elegí otra antes de borrarla.",
    homeChanged: "«{name}» es la home.",
    homeMark: "Home",
    inHeader: "En el encabezado",
    published: "Publicada",
    title: "Páginas",
    useAsHome: "Usar como home",
    useAsHomeConfirm: "Usar como home",
    useAsHomeDescription:
      "La tienda va a mostrar «{name}» en «/». La home de ahora vuelve a su propia dirección.",
    useAsHomeNamed: "Usar como home: {name}",
    useAsHomePending: "Cambiando…",
    useAsHomeTitle: "¿Usar «{name}» como home?",
    view: "Ver en la tienda: {name}",
  },
  settings: {
    contact: "Contacto y redes",
    currencies: {
      UYU: "Pesos uruguayos (UYU)",
      USD: "Dólares estadounidenses (USD)",
    },
    currency: "Moneda",
    currencyHint:
      "Es la moneda de todos los precios de la tienda. No se cambia desde el panel.",
    description:
      "Lo que la tienda dice de sí misma y cómo te encuentran. Los cambios se ven en la tienda apenas los guardás.",
    errors: {
      descriptionRequired: "Escribí la descripción.",
      descriptionTooLong: "Usá hasta 600 caracteres.",
      instagramInvalid:
        "Pegá el enlace completo de Instagram, por ejemplo https://instagram.com/tu-tienda",
      linkTooLong: "El enlace es demasiado largo.",
      load: "No pudimos cargar los ajustes.",
      nameRequired: "Escribí el nombre de la tienda.",
      nameTooLong: "Usá hasta 80 caracteres.",
      save: "No pudimos guardar los ajustes. Lo que escribiste sigue acá: probá de nuevo.",
      taglineRequired: "Escribí la frase.",
      taglineTooLong: "Usá hasta 120 caracteres.",
      tiktokInvalid:
        "Pegá el enlace completo de TikTok, por ejemplo https://tiktok.com/@tu-tienda",
      whatsappInvalid:
        "No es un número de WhatsApp que podamos usar. Escribilo como 099 123 456 o, si es de otro país, con su código: +54 9 11 1234 5678.",
    },
    fields: {
      descriptionEn: "Descripción en inglés",
      descriptionEs: "Descripción en español",
      instagramUrl: "Enlace de Instagram",
      name: "Nombre de la tienda",
      socialHint: "Si lo dejás vacío, la tienda no lo muestra.",
      taglineEn: "Frase en inglés",
      taglineEs: "Frase en español",
      tiktokUrl: "Enlace de TikTok",
      whatsappHint:
        "Escribilo como quieras: 099 123 456 o +598 99 123 456. Lo guardamos con el código del país. Si lo dejás vacío, la tienda no muestra WhatsApp.",
      whatsappNumber: "Número de WhatsApp",
    },
    identity: "La tienda",
    pending: "Guardando…",
    saved: "Ajustes guardados.",
    submit: "Guardar",
    texts: "Textos",
    textsHint:
      "La frase va arriba del nombre en el inicio, y la descripción debajo.",
    title: "Ajustes",
  },
  shell: {
    closeMenu: "Cerrar el menú",
    menu: "Menú",
    navigation: "Secciones del panel",
    signedInAs: "Sesión iniciada como",
    skipToContent: "Saltar al contenido",
  },
  signIn: {
    subtitle: "Iniciá sesión con el email y la contraseña que te dieron.",
    title: "Panel de tu tienda",
  },
  storeSections: {
    categories: "Categorías",
    filters: "Filtros",
    metrics: "Métricas",
    orders: "Pedidos",
    pages: "Páginas",
    products: "Artículos",
    settings: "Ajustes",
    users: "Usuarios",
  },
};
