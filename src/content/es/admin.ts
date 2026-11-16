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
    title: "Categorías",
    toasts: {
      created: "Categoría agregada.",
      deleted: "Categoría eliminada.",
      renamed: "Categoría renombrada.",
    },
  },
  comingSoon: {
    body: "Esta sección todavía se está construyendo. Va a aparecer acá en una próxima versión.",
    title: "Próximamente",
  },
  landing: {
    inactive: "Inactiva",
    noStoresBody:
      "Tu cuenta todavía no está en ninguna tienda. Pedile a quien te dio el acceso que te agregue.",
    noStoresTitle: "Todavía no tenés una tienda",
    pickBody: "Tenés acceso a más de una tienda. ¿En cuál querés trabajar?",
    pickTitle: "Elegí una tienda",
  },
  metadata: {
    title: "Panel",
  },
  platformSections: {
    metrics: "Métricas",
    stores: "Tiendas",
    users: "Usuarios",
  },
  shell: {
    navigation: "Secciones del panel",
    platform: "Plataforma",
    platformNavigation: "Secciones de la plataforma",
    skipToContent: "Saltar al contenido",
    storeSwitcher: "Cambiar de tienda: {store}",
    stores: "Tiendas",
  },
  signIn: {
    subtitle: "Iniciá sesión con el email y la contraseña que te dieron.",
    title: "Panel de tu tienda",
  },
  storeSections: {
    categories: "Categorías",
    home: "Inicio",
    orders: "Pedidos",
    products: "Artículos",
    settings: "Ajustes",
    users: "Usuarios",
  },
};
