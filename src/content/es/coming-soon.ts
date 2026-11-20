/**
 * The page every storefront address leads to while it is published
 * (FER-034), what the admin's screen that manages it says, and the notice an
 * admin sees on the closed store. The headline, the text under it and the
 * band below are the defaults an admin's empty field falls back to.
 */
export const comingSoon = {
  // Names the logo it sits on, then what pressing it does.
  bubbles: "LR Market: hacer burbujas",
  countdown: {
    many: "días para la feria",
    one: "día para la feria",
  },
  eyebrow: "Feria navideña · 5 de diciembre al 5 de enero",
  lead: "Bijou y pistolas de burbujas. Estamos armando la tienda: seguinos y enterate cuando abra.",
  // The admin's screen (`organisms/coming-soon-manager`).
  manage: {
    back: "Volver a Ajustes",
    confirm: {
      confirm: "Sí, publicar",
      description:
        "Mientras esté publicada, el público no ve nada de la tienda: todas las direcciones llevan a esta página. Vos la vas a seguir viendo porque tenés la sesión iniciada.",
      title: "¿Publicar la página de Próximamente?",
    },
    countdown: "Cuenta regresiva",
    countdownHint:
      "Si lo dejás vacío, cuenta hasta el 5 de diciembre, cuando abre la feria.",
    description:
      "La página que ve el público mientras la tienda está cerrada: la línea sobre el título, el título, el texto, la banda y la cuenta regresiva. El logo queda como está, y las redes son las de Ajustes.",
    errors: {
      dateInvalid: "Elegí un día entre 2026 y 2100.",
      eyebrowTooLong: "Usá hasta 80 caracteres.",
      headlineTooLong: "Usá hasta 50 caracteres.",
      headlineTooManyLines: "Usá hasta 2 renglones.",
      leadTooLong: "Usá hasta 240 caracteres.",
      load: "No pudimos cargar la página de Próximamente.",
      marqueeTooLong: "Usá hasta 120 caracteres.",
      marqueeTooManyLines: "Usá hasta 4 frases.",
      publish:
        "No pudimos cambiar el estado de la página. Sigue como estaba: probá de nuevo.",
      save: "No pudimos guardar los textos. Lo que escribiste sigue acá: probá de nuevo.",
    },
    fields: {
      countdownTo: "Cuenta los días hasta el",
      eyebrowEn: "Línea sobre el título, en inglés",
      eyebrowEs: "Línea sobre el título, en español",
      eyebrowHint:
        "La feria y sus fechas: si cambiás la cuenta regresiva, que diga lo mismo.",
      headlineEn: "Título en inglés",
      headlineEs: "Título en español",
      headlineHint:
        "Hasta 2 renglones: cada uno es una línea del título, y el segundo va resaltado.",
      leadEn: "Texto debajo del título, en inglés",
      leadEs: "Texto debajo del título, en español",
      marqueeEn: "Banda en movimiento, en inglés",
      marqueeEs: "Banda en movimiento, en español",
      marqueeHint:
        "Una frase por renglón, hasta 4. Siempre empieza con el nombre de la tienda.",
    },
    pending: "Guardando…",
    preview: "Ver la página",
    saved: "Textos guardados.",
    status: {
      delay: "El cambio le llega a todo el público en unos segundos.",
      heading: "Estado",
      publish: "Publicar la página",
      published: "Publicada",
      publishedHint:
        "La tienda está cerrada al público: todas sus direcciones llevan a esta página. Vos la seguís viendo con la sesión iniciada.",
      publishedToast: "Página publicada: la tienda está cerrada al público.",
      publishing: "Publicando…",
      unpublish: "Abrir la tienda",
      unpublished: "Sin publicar",
      unpublishedHint:
        "La tienda está abierta: el público la ve entera y esta página no aparece.",
      unpublishedToast: "La tienda está abierta al público.",
      unpublishing: "Abriendo…",
    },
    submit: "Guardar textos",
    texts: { en: "Textos en inglés", es: "Textos en español" },
    textsHint:
      "Si dejás un texto vacío, la página dice el de siempre, el que ves en gris.",
    title: "Próximamente",
  },
  marquee: {
    dates: "5 dic al 5 ene",
    fair: "Feria navideña",
    products: "Bijou y pistolas de burbujas",
  },
  metaDescription:
    "LR Market abre muy pronto: bijou y pistolas de burbujas, en la feria navideña del 5 de diciembre al 5 de enero y en línea.",
  metaTitle: "Muy pronto · LR Market",
  // Over the store an admin sees while it is closed to the public.
  previewNotice: {
    link: "Administrar Próximamente",
    message:
      "La tienda está cerrada al público. La ves porque iniciaste sesión.",
  },
  // The card on the settings screen that leads to the admin's screen.
  settingsCard: {
    description:
      "La página que ve el público mientras la tienda está cerrada, y el botón para publicarla o abrir la tienda.",
    link: "Administrar Próximamente",
    title: "Próximamente",
  },
  social: {
    instagram: "Seguinos en Instagram",
    tiktok: "Seguinos en TikTok",
  },
  title: { lineOne: "Muy", lineTwo: "pronto" },
};
