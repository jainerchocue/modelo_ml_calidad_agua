# Guía de contribución

Este proyecto se desarrolla mediante la colaboración entre
HelioMindLabs y el equipo de investigación, como entidades distintas.

Esta guía establece cómo proponer, revisar e integrar cambios
en el repositorio.

## 1. Coordinar antes de modificar

Antes de iniciar una modificación, acuerda con las personas
responsables su objetivo y alcance para evitar trabajo duplicado
o cambios incompatibles con la implementación actual.

Los cambios en la estructura del proyecto, las dependencias,
los modelos o la comunicación entre componentes deben coordinarse
previamente.

## 2. Trabajar en una rama independiente

- No subir cambios directamente a `main`.
- Crear una rama para cada tarea o corrección.
- Utilizar nombres descriptivos, como `feat/procesamiento-datos`,
  `fix/validacion-variables` o `docs/instrucciones-instalacion`.
- Mantener los cambios relacionados con el objetivo de la tarea.

## 3. Respetar la comunicación entre componentes

No cambiar sin coordinación previa:

- Los nombres y tipos de las variables compartidas.
- Las unidades de medida y los rangos esperados.
- Los campos y formatos de los mensajes o archivos intercambiados.
- Las rutas de API y los parámetros de entrada y salida, cuando apliquen.

Si un cambio es necesario, documentar su motivo e identificar
