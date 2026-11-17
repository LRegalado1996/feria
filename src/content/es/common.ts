export const common = {
  cancel: "Cancelar",
  // What a screen reader calls a carousel and each of its slides
  // (`aria-roledescription`), and how it names a slide.
  carousel: {
    roleDescription: "carrusel",
    slide: "{current} de {total}",
    slideRoleDescription: "diapositiva",
  },
  closeDialog: "Cerrar diálogo",
  delete: "Eliminar",
  deleteRow: "Eliminar: {row}",
  deleting: "Eliminando…",
  hidePassword: "Ocultar contraseña",
  loading: "Cargando",
  moreActions: "Más acciones",
  moreActionsForRow: "Más acciones: {row}",
  notifications: "Notificaciones",
  numberInput: {
    decimal: "Este campo no lleva decimales.",
    unreadable:
      "No pudimos leer este número. Escribilo sin separador de miles, por ejemplo 1500 o 12,50.",
  },
  // An order's status as a row of steps (FER-051), in the admin and on the
  // shopper's page. The list's name says the status in words.
  orderStepper: {
    current: "estado actual",
    done: "hecho",
    label: "Estado del pedido: {status}",
    statuses: {
      delivered: "Entregado",
      packed: "Preparado",
      received: "Recibido",
      undeliverable: "No se pudo entregar",
    },
    upcoming: "pendiente",
  },
  showPassword: "Mostrar contraseña",
  tryAgain: "Reintentar",
};
