# AITurbidez

**AITurbidez** es una prueba de concepto que entrena un modelo para estimar la
concentración de monóxido de carbono (`CO`) en una turbina de gas. Utiliza el
conjunto de datos UCI 551.

## Estado

El proyecto contiene dos componentes independientes:

- `train.py` descarga los datos UCI, entrena y evalúa modelos, y guarda el
  artefacto y una muestra localmente.
- `app.py` expone `POST /predict`, que actualmente devuelve metadatos del
  conjunto UCI. No carga el artefacto ni genera predicciones.

La integración del modelo en la API todavía no está implementada.

## Estructura del proyecto

| Archivo | Descripción |
| --- | --- |
| `train.py` | Entrenamiento y evaluación. |
| `app.py` | API Flask de demostración. |
| `requirements.txt` | Dependencias de Python. |
| `modelo_entrenado.pkl` | Artefacto local de entrenamiento con modelos y metadatos. |
| `muestra.json` | Muestra de entrada generada durante el entrenamiento. |

El entrenamiento genera `modelo_entrenado.pkl` y `muestra.json` en la raíz.
Carga únicamente archivos pickle de origen confiable: deserializarlos puede
ejecutar código.

## Requisitos y puesta en marcha

Se requiere Python y conexión a Internet para descargar el conjunto de datos
desde UCI. En PowerShell, desde la raíz del proyecto:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python train.py
```

El script genera o reemplaza `modelo_entrenado.pkl` y `muestra.json`, e imprime
`R²`, `MAE` y una comparación de predicciones para una fila de prueba.

Para iniciar la API de demostración:

```powershell
python app.py
```

La aplicación escucha en el puerto `5000`, con depuración activada y en todas
las interfaces. Esta configuración es solo para desarrollo y no debe exponerse
a Internet ni a redes no confiables.

## Modelo de entrenamiento

### Datos y variables

El objetivo de regresión es `CO`. El modelo recibe estas nueve variables, en el
orden guardado en el artefacto:

| Variable | Descripción |
| --- | --- |
| `AT` | Temperatura ambiente |
| `AP` | Presión ambiente |
| `AH` | Humedad ambiente |
| `AFDP` | Presión diferencial del filtro de aire |
| `GTEP` | Presión de escape de la turbina de gas |
| `TIT` | Temperatura de entrada de la turbina |
| `TAT` | Temperatura de salida de la turbina |
| `TEY` | Energía de salida de la turbina |
| `CDP` | Presión de descarga del compresor |

Para definiciones de ingeniería y unidades, consulta la documentación del
conjunto UCI.

### Entrenamiento y evaluación

`train.py` valida que las variables no tengan valores ausentes y divide los
datos sin mezclar las filas: 60 % para entrenamiento y 40 % para prueba.
Entrena dos estimadores:

- **Random Forest (`RandomForestRegressor`)** con 100 árboles: modelo principal
  para la estimación de `CO`.
- **Dummy (`DummyRegressor`)** que predice el promedio: referencia sencilla
  para comparar el valor del modelo principal.

El script calcula `R²` y el error absoluto medio (`MAE`) para Random Forest.
Estas métricas permiten una evaluación inicial, pero no garantizan por sí
solas que el modelo generalice a otros períodos, turbinas o condiciones de
operación.

### Contenido del artefacto

El diccionario guardado en `modelo_entrenado.pkl` contiene:

| Clave | Contenido |
| --- | --- |
| `modelo` | Random Forest entrenado. |
| `referencia` | Dummy de referencia entrenado. |
| `entradas` | Nombres y orden esperado de las variables de entrada. |
| `objetivo` | Nombre de la variable estimada: `CO`. |

Para inferir, un consumidor debe cargar el artefacto confiable con `joblib`,
construir una tabla que contenga todas las variables en el formato esperado y
usar `paquete["modelo"].predict(datos)`. Esa lógica aún no está integrada en
`app.py`.

## API disponible actualmente

`POST /predict` consulta UCI en cada petición, comprueba que los datos estén
disponibles y devuelve los nombres de las columnas y las dimensiones:

La ruta no valida entradas de predicción, no carga `modelo_entrenado.pkl` ni
estima `CO`; es demostrativa y no está lista para inferencia.

## Próximos pasos

La API deberá validar las nueve variables de entrada, cargar una versión
aprobada del artefacto y devolver la predicción de `CO`. Antes de desplegarla,
se requieren pruebas, autenticación y configuración segura del servicio. Estas
funciones aún no están implementadas.

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
