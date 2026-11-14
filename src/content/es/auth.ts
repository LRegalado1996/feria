export const auth = {
  errors: {
    invalidCredentials: "El email o la contraseña no son correctos.",
    unreachable:
      "No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo.",
    userExists: "Ya existe una cuenta con este email.",
  },
  fields: {
    email: { label: "Email", placeholder: "vos@ejemplo.com" },
    name: { label: "Nombre", placeholder: "Tu nombre" },
    password: { label: "Contraseña" },
  },
  signIn: {
    failed: "No pudimos iniciar la sesión. Probá de nuevo.",
    pending: "Iniciando sesión…",
    submit: "Iniciar sesión",
    switchTo: "¿No tenés una cuenta? Registrate",
  },
  signOut: {
    failed: "Tu sesión sigue abierta. Probá de nuevo.",
    pending: "Cerrando sesión…",
    submit: "Cerrar sesión",
  },
  signUp: {
    failed: "No pudimos crear la cuenta. Probá de nuevo.",
    pending: "Creando cuenta…",
    submit: "Crear cuenta",
    switchTo: "¿Ya tenés una cuenta? Iniciá sesión",
  },
  validation: {
    emailInvalid: "Ingresá un email válido",
    nameTooShort: "El nombre debe tener al menos 2 caracteres",
    passwordTooShort: "La contraseña debe tener al menos 8 caracteres",
  },
  welcome: {
    subtitle: "Iniciá sesión en tu cuenta para continuar",
    title: "Hola de nuevo",
  },
};
