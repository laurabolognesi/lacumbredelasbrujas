# Arquitectura AR Cumbre

## Superficies que se conservan

- `index.html`: lector público de la portada y tráiler vertical. No depende del laboratorio interior.
- La administración de contenidos continúa siendo una capa privada separada. El registro `content/scenes.json` funciona como contrato de datos para conectarla sin acoplarla al render 3D.
- `diorama.html`: laboratorio y futura entrada al lector de ilustraciones interiores.

## Módulo reutilizable

Cada diorama se registra por `id` y se carga dinámicamente desde `scene-registry.js`. Una escena debe exponer:

- `createScene(context)`;
- `update(time)`;
- `replay()`;
- `dispose()`.

`dispose()` es obligatorio: libera geometrías, materiales y texturas y elimina el grupo de Three.js antes de cargar otra escena.

## Flujo interior previsto

1. El panel privado registra una ilustración, su índice MindAR, escena, textos autorizados y fallback.
2. Las imágenes se compilan juntas en `assets/targets/interiores.mind`.
3. MindAR detecta el `targetIndex`.
4. El registro carga únicamente el módulo asociado.
5. Al perder o cambiar de marcador, se detiene y libera la escena previa.
6. Si no hay WebGL suficiente, se usa el respaldo 2.5D o un video directo.

## Rendimiento

- `high`: sombras, más humo y brasas, densidad completa.
- `low`: sin sombras, menos partículas y menor resolución.
- `fallback`: composición 2.5D sin WebGL.

El perfil se selecciona con capacidades del dispositivo. Para pruebas manuales:

- `diorama.html?quality=high`
- `diorama.html?quality=low`
- `diorama.html?quality=fallback`
- `diorama.html?ar=1` cuando exista el archivo `.mind`.

## Presupuesto

La escena de prueba es procedural y no descarga modelos GLB. Los dioramas finales deberán mantener:

- GLB/Draco o Meshopt: 1.5–3 MB;
- texturas WebP/KTX2: 1–2 MB;
- audio opcional: 0.5–1 MB;
- total objetivo: 3–6 MB por diorama.
