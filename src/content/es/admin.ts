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
        "Se va a eliminar «{name}» con sus {count} valores, y se les quita a los artículos que los tienen. No se puede deshacer.",
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
      "Con los filtros tus clientes encuentran lo que buscan, por ejemplo por color. Cada filtro tiene su propio enlace: /tu-tienda/products?color=dorado.",
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
      valueUpdated: "Valor guardado.",
    },
    values: "Valores de «{name}»",
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
    filters: "Filtros",
    home: "Inicio",
    orders: "Pedidos",
    products: "Artículos",
    settings: "Ajustes",
    users: "Usuarios",
  },
};
