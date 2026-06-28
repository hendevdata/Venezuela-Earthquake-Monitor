# 🇻🇪 VEN-SISMO // Monitor Sísmico y Gestión de Afectaciones

VEN-SISMO es un monitor sísmico en tiempo real del Caribe y Venezuela con mapeo de daños estructurales, reportes ciudadanos, búsqueda de personas localizadas y noticias de crisis en vivo. 

El sistema consta de un panel interactivo (frontend) y un servidor backend en Node.js/Express que actúa como base de datos persistente local y proxy inteligente para optimizar el acceso a múltiples servicios externos (USGS, OpenStreetMap Overpass y la API de Zonas Afectadas Venezuela).

---

## 🚀 APIs Públicas Incorporadas (Zonas Afectadas Venezuela)

Para facilitar la colaboración y el desarrollo de herramientas de ayuda humanitaria, se integran e indican las siguientes APIs públicas proporcionadas por [zonasafectadasvenezuela.app](https://zonasafectadasvenezuela.app):

* **Base URL**: `https://zonasafectadasvenezuela.app`
* **Políticas**: CORS Abierto (`*`), Sin Autenticación, Acceso Gratuito y respuestas en formato `JSON`.

### Listado de Endpoints Públicos

| Método | Endpoint | Descripción | Parámetros / Detalles |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/reports` | Reportes de Reporta Venezuela (afectaciones, refugios, acopios). | Opcionales: `?categoria=`, `?severidad=`, `?limit=` |
| **GET** | `/api/reports/:id` | Obtener un reporte específico por su ID. | Excluye datos de contacto para privacidad. |
| **GET** | `/api/stats` | Estadísticas acumuladas y generales de la crisis. | Totales por categoría, gravedad, estado de rescate y fecha de último reporte. |
| **GET** | `/api/feed` | Feed unificado del mapa interactivo. | Agrega reportes locales + reportes de SOS Venezuela con atribución. |
| **GET** | `/api/quakes` | Sismos y réplicas recientes cerca de Venezuela. | USGS, últimos 14 días con magnitud superior a M2.5. |
| **GET** | `/api/news` | Noticias e información de última hora en vivo. | Agregado vía SOS Venezuela. |
| **GET** | `/api/localizados` | Buscador de personas localizadas en refugios u hospitales. | Requerido: `?q=nombre_o_cedula` (Vía Localizados Venezuela). |
| **GET** | `/api/lugares` | Centros de atención con conteo de personas ubicadas. | Lista de hospitales y albergues con su total de localizados. |

> [!NOTE]
> **Atribución de Fuentes**: Las APIs anteriores consolidan información de SOS Venezuela (sosvenezuela2026.com), USGS, y Localizados Venezuela (localizadosvenezuela.com). Por favor, respeta los límites de tasa de las fuentes originales si vas a realizar consumos de alto volumen.

---

## 🛠️ Servidor Backend Local (Proxy y Persistencia)

El backend de este repositorio corre localmente en el puerto `5001` (por defecto) y ofrece endpoints adicionales para la persistencia local de reportes ciudadanos y control de proxies para evitar bloqueos por CORS o límites de peticiones.

### Endpoints del Backend Local (`http://localhost:5001`)

#### 1. Reportes Ciudadanos Locales
* **`GET /api/reports`**: Obtiene todos los reportes de daños guardados localmente.
* **`POST /api/reports`**: Registra un nuevo reporte de daño.
  * **Payload (JSON)**:
    ```json
    {
      "zone": "la_guaira",
      "zoneName": "La Guaira Centro",
      "category": "infrastructure",
      "desc": "Grietas severas en puente peatonal",
      "coords": [10.601, -66.930]
    }
    ```

#### 2. Proxies Sísmicos (USGS Wrapper)
* **`GET /api/seismic`**: Consulta de sismos en base a filtros geográficos y de magnitud. Posee una caché de respaldo local (`earthquakes_cache.json`) por si la API oficial del USGS falla.
  * *Parámetros*: `starttime`, `minlatitude`, `maxlatitude`, `minlongitude`, `maxlongitude`, `minmagnitude`, `orderby`.
* **`GET /api/seismic/detail?url=<USGS_URL>`**: Proxy seguro de detalles PAGER de un sismo específico.
* **`GET /api/seismic/dyfi?url=<DYFI_GEOJSON_URL>`**: Obtiene la malla de intensidad comunitaria "Did You Feel It?" desde el USGS.

#### 3. Proxies de Datos Abiertos de OpenStreetMap (Overpass)
* **`GET /api/osm/damage`**: Obtiene edificaciones reportadas como dañadas o destruidas dentro de un recuadro de coordenadas.
  * *Parámetros*: `south`, `west`, `north`, `east`.
* **`GET /api/osm/roads`**: Devuelve vías obstruidas, derrumbes o zonas restringidas del estado La Guaira (delimitado en el backend).

#### 4. Proxies para Zonas Afectadas Venezuela
El servidor local también actúa como proxy para los servicios externos para simplificar el flujo del frontend:
* **`GET /api/external/feed`** $\rightarrow$ `https://www.zonasafectadasvenezuela.app/api/feed`
* **`GET /api/people/search?q=<query>`** $\rightarrow$ `https://www.zonasafectadasvenezuela.app/api/localizados?q=<query>`
* **`GET /api/external/news`** $\rightarrow$ `https://www.zonasafectadasvenezuela.app/api/news`

---

## 💻 Instalación y Ejecución Local

### Prerrequisitos
* Node.js v18.0 o superior
* npm

### Pasos
1. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```
2. Inicia el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```
3. Abre tu navegador en [http://localhost:5001](http://localhost:5001) para ver la interfaz interactiva.

### Estructura de Persistencia
* **`database.json`**: Guarda de forma persistente los reportes de daños estructurales creados a través de la aplicación.
* **`earthquakes_cache.json`**: Archivo de caché que resguarda la última consulta de sismos exitosa para garantizar el funcionamiento offline o en caso de caída del USGS.

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia MIT.
