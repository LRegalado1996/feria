export const auth = {
  errors: {
    invalidCredentials: "El email o la contraseña no son correctos.",
    loginDisabled:
      "Este usuario está deshabilitado. Pedile a alguien del equipo que lo habilite.",
    unreachable:
      "No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo.",
  },
  fields: {
    email: { label: "Email", placeholder: "vos@ejemplo.com" },
    password: { label: "Contraseña" },
  },
  signIn: {
    failed: "No pudimos iniciar la sesión. Probá de nuevo.",
    pending: "Iniciando sesión…",
    submit: "Iniciar sesión",
  },
  signOut: {
    failed: "Tu sesión sigue abierta. Probá de nuevo.",
    pending: "Cerrando sesión…",
    submit: "Cerrar sesión",
  },
  validation: {
    emailInvalid: "Ingresá un email válido",
    passwordTooShort: "La contraseña debe tener al menos 8 caracteres",
  },
};
