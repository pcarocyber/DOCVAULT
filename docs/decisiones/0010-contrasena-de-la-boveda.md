# 0010 · Contraseña de la bóveda

Fecha: 2026-11-26 · Pedro eligió «Una contraseña para toda la bóveda».

## Qué hace

- Botón **Contraseña** arriba: crear, cambiar o quitar la contraseña. Mínimo 6 caracteres.
- Al crearla se muestra una sola vez un **código de recuperación** (16 letras y números, sin
  0/O/1/I/L). Si se olvida la contraseña, ese código permite crear otra.
- Se pide al **abrir un documento por su código**: cámara, lector USB, Enter en el buscador o un
  enlace `#DV-000123`. Abrir una tarjeta con un clic no la pide (así lo pidió Pedro: al escanear).
- Después de escribirla, durante **5 minutos** no se vuelve a pedir. Tras 5 intentos fallidos,
  hay que esperar 30 segundos.
- Cambiarla o quitarla pide la actual o el código de recuperación.

## Dónde se guarda

En `.docvault/clave.json` dentro de la carpeta, para que viaje con la bóveda. Solo se guarda
una **huella** (PBKDF2-SHA256, 600 000 vueltas, sal aleatoria), nunca la contraseña ni el código.

## Límite (dicho a Pedro)

Protege el acceso **desde DOCVAULT**. Los archivos no se cifran: quien use la computadora puede
abrirlos desde Finder, o borrar `clave.json`. Cifrar los archivos es un trabajo aparte (fase 2,
con la sincronización cifrada del plan técnico).
