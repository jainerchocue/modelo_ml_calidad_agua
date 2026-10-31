# qaterMLdetect

**qaterMLdetect** es un proyecto de machine learning orientado a estimar cuatro
parámetros de calidad del agua: turbidez, temperatura, conductividad y pH.

## Estado

El código disponible todavía no implementa ese objetivo. `train.py` descarga
el conjunto UCI 551, correspondiente a una turbina de gas, y entrena un modelo
para estimar monóxido de carbono (`CO`). `app.py` ofrece `POST /predict`, que
consulta ese conjunto y devuelve metadatos; no carga el modelo ni realiza
predicciones.

Por tanto, el prototipo actual no predice turbidez, temperatura, conductividad
ni pH. Para implementar qaterMLdetect se necesita integrar datos de calidad
del agua adecuados y entrenar y evaluar el modelo para esos cuatro objetivos.

## Estructura del proyecto

| Archivo | Descripción |
| --- | --- |
| `train.py` | Entrenamiento y evaluación. |
| `app.py` | API Flask de demostración. |
| `requirements.txt` | Dependencias de Python. |
| `modelo_entrenado.pkl` | Artefacto local de entrenamiento con modelos y metadatos. |
| `muestra.json` | Muestra de entrada generada durante el entrenamiento. |

El prototipo actual genera `modelo_entrenado.pkl` y `muestra.json` en la raíz.
Carga únicamente archivos pickle de origen confiable: deserializarlos puede
ejecutar código.

## Requisitos y puesta en marcha

Para ejecutar el prototipo actual se requiere Python y conexión a Internet
para descargar los datos UCI. En PowerShell, desde la raíz del proyecto:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python train.py
```

El script genera o reemplaza `modelo_entrenado.pkl` y `muestra.json`, e imprime
`R²`, `MAE` y una comparación de predicciones para una fila de prueba. Estos
resultados corresponden a la estimación de `CO` del prototipo, no a los cuatro
parámetros de calidad del agua.

Para iniciar la API de demostración:

```powershell
python app.py
```

La aplicación escucha en el puerto `5000`, con depuración activada y en todas
las interfaces. Esta configuración es solo para desarrollo y no debe exponerse
a Internet ni a redes no confiables.

## Prototipo de entrenamiento actual

El prototipo usa nueve variables de operación de turbina (`AT`, `AP`, `AH`,
`AFDP`, `GTEP`, `TIT`, `TAT`, `TEY` y `CDP`) para estimar `CO`. Entrena un
`RandomForestRegressor` y un `DummyRegressor` de referencia; divide los datos
sin mezclarlos en 60 % para entrenamiento y 40 % para prueba, y calcula `R²` y
el error absoluto medio (`MAE`). Este flujo es independiente del objetivo de
calidad del agua de qaterMLdetect.

## API actual

`POST /predict` consulta el conjunto UCI 551 y devuelve nombres de columnas y
dimensiones. No acepta mediciones de calidad del agua ni devuelve turbidez,
temperatura, conductividad o pH.

## Próximos pasos

Para cumplir el objetivo de qaterMLdetect, se debe seleccionar un conjunto de
datos de calidad del agua con las variables de entrada y los cuatro valores
objetivo; entrenar y validar las predicciones; y adaptar la API para recibir
mediciones y devolver resultados. Estas funciones aún no están implementadas.

## Acceso, propiedad intelectual y licencias

### Acceso y uso con autorización previa

Este proyecto no se distribuye bajo una licencia open source. Para solicitar
acceso con fines de evaluación, pruebas o desarrollo, escribe a
[programacion133@gmail.com](mailto:programacion133@gmail.com) e indica tu
identidad, propósito y uso previsto. El acceso requiere aprobación previa y
por escrito del equipo de investigación y Helio Mind Labs (HML); enviar una
solicitud no concede autorización.

El trabajo autorizado debe realizarse mediante un **fork de GitHub** del
repositorio original, conservando los avisos de autoría. No se permite copiar
el código a un repositorio independiente. Los investigadores que se incorporen
al equipo deben cumplir las mismas condiciones. El permiso de acceso o prueba
no autoriza publicar el fork ni redistribuir el código o sus derivados; para
ello se requiere autorización escrita adicional.

El repositorio debe ser privado y el acceso limitarse a las personas
aprobadas. Si es público, GitHub no puede impedir que otras personas vean o
creen forks; este aviso no aplica controles técnicos. Las licencias y
condiciones de terceros, incluidos los datos de UCI y las dependencias, deben
respetarse por separado.
